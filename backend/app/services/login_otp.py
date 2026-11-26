from datetime import datetime, timedelta, timezone
from hashlib import sha256
import hmac
from math import ceil
import re
import secrets

from fastapi import HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from app.config import settings
from app.db.db_models import LoginChallenge, User
from app.services.otp_email import EmailDeliveryError, send_login_code

OTP_COOKIE = "login_challenge"
OTP_AGE = 300
RESEND_WAIT = 60
MAX_ATTEMPTS = 5


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _secret() -> bytes:
    key = settings.otp_secret.get_secret_value().encode("utf-8")
    if len(key) < 32:
        raise HTTPException(503, "E-poçtla təsdiqləmə hazırda əlçatan deyil.")
    return key


def _mac(key: bytes, token_hash: str, code: str) -> str:
    return hmac.new(key, f"{token_hash}:{code}".encode(), sha256).hexdigest()


def _expired() -> HTTPException:
    return HTTPException(410, "Kod artıq qüvvədə deyil. Şifrə ilə yenidən daxil ol.")


def _rate_limited(issued_at: datetime, now: datetime) -> HTTPException:
    retry = max(1, ceil((issued_at + timedelta(seconds=RESEND_WAIT) - now).total_seconds()))
    return HTTPException(429, "Yeni kod üçün bir az gözlə.", headers={"Retry-After": str(retry)})


def _token_hash(token: str | None) -> str | None:
    if token and re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        return sha256(token.encode()).hexdigest()
    return None


def _active(token_hash: str, now: datetime):
    return (
        LoginChallenge.token_hash == token_hash,
        LoginChallenge.delivered.is_(True),
        LoginChallenge.expires_at > now,
        LoginChallenge.attempts_left > 0,
    )


def _new_code(key: bytes, now: datetime, previous: LoginChallenge | None) -> tuple[str, str, dict]:
    token = secrets.token_urlsafe(32)
    token_hash = sha256(token.encode()).hexdigest()
    code = f"{secrets.randbelow(1_000_000):06d}"
    while previous and hmac.compare_digest(_mac(key, previous.token_hash, code), previous.code_mac):
        code = f"{secrets.randbelow(1_000_000):06d}"
    return token, code, {
        "token_hash": token_hash,
        "code_mac": _mac(key, token_hash, code),
        "issued_at": now,
        "expires_at": now + timedelta(seconds=OTP_AGE),
        "attempts_left": MAX_ATTEMPTS,
        "delivered": False,
    }


def issue(db: Session, user: User, previous: LoginChallenge | None = None) -> str:
    key = _secret()
    now = _now()
    user_id, email = user.id, user.email
    if previous and previous.issued_at + timedelta(seconds=RESEND_WAIT) > now:
        raise _rate_limited(previous.issued_at, now)
    token, code, values = _new_code(key, now, previous)
    if previous:
        statement = update(LoginChallenge).where(
            *_active(previous.token_hash, now),
            LoginChallenge.issued_at <= now - timedelta(seconds=RESEND_WAIT),
        ).values(**values)
    else:
        statement = insert(LoginChallenge).values(user_id=user_id, **values).on_conflict_do_update(
            index_elements=[LoginChallenge.user_id], set_=values,
            where=LoginChallenge.issued_at <= now - timedelta(seconds=RESEND_WAIT),
        )
    if not db.execute(statement).rowcount:
        db.rollback()
        if previous:
            raise _expired()
        last_issued = db.scalar(select(LoginChallenge.issued_at).where(LoginChallenge.user_id == user_id))
        raise _rate_limited(last_issued or now, now)
    db.commit()

    # Hold no SQLite writer lock during SMTP. A pending code cannot be verified.
    reservation = (
        LoginChallenge.user_id == user_id,
        LoginChallenge.token_hash == values["token_hash"],
        LoginChallenge.code_mac == values["code_mac"],
    )
    try:
        send_login_code(email, code)
    except EmailDeliveryError:
        db.execute(update(LoginChallenge).where(*reservation).values(code_mac="", attempts_left=0))
        db.commit()
        raise HTTPException(503, "Giriş kodunu göndərmək alınmadı. Bir az sonra yenidən cəhd et.") from None

    sent_at = _now()
    activated = db.execute(update(LoginChallenge).where(*reservation).values(
        delivered=True, issued_at=sent_at, expires_at=sent_at + timedelta(seconds=OTP_AGE),
    ))
    db.commit()
    if not activated.rowcount:
        raise _expired()
    return token


def _find_active(db: Session, token: str | None, now: datetime) -> LoginChallenge:
    digest = _token_hash(token)
    challenge = db.scalar(select(LoginChallenge).where(*_active(digest, now))) if digest else None
    if not challenge:
        raise _expired()
    return challenge


def resend(db: Session, token: str | None) -> str:
    challenge = _find_active(db, token, _now())
    user = db.get(User, challenge.user_id)
    if not user:
        raise _expired()
    return issue(db, user, challenge)


def consume(db: Session, token: str | None, code: str) -> User:
    now = _now()
    challenge = _find_active(db, token, now)
    active = _active(challenge.token_hash, now)
    if not re.fullmatch(r"[0-9]{6}", code):
        raise HTTPException(400, "Altı rəqəmli kodu daxil et.")
    if not hmac.compare_digest(challenge.code_mac, _mac(_secret(), challenge.token_hash, code)):
        attempted = db.execute(update(LoginChallenge).where(*active).values(
            attempts_left=LoginChallenge.attempts_left - 1,
        ))
        db.commit()
        if not attempted.rowcount:
            raise _expired()
        raise HTTPException(400, "Giriş kodu yanlışdır.")

    user_id = db.scalar(delete(LoginChallenge).where(*active).returning(LoginChallenge.user_id))
    user = db.get(User, user_id) if user_id is not None else None
    if not user:
        raise _expired()
    # The route commits this deletion together with creation of the verified session.
    return user


def invalidate(db: Session, token: str | None) -> None:
    digest = _token_hash(token)
    if digest:
        db.execute(update(LoginChallenge).where(LoginChallenge.token_hash == digest).values(
            code_mac="", attempts_left=0, delivered=False,
        ))
