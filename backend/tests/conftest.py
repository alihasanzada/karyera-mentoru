from unittest.mock import Mock

import pytest
from pydantic import SecretStr

from app.services import login_otp


@pytest.fixture(autouse=True)
def delivered_mail(monkeypatch):
    delivery = Mock()
    monkeypatch.setattr(login_otp.settings, "auth_mode", "email-otp")
    monkeypatch.setattr(login_otp.settings, "otp_secret", SecretStr("test-suite-only-otp-key-32-bytes-min"))
    monkeypatch.setattr(login_otp, "send_login_code", delivery)
    return delivery
