from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "Invento Lite API"
    environment: str = "development"

    mongo_uri: str = "mongodb://127.0.0.1:27017/?replicaSet=rs0"
    mongo_db: str = "invento"

    jwt_secret: str = "insecure-dev-only-secret-change-in-env-file"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12

    cors_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.environment == "production" and settings.jwt_secret.startswith(
        "insecure-dev-only"
    ):
        raise RuntimeError("JWT_SECRET must be set via environment in production.")
    return settings
