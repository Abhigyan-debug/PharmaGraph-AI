from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root directory (PharmaGraph-AI)
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent


class Settings(BaseSettings):
    DATABASE_URL: str
    MODEL_PATH: str = "ml/artifacts/gcn_ddi.pt"
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: str = "http://localhost:5173"
    # True once the site is served over HTTPS: marks the session cookie Secure and sends HSTS.
    HTTPS: bool = False
    SESSION_DAYS: int = 7

    model_config = SettingsConfigDict(
        env_file=(BASE_DIR / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
