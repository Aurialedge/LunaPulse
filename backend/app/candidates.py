"""Deterministic candidate-insight rules (PRD §7, D14, D16, D20). Runs before, and independently of, the LLM."""

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta

from app.baselines import (
    MetricComparison,
    TrendStats,
    compare_to_baseline,
    compute_trend,
    crosses_threshold,
    interpretation_of,
    observation_on,
    threshold_ratio,
)
from app.config import (
    CATEGORY_PRIORITY,
    COMBINED_PAIRS,
    MAX_PERSISTENCE_DAYS,
    RULE_THRESHOLDS,
    RULE_VERSION,
    SPIKE_MIN_SCORE,
    TREND_MIN_SAME_SIDE_DAYS,
    TREND_RECENT_DAYS,
)
from app.metrics import METRIC_ORDER, METRICS
from app.observations import DailyObservation

SPIKE_LIMITATION = "Single-day value; may be a measurement artefact."


@dataclass(frozen=True)
class Goals:
    activity_goal_steps: int
    sleep_target_hours: float


@dataclass
class Candidate:
    category: str  # deviation | trend | improving_trend | combined | data_quality
    metrics: list[str]
    direction: str  # above | below | mixed | none
    rule_id: str
    target_date: date
    interpretation: str
    magnitude_ratios: dict[str, float]  # |change| / threshold, per metric
    persistence_days: int
    on_target_day: bool  # the target day itself crosses the threshold
    comparisons: dict[str, MetricComparison]  # target day vs. baseline, per metric
    trend: TrendStats | None = None
    qualifiers: list[str] = field(default_factory=list)  # suspicious_spike, not_reliably_standardized, ...
    limitations: list[str] = field(default_factory=list)
    goal: dict | None = None  # improving_trend: goal, gap before and after
    data_quality_issues: dict[str, list[str]] = field(default_factory=dict)

    @property
    def candidate_id(self) -> str:
        return f"{self.category}:{'+'.join(self.metrics)}"

    @property
    def coverage(self) -> float:
        """Share of the baseline window with valid data; the weakest metric counts."""
        if self.trend is not None:
            return self.trend.baseline.coverage
        return min(self.comparisons[m].baseline.coverage for m in self.metrics)


def rule_threshold_text(metric: str) -> str:
    rule = RULE_THRESHOLDS[metric]
    unit = METRICS[metric].unit
    if rule["kind"] == "percent":
        return f"|change| >= {rule['value']:g}% of the baseline median (median > 0) and >= {rule['min_absolute']:g} {unit}"
    unit = unit[:-1] if rule["value"] == 1 and unit.endswith("s") else unit  # "1 hour", not "1 hours"
    return f"|change| >= {rule['value']:g} {unit} from the baseline median"


def _rule_id(category: str, metrics: Sequence[str]) -> str:
    return f"{category}.{'+'.join(metrics)}.{RULE_VERSION}"


def _limitations_for(comparison: MetricComparison) -> list[str]:
    label = METRICS[comparison.metric].label
    notes = []
    baseline = comparison.baseline
    if baseline.valid_count < baseline.window_days:
        notes.append(f"{label}: {baseline.valid_count} of {baseline.window_days} baseline days had valid data.")
    if baseline.status == "ok" and not comparison.reliably_standardized:
        notes.append(f"{label}: day-to-day variation is very small, so no standardized score is given.")
    if any(f.startswith("quality_marker:") for f in comparison.target_flags):
        notes.append(f"{label}: the device marked this day's reading as low quality.")
    if any(f.startswith("corrected:") for f in comparison.target_flags):
        notes.append(f"{label}: this day's value was corrected by the user.")
    return notes


# --- deviation ---


def _persistence(observations: Sequence[DailyObservation], comparison: MetricComparison) -> int:
    """Consecutive days ending at the target day beyond the threshold, on the same side of the baseline."""
    median = comparison.baseline.median
    days = 0
    for back in range(MAX_PERSISTENCE_DAYS):
        observation = observation_on(observations, comparison.target_date - timedelta(days=back))
        value = observation.value(comparison.metric) if observation else None
        if value is None:
            break
        change = value - median
        same_side = (change > 0) == (comparison.direction == "above") and change != 0
        if not (same_side and crosses_threshold(comparison.metric, change, median)):
            break
        days += 1
    return days


