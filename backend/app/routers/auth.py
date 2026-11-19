from datetime import datetime, timedelta, timezone
from hashlib import scrypt, sha256
import re
import secrets
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, StringConstraints, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.db_models import LoginSession, User
from app.deps import current_user
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


def _public(user: User) -> dict:
    return {"id": user.id, "email": user.email, "first_name": user.first_name,
            "last_name": user.last_name, "specialty_id": user.specialty_id}


def _hash_password(password: str, salt: bytes) -> str:
    digest = scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)
    return salt.hex() + ":" + digest.hex()


def _login(response: Response, request: Request, db: Session, user: User):
    token = secrets.token_urlsafe(32)
    db.add(LoginSession(token_hash=sha256(token.encode()).hexdigest(), user_id=user.id,
                        expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)))
    db.commit()
    response.set_cookie("session", token, max_age=SESSION_DAYS * 86400,
                        httponly=True, secure=request.url.scheme == "https", samesite="strict", path="/")
    return _public(user)


@router.post("/signup", status_code=201)
def signup(data: SignupData, db: Session = Depends(get_db)):
    user = User(email=data.email, password_hash=_hash_password(data.password, secrets.token_bytes(16)),
                first_name=data.first_name, last_name=data.last_name, specialty_id=data.specialty_id)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Bu e-poçt artıq qeydiyyatdan keçib.")
    db.refresh(user)
    # No session here: the user signs in explicitly after creating the account.
    return _public(user)


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
def me(user: User = Depends(current_user)):
    return _public(user)


@router.patch("/me")
def update_me(data: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return _public(user)


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
