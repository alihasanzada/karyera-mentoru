import os
from unittest.mock import Mock

import pytest
from pydantic import SecretStr

# This runs before pytest imports any API, ORM or provider module during collection.
os.environ.update(DATABASE_PATH=":memory:", GEMINI_API_KEY="", SMTP_HOST="", SMTP_PASSWORD="")

from app.config import settings

if str(settings.database_path) != ":memory:":
    raise RuntimeError("The backend test suite requires an isolated SQLite database.")

from app.services import ai_analyzer, login_otp, otp_email


@pytest.fixture(autouse=True)
def delivered_mail(monkeypatch):
    delivery = Mock()
    monkeypatch.setattr(ai_analyzer, "_client", None)
    monkeypatch.setattr(settings, "gemini_api_key", "")
    for constructor in ("SMTP", "SMTP_SSL"):
        monkeypatch.setattr(
            otp_email.smtplib, constructor,
            Mock(side_effect=AssertionError("Tests must mock SMTP delivery")),
        )
    monkeypatch.setattr(login_otp.settings, "auth_mode", "email-otp")
    monkeypatch.setattr(login_otp.settings, "otp_secret", SecretStr("test-suite-only-otp-key-32-bytes-min"))
    monkeypatch.setattr(login_otp, "send_login_code", delivery)
    return delivery
