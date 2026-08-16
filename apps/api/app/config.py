from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "development"
    log_level: str = "INFO"

    database_url: str = "postgresql+asyncpg://localhost/mnemo_dev"

    session_cookie_name: str = "mnemo_session"
    session_ttl_seconds: int = 60 * 60 * 24 * 7  # 7 days

    cors_allow_origins: list[str] = ["http://localhost:3000"]

    # Local, no-API-key embedding model (see docs/architecture/milestone-1-foundations.md
    # for why local was chosen over a hosted embeddings API). Changing this requires a
    # migration to update the `items.embedding` column's dimension to match.
    embedding_model_name: str = "all-MiniLM-L6-v2"
    embedding_dim: int = 384

    # OpenRouter (https://openrouter.ai) is used as a provider-agnostic LLM gateway for
    # grounded Q&A, so the app isn't tied to one vendor's SDK and gets automatic
    # fallback across models. No default model is set deliberately: OpenRouter's catalog
    # of valid model slugs changes over time, and a hardcoded guess here could go stale
    # or be wrong. Set these from https://openrouter.ai/models before using /ask.
    openrouter_api_key: str = ""
    openrouter_model: str = ""
    openrouter_fallback_models: list[str] = []

    # How long a memory summary (app/models/memory.py) stays surfaced before automatic
    # expiry -- the "forgetting" mechanism for persistent memory. Deliberately a fixed
    # window from creation, no reinforcement/decay (see docs/architecture/milestone-1-foundations.md).
    memory_ttl_days: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()
