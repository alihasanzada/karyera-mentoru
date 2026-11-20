from datetime import datetime, timedelta, timezone
from hashlib import scrypt, sha256
import re
import secrets
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, StringConstraints, field_validator
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.db_models import LoginSession, User
from app.db.profile_migration import has_legacy_design_columns
from app.deps import current_user
from app.models.schemas import ProfileInput
from app.routers.profile import load_profile, store_profile
from app.services.matcher import ROLES

router = APIRouter(prefix="/api/auth", tags=["Auth"])
SESSION_DAYS = 7
MIN_PASSWORD = 8

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=60)]


def _known_specialty(value: str) -> str:
    if value not in ROLES:
        raise ValueError("Naməlum ixtisas. Siyahıdan ixtisas seç.")
    return value


class Credentials(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Düzgün e-poçt daxil et.")
        return value


class SignupData(Credentials):
    password: str = Field(min_length=MIN_PASSWORD, max_length=128)
    first_name: Name
    last_name: Name
    specialty_id: str
    consent: Literal[True]

    _specialty = field_validator("specialty_id")(_known_specialty)


class ProfileUpdate(BaseModel):
    first_name: Name | None = None
    last_name: Name | None = None
    specialty_id: str | None = None

    @field_validator("specialty_id")
    @classmethod
    def known_specialty(cls, value: str | None) -> str | None:
        return None if value is None else _known_specialty(value)


def _public(user: User, profile: ProfileInput) -> dict:
    return {"id": user.id, "email": user.email, "first_name": profile.name,
            "last_name": profile.surname, "specialty_id": profile.field_id}


def _hash_password(password: str, salt: bytes) -> str:
    digest = scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)
    return salt.hex() + ":" + digest.hex()


def _create_user(db: Session, email: str, password_hash: str) -> User:
    if has_legacy_design_columns(db.connection()):
        # Some design databases have NOT NULL legacy columns without server defaults.
        user_id = db.execute(text(
            "INSERT INTO users (email, password_hash, created_at, first_name, last_name, specialty_id) "
            "VALUES (:email, :password_hash, :created_at, '', '', '') RETURNING id"
        ), {"email": email, "password_hash": password_hash,
            "created_at": datetime.now(timezone.utc).replace(tzinfo=None)}).scalar_one()
        return db.get(User, user_id)
    user = User(email=email, password_hash=password_hash)
    db.add(user)
    db.flush()
    return user


def _login(response: Response, request: Request, db: Session, user: User):
    token = secrets.token_urlsafe(32)
    db.add(LoginSession(token_hash=sha256(token.encode()).hexdigest(), user_id=user.id,
                        expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)))
    db.commit()
    response.set_cookie("session", token, max_age=SESSION_DAYS * 86400,
                        httponly=True, secure=request.url.scheme == "https", samesite="strict", path="/")
    return _public(user, load_profile(db, user.id))


@router.post("/signup", status_code=201)
def signup(data: SignupData, db: Session = Depends(get_db)):
    profile = ProfileInput(name=data.first_name, surname=data.last_name, field_id=data.specialty_id)
    try:
        user = _create_user(db, data.email, _hash_password(data.password, secrets.token_bytes(16)))
        store_profile(db, user.id, profile)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Bu e-poçt artıq qeydiyyatdan keçib.")
    db.refresh(user)
    # No session here: the user signs in explicitly after creating the account.
    return _public(user, profile)


@router.post("/login")
def login(data: Credentials, response: Response, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email))
    if not user:
        _hash_password(data.password, b"\0" * 16)
        raise HTTPException(status_code=401, detail="E-poçt və ya parol yanlışdır.")
    salt = bytes.fromhex(user.password_hash.split(":")[0])
    if not secrets.compare_digest(_hash_password(data.password, salt), user.password_hash):
        raise HTTPException(status_code=401, detail="E-poçt və ya parol yanlışdır.")
    return _login(response, request, db, user)


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _public(user, load_profile(db, user.id))


@router.patch("/me")
def update_me(data: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    profile = load_profile(db, user.id)
    names = {"first_name": "name", "last_name": "surname", "specialty_id": "field_id"}
    updates = {names[key]: value for key, value in data.model_dump(exclude_none=True).items()}
    updated = profile.model_copy(update=updates)
    store_profile(db, user.id, updated)
    db.commit()
    return _public(user, updated)


@router.post("/logout")
def logout(response: Response, request: Request, db: Session = Depends(get_db)):
    session = request.cookies.get("session")
    if session:
        login = db.get(LoginSession, sha256(session.encode()).hexdigest())
        if login:
            db.delete(login)
            db.commit()
    response.delete_cookie("session", path="/")
    return {"ok": True}
