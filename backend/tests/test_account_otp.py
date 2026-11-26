from contextlib import contextmanager
from datetime import datetime, timedelta
from hashlib import sha256
import json
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
import pytest
from pydantic import SecretStr
from sqlalchemy import URL, create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.db.database import Base, get_db
from app.db.db_models import LoginChallenge, LoginSession, RoadmapRecord, User, UserProfile
from app.main import app
from app.models.schemas import MentorReply
from app.routers import mentor
from app.services import history, login_otp
from app.services.otp_email import EmailDeliveryError
from auth_helpers import verify_login
from test_api import evaluation, plan_payload  # evaluation is a shared synthetic pytest fixture


CREDENTIALS = {"email": "account-otp@example.test", "password": "synthetic-original-password"}
SIGNUP = {
    **CREDENTIALS, "first_name": "Demo", "last_name": "User", "specialty_id": "cybersecurity", "consent": True,
}


@contextmanager
def database_client(path):
    engine = create_engine(URL.create("sqlite", database=str(path)), connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)

    def test_db():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = test_db
    try:
        with TestClient(app, base_url="https://testserver") as client:
            yield client, factory
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()


@pytest.fixture
def otp_client(tmp_path):
    with database_client(tmp_path / "accounts.db") as (client, factory):
        assert client.post("/api/auth/signup", json=SIGNUP).status_code == 201
        yield client, factory


def request_challenge(client, mail):
    response = client.post("/api/auth/login", json=CREDENTIALS)
    assert response.status_code == 202
    assert response.json() == {"expires_in": 300, "resend_after": 60}
    assert "session" not in response.cookies
    assert mail.call_args.args[0] == CREDENTIALS["email"]
    return response, mail.call_args.args[1]


def test_otp_gate_and_single_use(otp_client, delivered_mail):
    client, factory = otp_client
    response, code = request_challenge(client, delivered_mail)
    challenge_cookie = response.cookies[login_otp.OTP_COOKIE]
    cookie_header = response.headers["set-cookie"].lower()
    assert all(flag in cookie_header for flag in ("httponly", "secure", "samesite=strict", "path=/api/auth"))
    assert code not in response.text
    with factory() as db:
        challenge = db.scalar(select(LoginChallenge))
        assert challenge.token_hash == sha256(challenge_cookie.encode()).hexdigest()
        assert len(challenge.code_mac) == 64 and challenge.code_mac != code
        assert db.scalar(select(func.count()).select_from(LoginSession)) == 0
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/profile").status_code == 401
    assert client.get("/api/mentor/history").status_code == 401
    verified = client.post("/api/auth/otp/verify", json={"code": code})
    assert verified.status_code == 200
    assert "session" in verified.cookies
    assert client.get("/api/auth/me").status_code == 200
    assert client.post("/api/auth/otp/verify", json={"code": code},
                       headers={"Cookie": f"{login_otp.OTP_COOKIE}={challenge_cookie}"}).status_code == 410
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(LoginChallenge)) == 0
        assert db.scalar(select(func.count()).select_from(LoginSession)) == 1


def test_previous_password_only_session_is_rejected(otp_client):
    client, factory = otp_client
    legacy_token = "synthetic-legacy-password-only-session"
    with factory() as db:
        user_id = db.scalar(select(User.id))
        db.add(LoginSession(
            token_hash=sha256(legacy_token.encode()).hexdigest(), user_id=user_id,
            expires_at=login_otp._now() + timedelta(days=1),
        ))
        db.commit()
    assert client.get("/api/auth/me", headers={"Cookie": f"session={legacy_token}"}).status_code == 401


def test_attempt_limit_and_cancel(otp_client, delivered_mail):
    client, factory = otp_client
    _, good = request_challenge(client, delivered_mail)
    bad = f"{(int(good) + 1) % 1_000_000:06d}"
    for _ in range(5):
        result = client.post("/api/auth/otp/verify", json={"code": bad})
        assert result.status_code == 400
        assert bad not in result.text
    assert client.post("/api/auth/otp/verify", json={"code": good}).status_code == 410
    assert client.post("/api/auth/otp/resend").status_code == 410
    assert client.post("/api/auth/otp/cancel").status_code == 200
    with factory() as db:
        challenge = db.scalar(select(LoginChallenge))
        assert not challenge.delivered and not challenge.code_mac
        assert db.scalar(select(func.count()).select_from(LoginSession)) == 0


def test_expiry_at_five_minutes(otp_client, delivered_mail, monkeypatch):
    client, _ = otp_client
    start = datetime(2026, 11, 26, 12, 0)
    monkeypatch.setattr(login_otp, "_now", lambda: start)
    _, code = request_challenge(client, delivered_mail)
    monkeypatch.setattr(login_otp, "_now", lambda: start + timedelta(minutes=5))
    assert client.post("/api/auth/otp/verify", json={"code": code}).status_code == 410
    assert client.post("/api/auth/otp/resend").status_code == 410


