"""Pydantic request/response models for /api/v1. Mirrored by frontend/src/api/types.ts."""

from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.config import DEFAULT_DAYS, MAX_DAYS, MAX_NOTE_LENGTH, MIN_DAYS
from app.simulation import SCENARIOS


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class HealthOut(BaseModel):
    status: str
    db: str
    llm_mode: str  # gemini | fallback
    rule_version: str


class UserOut(BaseModel):
    user_id: str
    display_name: str
    profile_description: str
    activity_goal_steps: int
    sleep_target_hours: float
    timezone: str
    today: date  # the user's local calendar date (D19)
    scenario: str
    seed: int
    data_start: date
    data_end: date


class ObservationOut(BaseModel):
    """PRD §5 daily observation."""

    user_id: str
    date: date
    steps: int | None
    sleep_hours: float | None
    resting_heart_rate_bpm: float | None
    hrv_ms: float | None
    data_quality_flags: list[str]


class ObservationsOut(BaseModel):
    user_id: str
    start: date
    end: date
    observations: list[ObservationOut]


class ScenarioOut(BaseModel):
    name: str
    description: str
    affected_metrics: list[str]
    days_affected: int


class GenerateRequest(BaseModel):
    user_id: str
    scenario: str
    seed: int | None = Field(default=None, ge=0, le=2**31 - 1)
    days: int = Field(default=DEFAULT_DAYS, ge=MIN_DAYS, le=MAX_DAYS)
    end_date: date | None = None  # defaults to the user's local today

    @field_validator("scenario")
    @classmethod
    def scenario_must_exist(cls, value: str) -> str:
        if value not in SCENARIOS:
            raise ValueError(f"unknown scenario; expected one of {sorted(SCENARIOS)}")
        return value


class GenerateOut(BaseModel):
    user_id: str
    scenario: str
    seed: int
    days: int
    start_date: date
    end_date: date
    reading_count: int
    note_count: int


class NoteIn(BaseModel):
    date: date
    text: str = Field(min_length=1, max_length=MAX_NOTE_LENGTH)

    @field_validator("text")
    @classmethod
    def text_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("note text must not be blank")
        return value


class NoteOut(BaseModel):
    id: int
    user_id: str
    date: date
    text: str
    created_at: datetime
