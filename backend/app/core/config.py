"""Application settings. Secrets are read from backend/.env (never committed)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_DEFAULT_SECRET = "dev-insecure-secret-change-me-please-0000"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = "development"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./agentguard.db"

    jwt_secret: str = INSECURE_DEFAULT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 12

    frontend_origin: str = "http://localhost:5173"

    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_base_url: str = "https://api-m.sandbox.paypal.com"
    paypal_webhook_id: str = ""
    # authorize | capture | auto (auto = AUTHORIZE for needs_approval requests, CAPTURE for auto_approved)
    payment_mode: str = "auto"
    auth_expiry_warn_hours: int = 48

    mcp_rate_limit_per_minute: int = 30  # per agent key, all tools combined

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    @property
    def paypal_configured(self) -> bool:
        return bool(self.paypal_client_id and self.paypal_client_secret)

    @property
    def gemini_configured(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def cors_origins(self) -> list[str]:
        origins = {self.frontend_origin.rstrip("/")}
        if "localhost" in self.frontend_origin:
            origins.add(self.frontend_origin.replace("localhost", "127.0.0.1").rstrip("/"))
        return sorted(origins)


@lru_cache
def get_settings() -> Settings:
    return Settings()
