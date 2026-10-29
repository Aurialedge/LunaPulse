"""All settings, thresholds and defaults.

`Settings` holds what differs per environment (read from env vars or backend/.env). Everything else is a plain
constant here so the logic modules contain no magic numbers.
"""

from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent

RULE_VERSION = "v1"

# Simulation (D12)
DEFAULT_SEED = 42
DEFAULT_DAYS = 120
MIN_DAYS = 21  # Part B minimum history
MAX_DAYS = 365

# Observations API: the largest date range one request may ask for
MAX_OBSERVATION_RANGE_DAYS = 366
DEFAULT_OBSERVATION_RANGE_DAYS = 28

# Notes (D15)
MAX_NOTE_LENGTH = 500


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'pulselens.db').as_posix()}"
    gemini_api_key: SecretStr = SecretStr("")
    gemini_model: str = "gemini-2.5-flash"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @property
    def llm_mode(self) -> str:
        return "gemini" if self.gemini_api_key.get_secret_value().strip() else "fallback"
