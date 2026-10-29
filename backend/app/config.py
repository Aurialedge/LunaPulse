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

# --- Analytics (ARCHITECTURE.md "Algorithms"). Illustrative values, not medical thresholds. ---

# Baseline: [t - W, t - 1]; the target day is never included (PRD §6)
BASELINE_WINDOW_DAYS = 28
BASELINE_MIN_OBS = 14
ROBUST_Z_CONSTANT = 0.6745
# Below these dispersions a standardized score is not reliable (PRD §6: zero/tiny MAD)
MIN_MAD = {"steps": 50.0, "sleep_hours": 0.05, "resting_heart_rate_bpm": 0.5, "hrv_ms": 0.5}
MIN_STD = {"steps": 50.0, "sleep_hours": 0.05, "resting_heart_rate_bpm": 0.5, "hrv_ms": 0.5}

# Trend (D6): median of [t-6, t] vs. a baseline over [t-34, t-7]
TREND_RECENT_DAYS = 7
TREND_RECENT_MIN_OBS = 4
TREND_MIN_SAME_SIDE_DAYS = 5  # of the recent days, each beyond half the threshold
# Week-over-week: mean of [t-6, t] vs. mean of [t-13, t-7], each needing this many valid days
WOW_MIN_OBS = 4

# Rule thresholds per metric (PRD §7). "percent" thresholds compare against the baseline median and need it > 0;
# min_absolute is the extra minimum change in the metric's own unit.
RULE_THRESHOLDS: dict[str, dict] = {
    "steps": {"kind": "percent", "value": 25.0, "min_absolute": 1000.0},
    "sleep_hours": {"kind": "absolute", "value": 1.0, "min_absolute": 0.0},
    "resting_heart_rate_bpm": {"kind": "absolute", "value": 5.0, "min_absolute": 0.0},
    "hrv_ms": {"kind": "percent", "value": 15.0, "min_absolute": 3.0},
}

# Combined-metric pairs (PRD §7): both same-day deviations, in these directions
COMBINED_PAIRS: tuple[tuple[tuple[str, str], tuple[str, str]], ...] = (
    (("sleep_hours", "below"), ("resting_heart_rate_bpm", "above")),
    (("hrv_ms", "below"), ("resting_heart_rate_bpm", "above")),
    (("steps", "below"), ("sleep_hours", "below")),
)

# Suspicious one-day spike (D16)
SPIKE_MIN_SCORE = 5.0

# Ranking (all components in [0, 1])
RANKING_WEIGHTS = {"magnitude": 0.40, "persistence": 0.20, "reliability": 0.15, "relevance": 0.15, "novelty": 0.10}
MAGNITUDE_CAP = 3.0  # magnitude = min(|change| / threshold, cap) / cap
MAX_PERSISTENCE_DAYS = 7
UNRELIABLE_FACTOR = 0.5
RELEVANCE_NOT_ON_TARGET = 0.5
NOVELTY_LOOKBACK_DAYS = 3  # D8
NOVELTY_REPEAT = 0.3
DATA_QUALITY_SCORE = 0.15
CATEGORY_PRIORITY = ("combined", "deviation", "improving_trend", "trend", "data_quality")
MAX_INSIGHTS = 3

# Confidence label (D9)
CONFIDENCE_HIGH_COVERAGE = 0.85
CONFIDENCE_LOW_COVERAGE = 0.6
CONFIDENCE_HIGH_MIN_PERSISTENCE = 2

# LLM tools (D13)
TOOL_MAX_RANGE_DAYS = 90

# Data editor: most corrections one batch may save (28 days x 4 metrics) (D29)
MAX_BATCH_CORRECTIONS = 112

# Goal rings in the UI: progress towards the user's own goal, capped (D31)
GOAL_PROGRESS_CAP = 100.0


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'lunapulse.db').as_posix()}"
    gemini_api_key: SecretStr = SecretStr("")
    gemini_model: str = "gemini-3.5-flash"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @property
    def llm_mode(self) -> str:
        return "gemini" if self.gemini_api_key.get_secret_value().strip() else "fallback"

# LLM explanation service (D10, D13)
LLM_MAX_TOOL_ROUNDS = 4
LLM_TIMEOUT_SECONDS = 45
# Transport retries for transient provider errors (separate from the single correction retry for invalid answers)
LLM_TRANSPORT_ATTEMPTS = 3
LLM_RETRY_STATUS_CODES = [429, 500, 503, 504]
LLM_TEMPERATURE = 0.2
# A number in the LLM's text matches an allowed number if it is within this relative tolerance (or 0.05 absolute)
LLM_NUMBER_REL_TOLERANCE = 0.01
LLM_NUMBER_ABS_TOLERANCE = 0.05
# Small whole numbers (day counts such as "3 days" or "7-day") are always allowed
LLM_ALLOWED_SMALL_INTEGERS = range(0, 8)
