"""Personal baselines, deviations and trend windows (PRD §6, D6). Pure functions over daily observations.

Every number is rounded once, here, and the rules downstream use the rounded values, so what the user sees is
exactly what triggered a rule.
"""

import statistics
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta

from app.config import (
    BASELINE_MIN_OBS,
    BASELINE_WINDOW_DAYS,
    MIN_MAD,
    MIN_STD,
    ROBUST_Z_CONSTANT,
    RULE_THRESHOLDS,
    TREND_RECENT_DAYS,
    TREND_RECENT_MIN_OBS,
    WOW_MIN_OBS,
)
from app.metrics import METRICS
from app.observations import DailyObservation


@dataclass
class BaselineStats:
    metric: str
    status: str  # ok | insufficient
    window_start: date
    window_end: date
    window_days: int
    valid_count: int
    mean: float | None = None
    median: float | None = None
    std: float | None = None
    mad: float | None = None
    latest_value: float | None = None
    latest_date: date | None = None
    values: list[tuple[date, float]] = field(default_factory=list)  # the valid observations used

    @property
    def coverage(self) -> float:
        return self.valid_count / self.window_days


@dataclass
class MetricComparison:
    """Target day vs. its personal baseline, for one metric."""

    metric: str
    target_date: date
    unit: str
    observed_value: float | None
    target_flags: list[str]  # the target day's data-quality flags for this metric
    baseline: BaselineStats
    absolute_difference: float | None = None
    percentage_difference: float | None = None
    standardized_score: float | None = None
    score_method: str | None = None  # robust_z | z | None (not reliably standardized)
    direction: str = "none"  # above | below | none
    interpretation: str = "no comparison available"
    day_over_day: float | None = None
    week_over_week: float | None = None

    @property
    def reliably_standardized(self) -> bool:
        return self.standardized_score is not None


@dataclass
class TrendStats:
    """Median of the recent window [t-6, t] vs. the trend baseline [t-34, t-7]."""

    metric: str
    status: str  # ok | insufficient
    recent_start: date
    recent_end: date
    recent_valid_count: int
    baseline: BaselineStats
    recent_values: list[tuple[date, float]] = field(default_factory=list)
    recent_median: float | None = None
    change: float | None = None
    percentage_change: float | None = None
    direction: str = "none"
    same_side_days: int = 0  # recent days beyond half the threshold, on the trend's side


# --- helpers ---


def _r(value: float | None, digits: int = 2) -> float | None:
    return None if value is None else round(float(value), digits)


def valid_values(
    observations: Sequence[DailyObservation], metric: str, start: date, end: date
) -> list[tuple[date, float]]:
    """(date, value) for every non-null value in [start, end], oldest first. Missing values are excluded."""
    return sorted(
        (o.date, float(o.value(metric)))
        for o in observations
        if start <= o.date <= end and o.value(metric) is not None
    )


def observation_on(observations: Sequence[DailyObservation], day: date) -> DailyObservation | None:
    return next((o for o in observations if o.date == day), None)


def percentage(change: float, reference: float | None) -> float | None:
    """Percentage change, only when the reference is positive (PRD §6: zero baselines never divide)."""
    if reference is None or reference <= 0:
        return None
    return _r(100 * change / reference, 1)


def threshold_ratio(metric: str, change: float | None, reference: float | None) -> float | None:
    """|change| expressed in multiples of the metric's rule threshold; None when it can't be judged.

    For a percent threshold the reference (baseline median) must be positive. The minimum absolute change must
    also be met, otherwise the ratio is capped just below 1 so the rule does not fire.
    """
    if change is None:
        return None
    rule = RULE_THRESHOLDS[metric]
    if rule["kind"] == "percent":
        pct = percentage(change, reference)
        if pct is None:
            return None
        ratio = abs(pct) / rule["value"]
    else:
        ratio = abs(round(change, 2)) / rule["value"]
    if abs(change) < rule["min_absolute"]:
        ratio = min(ratio, 0.99)
    return ratio


def crosses_threshold(metric: str, change: float | None, reference: float | None) -> bool:
    ratio = threshold_ratio(metric, change, reference)
    return ratio is not None and ratio >= 1.0


def direction_of(change: float | None) -> str:
    if change is None or change == 0:
        return "none"
    return "above" if change > 0 else "below"


def interpretation_of(metric: str, direction: str) -> str:
    definition = METRICS[metric]
    if direction == "above":
        return definition.above_interpretation
    if direction == "below":
        return definition.below_interpretation
    return "in line with the personal baseline"


# --- baseline ---


