"""ORM tables. Dates are user-local calendar dates; timestamps are UTC (D19)."""

from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(64))
    profile_description: Mapped[str] = mapped_column(Text)
    activity_goal_steps: Mapped[int] = mapped_column(Integer)
    sleep_target_hours: Mapped[float] = mapped_column(Float)
    timezone: Mapped[str] = mapped_column(String(64))
    seed: Mapped[int] = mapped_column(Integer)
    scenario: Mapped[str] = mapped_column(String(32))
    data_start: Mapped[date] = mapped_column(Date)
    data_end: Mapped[date] = mapped_column(Date)


class Reading(Base):
    """One raw reading. Several rows per (user, date, metric) are allowed (D5)."""

    __tablename__ = "readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    metric: Mapped[str] = mapped_column(String(32))
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str] = mapped_column(String(16))
    is_available: Mapped[bool] = mapped_column(Boolean)
    quality_marker: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="device")  # device | user_correction
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Note(Base):
    """Free-text user note. Untrusted data, never instructions (D15)."""

    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    text: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class InsightRun(Base):
    """One generation for (user, target_date, rule_version). Stale runs are kept for provenance (D11)."""

    __tablename__ = "insight_runs"

    run_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"), index=True)
    target_date: Mapped[date] = mapped_column(Date, index=True)
    rule_version: Mapped[str] = mapped_column(String(16))
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    provider: Mapped[str] = mapped_column(String(16))  # gemini | fallback | mixed | none
    fallback_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_stale: Mapped[bool] = mapped_column(Boolean, default=False)
    # Every candidate with its score breakdown and status (selected / suppressed_redundant / below_limit /
    # dropped_by_llm), and the tool calls Gemini made.
    candidates: Mapped[list] = mapped_column(JSON)
    tool_calls: Mapped[list] = mapped_column(JSON, default=list)


class Insight(Base):
    __tablename__ = "insights"

    insight_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("insight_runs.run_id"), index=True)
    rank: Mapped[int] = mapped_column(Integer)
    category: Mapped[str] = mapped_column(String(32))
    metrics: Mapped[list] = mapped_column(JSON)
    direction: Mapped[str] = mapped_column(String(16))
    rule_id: Mapped[str] = mapped_column(String(80))
    score: Mapped[float] = mapped_column(Float)
    score_components: Mapped[dict] = mapped_column(JSON)
    confidence_label: Mapped[str] = mapped_column(String(8))
    explanation: Mapped[dict] = mapped_column(JSON)
    explanation_provider: Mapped[str] = mapped_column(String(16))  # gemini | fallback


class Evidence(Base):
    """PRD §8 evidence record, stored apart from the explanation. One row per metric of an insight."""

    __tablename__ = "evidence"

    evidence_id: Mapped[str] = mapped_column(String(48), primary_key=True)
    insight_id: Mapped[str] = mapped_column(ForeignKey("insights.insight_id"), index=True)
    user_id: Mapped[str] = mapped_column(String(32))
    metric: Mapped[str] = mapped_column(String(32))
    target_date: Mapped[date] = mapped_column(Date)
    comparison: Mapped[str] = mapped_column(String(40))
    observed_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    observed_unit: Mapped[str] = mapped_column(String(16))
    baseline_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_method: Mapped[str] = mapped_column(Text)
    baseline_window_start: Mapped[date] = mapped_column(Date)
    baseline_window_end: Mapped[date] = mapped_column(Date)
    valid_observation_count: Mapped[int] = mapped_column(Integer)
    absolute_difference: Mapped[float | None] = mapped_column(Float, nullable=True)
    percentage_difference: Mapped[float | None] = mapped_column(Float, nullable=True)
    standardized_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_method: Mapped[str | None] = mapped_column(String(16), nullable=True)
    direction: Mapped[str] = mapped_column(String(16))
    rule_id: Mapped[str] = mapped_column(String(80))
    rule_threshold: Mapped[str] = mapped_column(Text)
    supporting_observation_dates: Mapped[list] = mapped_column(JSON)  # ISO date strings
    supporting_observation_values: Mapped[list] = mapped_column(JSON)
    data_quality_flags: Mapped[list] = mapped_column(JSON)


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    insight_id: Mapped[str] = mapped_column(ForeignKey("insights.insight_id"), index=True)
    action: Mapped[str] = mapped_column(String(16))  # dismissed | irrelevant
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
