from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    pocketbase_url: str = "http://127.0.0.1:8090"
    pb_superuser_email: str = "admin@example.com"
    pb_superuser_password: str = "development-password-change-me"
    frontend_dist: Path = Path("frontend_dist")


@lru_cache
def get_settings() -> Settings:
    return Settings()
