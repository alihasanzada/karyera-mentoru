from datetime import datetime, timezone
from hashlib import sha256

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.db_models import LoginSession, User


def current_user(session: str | None = Cookie(default=None), db: Session = Depends(get_db)) -> User:
    if not session:
        raise HTTPException(status_code=401, detail="Hesabına daxil ol.")
    login = db.get(LoginSession, sha256(session.encode()).hexdigest())
    if not login or login.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Sessiya bitib. Yenidən daxil ol.")
    user = db.get(User, login.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Hesab tapılmadı.")
    return user


def get_client_id(user: User = Depends(current_user)) -> str:
    return f"user-{user.id}"
