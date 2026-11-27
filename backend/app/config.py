from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Repository root (karyera-mentoru/)
BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    # Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-flash-lite-latest"
    gemini_models: str = ""  # comma-separated fallback chain

    auth_mode: Literal["password", "email-otp"] = "password"
    otp_secret: SecretStr = SecretStr("")
    smtp_host: str = ""
    smtp_port: int | None = Field(default=None, ge=1, le=65535)
    smtp_security: Literal["starttls", "ssl"] = "starttls"
    smtp_from: str = ""
    smtp_username: str = ""
    smtp_password: SecretStr = SecretStr("")

    # Application
    app_name: str = "Karyera Mentoru"
    max_upload_mb: int = 5
    database_path: Path = BASE_DIR / "karyera.db"

    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    @property
    def model_chain(self) -> list[str]:
        names = [m.strip() for m in self.gemini_models.split(",") if m.strip()]
        return names or [self.gemini_model]


settings = Settings()
