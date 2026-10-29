"""Raw readings -> one daily observation per user per date, with data-quality flags (D5). Pure functions."""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Protocol

from app.metrics import METRIC_ORDER, METRICS


class ReadingLike(Protocol):
    """Anything with these attributes: the ORM `Reading` or the simulator's `ReadingData`."""

    date: date
    metric: str
    value: float | None
    unit: str
    is_available: bool
    quality_marker: str | None
    source: str
    recorded_at: datetime | None


@dataclass
class ReadingData:
    date: date
    metric: str
    value: float | None
    unit: str
    is_available: bool = True
    quality_marker: str | None = None
    source: str = "device"
    recorded_at: datetime | None = None


@dataclass
class DailyObservation:
    """PRD §5 shape. A null metric value always comes with a flag explaining why."""

    user_id: str
    date: date
    steps: int | None = None
    sleep_hours: float | None = None
    resting_heart_rate_bpm: float | None = None
    hrv_ms: float | None = None
    data_quality_flags: list[str] = field(default_factory=list)

    def value(self, metric: str) -> float | None:
        return getattr(self, metric)


def is_valid_reading(reading: ReadingLike) -> bool:
    """Available, in the canonical unit, and inside the plausible range."""
    metric = METRICS[reading.metric]
    return (
        reading.is_available
        and reading.value is not None
        and reading.unit == metric.unit
        and metric.min_value <= reading.value <= metric.max_value
    )


def _resolve_metric(metric_name: str, readings: list[ReadingLike]) -> tuple[float | None, list[str]]:
    """Returns (value, flags) for one metric on one day."""
    metric = METRICS[metric_name]
    flags: list[str] = []

    corrections = [r for r in readings if r.source == "user_correction" and is_valid_reading(r)]
    if corrections:
        latest = max(corrections, key=lambda r: r.recorded_at or datetime.min.replace(tzinfo=timezone.utc))
        return latest.value, [f"corrected:{metric_name}"]

    device = [r for r in readings if r.source == "device"]
    available = [r for r in device if r.is_available and r.value is not None]
    if any(r.unit != metric.unit for r in available):
        flags.append(f"invalid_unit:{metric_name}")
    if any(r.unit == metric.unit and not (metric.min_value <= r.value <= metric.max_value) for r in available):
        flags.append(f"out_of_range:{metric_name}")

    valid = [r for r in available if is_valid_reading(r)]
    if not valid:
        if not flags:
            flags.append(f"missing:{metric_name}")
        return None, flags

    values = [r.value for r in valid]
    if max(values) - min(values) > metric.conflict_tolerance:
        flags.append(f"conflicting_values:{metric_name}")
        return None, flags

    if any(r.quality_marker for r in valid):
        flags.append(f"quality_marker:{metric_name}")
    return sum(values) / len(values), flags


def build_daily_observation(user_id: str, day: date, readings: Iterable[ReadingLike]) -> DailyObservation:
    """Builds the observation for `day` from that day's readings (readings for other days are ignored)."""
    by_metric: dict[str, list[ReadingLike]] = defaultdict(list)
    for reading in readings:
        if reading.date == day and reading.metric in METRICS:
            by_metric[reading.metric].append(reading)

    observation = DailyObservation(user_id=user_id, date=day)
    for metric_name in METRIC_ORDER:
        value, flags = _resolve_metric(metric_name, by_metric[metric_name])
        if value is not None:
            value = int(round(value)) if metric_name == "steps" else round(value, 2)
        setattr(observation, metric_name, value)
        observation.data_quality_flags.extend(flags)
    return observation


def build_observations(
    user_id: str, readings: Iterable[ReadingLike], start: date, end: date
) -> list[DailyObservation]:
    """One observation per calendar day in [start, end]. Days without readings are all-missing."""
    by_day: dict[date, list[ReadingLike]] = defaultdict(list)
    for reading in readings:
        if start <= reading.date <= end:
            by_day[reading.date].append(reading)

    days = (end - start).days + 1
    return [
        build_daily_observation(user_id, start + timedelta(days=i), by_day[start + timedelta(days=i)])
        for i in range(days)
    ]