def compute_baseline(
    observations: Sequence[DailyObservation],
    metric: str,
    target_date: date,
    window_days: int = BASELINE_WINDOW_DAYS,
    min_obs: int = BASELINE_MIN_OBS,
) -> BaselineStats:
    """Statistics over [t - window_days, t - 1]. Insufficient history gives counts only, never invented stats."""
    window_start = target_date - timedelta(days=window_days)
    window_end = target_date - timedelta(days=1)
    values = valid_values(observations, metric, window_start, window_end)
    stats = BaselineStats(
        metric=metric,
        status="insufficient",
        window_start=window_start,
        window_end=window_end,
        window_days=window_days,
        valid_count=len(values),
        values=values,
    )
    if values:
        stats.latest_date, stats.latest_value = values[-1]
    if len(values) < min_obs:
        return stats

    numbers = [v for _, v in values]
    median = statistics.median(numbers)
    stats.status = "ok"
    stats.mean = _r(statistics.fmean(numbers))
    stats.median = _r(median)
    stats.std = _r(statistics.stdev(numbers)) if len(numbers) > 1 else 0.0
    stats.mad = _r(statistics.median(abs(v - median) for v in numbers))
    return stats


def standardized_score(metric: str, value: float, baseline: BaselineStats) -> tuple[float | None, str | None]:
    """robust_z when MAD is usable, else z when SD is usable, else (None, None) = not reliably standardized."""
    if baseline.status != "ok":
        return None, None
    if baseline.mad is not None and baseline.mad >= MIN_MAD[metric]:
        return _r(ROBUST_Z_CONSTANT * (value - baseline.median) / baseline.mad), "robust_z"
    if baseline.std is not None and baseline.std >= MIN_STD[metric]:
        return _r((value - baseline.mean) / baseline.std), "z"
    return None, None


def _mean_between(observations: Sequence[DailyObservation], metric: str, start: date, end: date) -> float | None:
    values = valid_values(observations, metric, start, end)
    return statistics.fmean(v for _, v in values) if len(values) >= WOW_MIN_OBS else None


def compare_to_baseline(
    observations: Sequence[DailyObservation], metric: str, target_date: date
) -> MetricComparison:
    baseline = compute_baseline(observations, metric, target_date)
    target = observation_on(observations, target_date)
    observed = target.value(metric) if target else None
    flags = [f for f in (target.data_quality_flags if target else [f"missing:{metric}"]) if f.endswith(f":{metric}")]

    comparison = MetricComparison(
        metric=metric,
        target_date=target_date,
        unit=METRICS[metric].unit,
        observed_value=observed,
        target_flags=flags,
        baseline=baseline,
    )

    yesterday = observation_on(observations, target_date - timedelta(days=1))
    if observed is not None and yesterday is not None and yesterday.value(metric) is not None:
        comparison.day_over_day = _r(observed - yesterday.value(metric))
    this_week = _mean_between(observations, metric, target_date - timedelta(days=6), target_date)
    last_week = _mean_between(observations, metric, target_date - timedelta(days=13), target_date - timedelta(days=7))
    if this_week is not None and last_week is not None:
        comparison.week_over_week = _r(this_week - last_week)

    if observed is None:
        comparison.interpretation = "no valid value for this day"
        return comparison
    if baseline.status != "ok":
        comparison.interpretation = "not enough history for a personal baseline"
        return comparison

    change = _r(observed - baseline.median)
    comparison.absolute_difference = change
    comparison.percentage_difference = percentage(change, baseline.median)
    comparison.standardized_score, comparison.score_method = standardized_score(metric, observed, baseline)
    comparison.direction = direction_of(change)
    comparison.interpretation = interpretation_of(metric, comparison.direction)
    return comparison


# --- trend ---


def compute_trend(observations: Sequence[DailyObservation], metric: str, target_date: date) -> TrendStats:
    recent_start = target_date - timedelta(days=TREND_RECENT_DAYS - 1)
    # Baseline as of the first recent day: window [t-34, t-7]
    baseline = compute_baseline(observations, metric, recent_start)
    recent = valid_values(observations, metric, recent_start, target_date)
    trend = TrendStats(
        metric=metric,
        status="insufficient",
        recent_start=recent_start,
        recent_end=target_date,
        recent_valid_count=len(recent),
        baseline=baseline,
        recent_values=recent,
    )
    if len(recent) < TREND_RECENT_MIN_OBS or baseline.status != "ok":
        return trend

    trend.status = "ok"
    trend.recent_median = _r(statistics.median(v for _, v in recent))
    trend.change = _r(trend.recent_median - baseline.median)
    trend.percentage_change = percentage(trend.change, baseline.median)
    trend.direction = direction_of(trend.change)
    if trend.direction != "none":
        sign = 1 if trend.direction == "above" else -1
        trend.same_side_days = sum(
            1
            for _, v in recent
            if sign * (v - baseline.median) > 0
            and (threshold_ratio(metric, v - baseline.median, baseline.median) or 0) >= 0.5
        )
    return trend
