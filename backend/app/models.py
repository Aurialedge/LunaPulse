"""ORM tables. Dates are user-local calendar dates; timestamps are UTC (D19)."""

from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
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