def _is_suspicious_spike(
    observations: Sequence[DailyObservation], comparison: MetricComparison, persistence: int
) -> bool:
    """D16: very large score, both neighbours (if present) within the threshold, and no persistence."""
    score = comparison.standardized_score
    if score is None or abs(score) < SPIKE_MIN_SCORE or persistence > 1:
        return False
    for offset in (-1, 1):
        neighbour = observation_on(observations, comparison.target_date + timedelta(days=offset))
        value = neighbour.value(comparison.metric) if neighbour else None
        if value is not None and crosses_threshold(
            comparison.metric, value - comparison.baseline.median, comparison.baseline.median
        ):
            return False
    return True


def deviation_candidate(
    observations: Sequence[DailyObservation], comparison: MetricComparison
) -> Candidate | None:
    if comparison.absolute_difference is None:
        return None
    metric = comparison.metric
    if not crosses_threshold(metric, comparison.absolute_difference, comparison.baseline.median):
        return None

    persistence = _persistence(observations, comparison)
    candidate = Candidate(
        category="deviation",
        metrics=[metric],
        direction=comparison.direction,
        rule_id=_rule_id("deviation", [metric]),
        target_date=comparison.target_date,
        interpretation=comparison.interpretation,
        magnitude_ratios={
            metric: threshold_ratio(metric, comparison.absolute_difference, comparison.baseline.median)
        },
        persistence_days=persistence,
        on_target_day=True,
        comparisons={metric: comparison},
        limitations=_limitations_for(comparison),
    )
    if not comparison.reliably_standardized:
        candidate.qualifiers.append("not_reliably_standardized")
    if _is_suspicious_spike(observations, comparison, persistence):
        candidate.qualifiers.append("suspicious_spike")
        candidate.limitations.append(SPIKE_LIMITATION)
    return candidate


# --- trend / improving_trend ---


def _goal_gap(metric: str, value: float, goals: Goals) -> float | None:
    if metric == "steps":
        return max(0.0, goals.activity_goal_steps - value)  # exceeding the goal is not penalized
    if metric == "sleep_hours":
        return abs(goals.sleep_target_hours - value)
    return None  # RHR/HRV have no goal: their trends stay neutral


def trend_candidate(
    observations: Sequence[DailyObservation], comparison: MetricComparison, goals: Goals
) -> Candidate | None:
    metric = comparison.metric
    trend = compute_trend(observations, metric, comparison.target_date)
    if trend.status != "ok" or not crosses_threshold(metric, trend.change, trend.baseline.median):
        return None
    if trend.same_side_days < TREND_MIN_SAME_SIDE_DAYS:
        return None

    category, goal = "trend", None
    gap_before = _goal_gap(metric, trend.baseline.median, goals)
    gap_after = _goal_gap(metric, trend.recent_median, goals)
    if gap_before is not None and gap_after is not None:
        shrink = round(gap_before - gap_after, 2)
        goal_value = goals.activity_goal_steps if metric == "steps" else goals.sleep_target_hours
        goal = {"goal": goal_value, "gap_before": round(gap_before, 2), "gap_after": round(gap_after, 2)}
        if shrink > 0 and crosses_threshold(metric, shrink, trend.baseline.median):
            category = "improving_trend"

    target_value = comparison.observed_value
    target_change = None if target_value is None else target_value - trend.baseline.median
    on_target_day = (
        target_change is not None
        and (target_change > 0) == (trend.direction == "above")
        and crosses_threshold(metric, target_change, trend.baseline.median)
    )
    limitations = []
    if trend.baseline.valid_count < trend.baseline.window_days:
        limitations.append(
            f"{METRICS[metric].label}: {trend.baseline.valid_count} of {trend.baseline.window_days} "
            "trend-baseline days had valid data."
        )
    if trend.recent_valid_count < TREND_RECENT_DAYS:
        limitations.append(
            f"{METRICS[metric].label}: {trend.recent_valid_count} of the last {TREND_RECENT_DAYS} days had valid data."
        )
    return Candidate(
        category=category,
        metrics=[metric],
        direction=trend.direction,
        rule_id=_rule_id(category, [metric]),
        target_date=comparison.target_date,
        interpretation=interpretation_of(metric, trend.direction),
        magnitude_ratios={metric: threshold_ratio(metric, trend.change, trend.baseline.median)},
        persistence_days=trend.same_side_days,
        on_target_day=on_target_day,
        comparisons={metric: comparison},
        trend=trend,
        limitations=limitations,
        goal=goal,
    )


