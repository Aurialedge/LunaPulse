"""Pydantic request/response models for /api/v1. Mirrored by frontend/src/api/types.ts."""

import datetime as dt
from datetime import date, datetime
import unicodedata
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.config import DEFAULT_DAYS, MAX_BATCH_CORRECTIONS, MAX_DAYS, MAX_NOTE_LENGTH, MIN_DAYS
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
        if any(unicodedata.category(c) == "Cc" and c not in "\n\r\t" for c in value):
            raise ValueError("note text must not contain control characters")
        return value


class NoteOut(BaseModel):
    id: int
    user_id: str
    date: date
    text: str
    created_at: datetime


# --- analytics ---


class MetricBaselineOut(BaseModel):
    metric: str
    label: str
    unit: str
    observed_value: float | None
    target_flags: list[str]
    status: str  # ok | insufficient
    valid_observation_count: int
    window_days: int
    window_start: date
    window_end: date
    mean: float | None
    median: float | None
    std: float | None
    mad: float | None
    latest_value: float | None
    latest_date: date | None
    absolute_difference: float | None
    percentage_difference: float | None
    standardized_score: float | None
    score_method: str | None
    direction: str
    interpretation: str
    day_over_day: float | None
    week_over_week: float | None
    goal_value: float | None  # steps: activity goal, sleep: sleep target, RHR/HRV: none
    goal_progress_percent: float | None  # observed / goal, capped at 100 (computed here, never in the UI)


class BaselinesOut(BaseModel):
    user_id: str
    date: date
    metrics: list[MetricBaselineOut]


class GenerateInsightsRequest(BaseModel):
    date: dt.date | None = None  # defaults to the user's latest day with data (never after their local today)
    force: bool = False


class ExplanationSchema(BaseModel):
    insight_id: str
    title: str
    summary: str
    what_changed: str
    why_it_matters: str
    evidence_ids: list[str]
    possible_context: str
    limitations: list[str]
    suggested_reflection: str


class InsightOut(BaseModel):
    insight_id: str
    run_id: str
    user_id: str
    target_date: date
    rank: int
    category: str
    metrics: list[str]
    direction: str
    rule_id: str
    score: float
    score_components: dict[str, float]
    confidence_label: str  # deterministic (D9)
    explanation: ExplanationSchema
    explanation_provider: str  # gemini | fallback
    evidence_ids: list[str]
    feedback: str | None  # latest feedback action, if any
    is_stale: bool


class CandidateOut(BaseModel):
    candidate_id: str
    category: str
    metrics: list[str]
    direction: str
    rule_id: str
    score: float
    status: str  # selected | suppressed_redundant | below_limit | dropped_by_llm
    rank: int | None
    insight_id: str | None
    drop_reason: str | None


class FeedOut(BaseModel):
    run_id: str
    user_id: str
    target_date: date
    rule_version: str
    generated_at: datetime
    provider: str  # gemini | fallback | mixed | none
    fallback_reason: str | None
    insights: list[InsightOut]
    hidden_count: int
    candidates: list[CandidateOut]


class EvidenceOut(BaseModel):
    evidence_id: str
    insight_id: str
    user_id: str
    metric: str
    target_date: date
    comparison: str
    observed_value: float | None
    observed_unit: str
    baseline_value: float | None
    baseline_method: str
    baseline_window_start: date
    baseline_window_end: date
    valid_observation_count: int
    absolute_difference: float | None
    percentage_difference: float | None
    standardized_score: float | None
    score_method: str | None
    direction: str
    rule_id: str
    rule_threshold: str
    supporting_observation_dates: list[date]
    supporting_observation_values: list[float]
    data_quality_flags: list[str]


class FeedbackIn(BaseModel):
    action: Literal["dismissed", "irrelevant"]


class FeedbackOut(BaseModel):
    id: int
    insight_id: str
    action: str
    created_at: datetime


class CorrectionIn(BaseModel):
    date: date
    metric: Literal["steps", "sleep_hours", "resting_heart_rate_bpm", "hrv_ms"]
    # strict: a JSON number only (no "8000" strings, no true -> 1); NaN / Infinity are rejected with 422, not a crash
    value: float = Field(allow_inf_nan=False, strict=True)


class CorrectionOut(BaseModel):
    user_id: str
    date: date
    metric: str
    value: float
    unit: str
    stale_run_count: int
    feed: FeedOut  # the regenerated feed for the corrected date


class BatchCorrectionIn(BaseModel):
    corrections: list[CorrectionIn] = Field(min_length=1, max_length=MAX_BATCH_CORRECTIONS)


class BatchCorrectionOut(BaseModel):
    user_id: str
    saved: int
    stale_run_count: int
    dates: list[date]  # the corrected days, sorted

