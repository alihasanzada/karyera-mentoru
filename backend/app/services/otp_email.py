from email.errors import HeaderParseError
from email.headerregistry import Address
from email.message import EmailMessage
import smtplib
import ssl

from app.config import settings


class EmailDeliveryError(Exception):
    pass


def send_login_code(email: str, code: str) -> None:
    password = settings.smtp_password.get_secret_value()
    if not settings.smtp_host or not settings.smtp_from or bool(settings.smtp_username) != bool(password):
        raise EmailDeliveryError("Email delivery unavailable")

    try:
        sender = Address(addr_spec=settings.smtp_from)
        recipient = Address(addr_spec=email)
        if not sender.domain or not recipient.domain:
            raise ValueError("SMTP requires complete email addresses")
        message = EmailMessage()
        message["From"] = sender
        message["To"] = recipient
        message["Subject"] = "Karyera Mentoru giriş kodu"
        message.set_content(
            f"Karyera Mentoru giriş kodun: {code}\n\n"
            "Kod 5 dəqiqə qüvvədədir və bir dəfə istifadə oluna bilər.\n"
            "Giriş etməyə çalışmamısansa, bu məktubu nəzərə alma."
        )

        tls = ssl.create_default_context()
        if settings.smtp_security == "ssl":
            connection = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port or 465, timeout=8, context=tls)
        else:
            connection = smtplib.SMTP(settings.smtp_host, settings.smtp_port or 587, timeout=8)
        with connection as smtp:
            if settings.smtp_security == "starttls":
                smtp.starttls(context=tls)
            if settings.smtp_username:
                smtp.login(settings.smtp_username, password)
            if smtp.send_message(message, from_addr=sender.addr_spec, to_addrs=[recipient.addr_spec]):
                raise EmailDeliveryError("Email delivery unavailable")
    except (OSError, ValueError, HeaderParseError):
        # SMTP diagnostics may contain the mailbox, credentials, or message contents.
        raise EmailDeliveryError("Email delivery unavailable") from None