# --- combined ---


def combined_candidates(deviations: dict[str, Candidate]) -> list[Candidate]:
    """PRD §7 pairs of same-day deviations. Co-occurring observations, never a causal claim."""
    combined = []
    for (m1, d1), (m2, d2) in COMBINED_PAIRS:
        a, b = deviations.get(m1), deviations.get(m2)
        if not a or not b or a.direction != d1 or b.direction != d2:
            continue
        if "suspicious_spike" in a.qualifiers + b.qualifiers:
            continue  # a likely artefact should not be paired with a real change
        metrics = sorted([m1, m2], key=METRIC_ORDER.index)
        combined.append(
            Candidate(
                category="combined",
                metrics=metrics,
                direction="mixed" if d1 != d2 else d1,
                rule_id=_rule_id("combined", metrics),
                target_date=a.target_date,
                interpretation=(
                    f"{interpretation_of(m1, d1)} co-occurred with {interpretation_of(m2, d2)} on the same day"
                ),
                magnitude_ratios={**a.magnitude_ratios, **b.magnitude_ratios},
                persistence_days=min(a.persistence_days, b.persistence_days),
                on_target_day=True,
                comparisons={**a.comparisons, **b.comparisons},
                qualifiers=sorted(set(a.qualifiers + b.qualifiers)),
                limitations=a.limitations + b.limitations
                + ["These changes happened together; this does not show that one caused the other."],
            )
        )
    return combined


# --- data quality ("missing-data warning") ---


def data_quality_candidate(comparisons: dict[str, MetricComparison]) -> Candidate | None:
    issues: dict[str, list[str]] = {}
    limitations = []
    for metric in METRIC_ORDER:
        comparison = comparisons[metric]
        label = METRICS[metric].label
        metric_issues = [f.split(":")[0] for f in comparison.target_flags if not f.startswith("corrected:")]
        if comparison.baseline.status != "ok":
            metric_issues.append("insufficient_baseline")
            limitations.append(
                f"{label}: only {comparison.baseline.valid_count} valid days in the "
                f"{comparison.baseline.window_days}-day baseline window, so no baseline is calculated."
            )
        if comparison.observed_value is None:
            limitations.append(f"{label}: no valid value for this day ({', '.join(metric_issues) or 'missing'}).")
        elif "quality_marker" in metric_issues:
            limitations.append(f"{label}: the device marked this day's reading as low quality.")
        if metric_issues:
            issues[metric] = metric_issues
    if not issues:
        return None

    metrics = list(issues)
    return Candidate(
        category="data_quality",
        metrics=metrics,
        direction="none",
        rule_id=f"data_quality.{RULE_VERSION}",
        target_date=next(iter(comparisons.values())).target_date,
        interpretation="some data for this day is missing, inconsistent or too sparse for a reliable conclusion",
        magnitude_ratios={},
        persistence_days=0,
        on_target_day=True,
        comparisons={m: comparisons[m] for m in metrics},
        limitations=limitations,
        data_quality_issues=issues,
    )


# --- all rules ---


def generate_candidates(
    observations: Sequence[DailyObservation], target_date: date, goals: Goals
) -> list[Candidate]:
    """Every candidate for the target day, in a fixed order (category priority, then metric order)."""
    comparisons = {m: compare_to_baseline(observations, m, target_date) for m in METRIC_ORDER}
    deviations = {}
    candidates: list[Candidate] = []
    for metric in METRIC_ORDER:
        deviation = deviation_candidate(observations, comparisons[metric])
        if deviation:
            deviations[metric] = deviation
            candidates.append(deviation)
        trend = trend_candidate(observations, comparisons[metric], goals)
        if trend:
            candidates.append(trend)
    candidates.extend(combined_candidates(deviations))
    data_quality = data_quality_candidate(comparisons)
    if data_quality:
        candidates.append(data_quality)

    candidates.sort(key=lambda c: (CATEGORY_PRIORITY.index(c.category), METRIC_ORDER.index(c.metrics[0]), c.rule_id))
    return candidates
