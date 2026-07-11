from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    pocketbase_url: str = "http://127.0.0.1:8090"
    pb_superuser_email: str = "admin@example.com"
    pb_superuser_password: str = "development-password-change-me"
    frontend_dist: Path = Path("frontend_dist")
    firebase_credentials_json: str = ""
    cors_origins: str = "http://localhost,https://localhost,capacitor://localhost"
    legal_street_address: str = ""
    legal_postal_city: str = ""
    android_app_link_sha256_cert_fingerprints: str = (
        "04:3F:9D:9A:92:E2:40:7A:F0:A3:46:B0:5B:3D:4C:72:"
        "47:C7:D7:95:BE:55:2C:75:1B:A7:13:3F:CD:7B:25:BC"
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def android_app_link_sha256_cert_fingerprint_list(self) -> list[str]:
        return [
            fingerprint.strip().upper()
            for fingerprint in self.android_app_link_sha256_cert_fingerprints.split(",")
            if fingerprint.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