def test_resend_rotates_cookie_and_code_at_sixty_seconds(otp_client, delivered_mail, monkeypatch):
    client, _ = otp_client
    start = datetime(2026, 11, 26, 12, 0)
    monkeypatch.setattr(login_otp, "_now", lambda: start)
    first, old_code = request_challenge(client, delivered_mail)
    original = first.cookies[login_otp.OTP_COOKIE]
    assert client.post("/api/auth/login", json=CREDENTIALS).status_code == 429
    monkeypatch.setattr(login_otp, "_now", lambda: start + timedelta(seconds=59))
    early = client.post("/api/auth/otp/resend")
    assert early.status_code == 429 and early.headers["Retry-After"] == "1"
    assert delivered_mail.call_count == 1
    monkeypatch.setattr(login_otp, "_now", lambda: start + timedelta(seconds=60))
    resent = client.post("/api/auth/otp/resend")
    assert resent.status_code == 202
    assert resent.cookies[login_otp.OTP_COOKIE] != original
    code = delivered_mail.call_args.args[1]
    assert code != old_code
    assert client.post("/api/auth/otp/verify", json={"code": code},
                       headers={"Cookie": f"{login_otp.OTP_COOKIE}={original}"}).status_code == 410
    assert client.post("/api/auth/otp/verify", json={"code": old_code}).status_code == 400
    assert client.post("/api/auth/otp/verify", json={"code": code}).status_code == 200


def test_smtp_failure_never_grants_authentication(otp_client, delivered_mail, caplog):
    client, factory = otp_client
    delivered_mail.side_effect = EmailDeliveryError("synthetic upstream diagnostic")
    response = client.post("/api/auth/login", json=CREDENTIALS)
    assert response.status_code == 503
    assert "synthetic upstream diagnostic" not in response.text + caplog.text
    assert not response.cookies
    assert client.get("/api/auth/me").status_code == 401
    with factory() as db:
        challenge = db.scalar(select(LoginChallenge))
        assert not challenge.delivered and not challenge.code_mac and challenge.attempts_left == 0
        assert db.scalar(select(func.count()).select_from(LoginSession)) == 0


def test_missing_secret_and_otp_endpoints_rate_limit(otp_client, delivered_mail, monkeypatch):
    client, _ = otp_client
    monkeypatch.setattr(login_otp.settings, "otp_secret", SecretStr(""))
    assert client.post("/api/auth/login", json=CREDENTIALS).status_code == 503
    delivered_mail.assert_not_called()
    for _ in range(10):
        assert client.post("/api/auth/otp/resend").status_code == 410
    limited = client.post("/api/auth/otp/verify", json={"code": "000000"})
    assert limited.status_code == 429 and int(limited.headers["Retry-After"]) > 0


def test_account_and_owned_data_survive_logout_and_reopen(tmp_path, evaluation, monkeypatch):
    database = tmp_path / "persistence.db"
    monkeypatch.setattr(mentor, "generate_structured", AsyncMock(return_value=MentorReply(answer="Python ilə başla.")))
    with database_client(database) as (client, factory):
        with factory() as db:
            assert db.scalar(select(func.count()).select_from(User)) == 0
        assert client.post("/api/auth/signup", json=SIGNUP).status_code == 201
        assert client.post("/api/auth/signup", json={**SIGNUP, "password": "different-password"}).status_code == 409
        with factory() as db:
            user = db.scalar(select(User))
            user_id, password_hash = user.id, user.password_hash
            assert password_hash != CREDENTIALS["password"] and ":" in password_hash
            assert db.get(UserProfile, user_id) is not None
        verified = verify_login(client, CREDENTIALS)
        old_session = verified.cookies["session"]
        with factory() as db:
            owner = f"user-{user_id}"
            evaluation_id = history.save_record(db, owner, "evaluation", "fictional-cv.pdf", evaluation,
                                                field_id="cybersecurity")
            db.add(RoadmapRecord(client_id=owner, evaluation_id=evaluation_id,
                                 llm_json=json.dumps(plan_payload("day", (1, 8, 15)))))
            db.commit()
        roadmap = f"/api/roadmap/{evaluation_id}"
        assert client.put(f"{roadmap}/tasks/foundation-0", json={"completed": True}).status_code == 200
        created = client.post("/api/applications", json={"company": "Nümunə", "position": "Təcrübəçi"})
        assert created.status_code == 201
        assert client.post("/api/mentor", json={"question": "Haradan başlayım?"}).status_code == 200
        assert client.post("/api/auth/logout").status_code == 200
        assert client.get("/api/auth/me", headers={"Cookie": f"session={old_session}"}).status_code == 401
        assert client.post("/api/auth/login", json={**CREDENTIALS, "password": "different-password"}).status_code == 401
        assert client.post("/api/auth/login", json={**CREDENTIALS, "email": "unknown@example.test"}).status_code == 401
        with factory() as db:
            assert db.scalar(select(func.count()).select_from(User)) == 1
            assert db.get(User, user_id).password_hash == password_hash
            assert db.scalar(select(func.count()).select_from(LoginSession)) == 0

    with database_client(database) as (client, _):
        verify_login(client, CREDENTIALS)
        assert client.get("/api/profile").json()["name"] == "Demo"
        assert client.get(f"/api/history/{evaluation_id}").status_code == 200
        assert client.get(roadmap).json()["completed_task_ids"] == ["foundation-0"]
        assert client.get("/api/applications").json()[0]["id"] == created.json()["id"]
        assert client.get("/api/mentor/history").json() == [{"question": "Haradan başlayım?", "answer": "Python ilə başla."}]
