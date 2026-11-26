from unittest.mock import Mock

from pydantic import SecretStr
import pytest

from app.services import otp_email


@pytest.mark.parametrize(("security", "constructor", "port"), [
    ("starttls", "SMTP", 587), ("ssl", "SMTP_SSL", 465),
])
def test_tls_mail_delivery(monkeypatch, security, constructor, port):
    settings = otp_email.settings
    for name, value in {
        "smtp_host": "smtp.example.test",
        "smtp_from": "sender@example.test",
        "smtp_username": "sender@example.test",
        "smtp_password": SecretStr("fixture-only-smtp-password"),
        "smtp_security": security,
        "smtp_port": None,
    }.items():
        monkeypatch.setattr(settings, name, value)
    smtp = Mock()
    smtp.send_message.return_value = {}
    connection = Mock()
    connection.__enter__ = Mock(return_value=smtp)
    connection.__exit__ = Mock(return_value=False)
    open_connection = Mock(return_value=connection)
    monkeypatch.setattr(otp_email.smtplib, constructor, open_connection)
    other = "SMTP_SSL" if constructor == "SMTP" else "SMTP"
    monkeypatch.setattr(otp_email.smtplib, other, Mock(side_effect=AssertionError("wrong transport")))

    otp_email.send_login_code("recipient@example.test", "012345")
    assert open_connection.call_args.args == ("smtp.example.test", port)
    assert [call[0] for call in smtp.mock_calls] == (
        ["starttls", "login", "send_message"] if security == "starttls" else ["login", "send_message"]
    )
    tls = (smtp.starttls.call_args.kwargs if security == "starttls" else open_connection.call_args.kwargs)["context"]
    assert tls.check_hostname
    assert smtp.send_message.call_args.kwargs["to_addrs"] == ["recipient@example.test"]
    assert "012345" in smtp.send_message.call_args.args[0].get_content()


def test_incomplete_config_never_connects(monkeypatch):
    monkeypatch.setattr(otp_email.settings, "smtp_host", "")
    transport = Mock(side_effect=AssertionError("Unexpected SMTP connection"))
    monkeypatch.setattr(otp_email.smtplib, "SMTP", transport)
    with pytest.raises(otp_email.EmailDeliveryError):
        otp_email.send_login_code("recipient@example.test", "012345")
    transport.assert_not_called()
