from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# career-mentor/ folder
BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    # Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-flash-lite-latest"
    gemini_models: str = ""  # comma-separated model sequence (backup chain)

    # Application
    app_name: str = "Karyera Mentoru"
    app_url: str = "http://localhost:8000"
    max_upload_mb: int = 5

    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    @property
    def model_chain(self) -> list[str]:
        names = [m.strip() for m in self.gemini_models.split(",") if m.strip()]
        return names or [self.gemini_model]


settings = Settings()