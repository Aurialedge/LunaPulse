"""Structured evidence records (PRD §8) and the deterministic confidence label (D9). Pure functions."""

from dataclasses import dataclass, field
from datetime import date, timedelta

from app.baselines import valid_values
from app.candidates import Candidate, rule_threshold_text
from app.config import (
    BASELINE_MIN_OBS,
    CONFIDENCE_HIGH_COVERAGE,
    CONFIDENCE_HIGH_MIN_PERSISTENCE,
    CONFIDENCE_LOW_COVERAGE,
    TREND_MIN_SAME_SIDE_DAYS,
    TREND_RECENT_DAYS,
)
from app.metrics import METRICS
from app.observations import DailyObservation
from app.ranking import has_flagged_target, is_unreliable


@dataclass
class EvidenceRecord:
    evidence_id: str
    user_id: str
    metric: str
    target_date: date
    comparison: str  # target_day_vs_baseline | recent_7_day_median_vs_baseline | data_quality
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
    supporting_observation_dates: list[date] = field(default_factory=list)
    supporting_observation_values: list[float] = field(default_factory=list)
    data_quality_flags: list[str] = field(default_factory=list)


def _recent_supporting(observations: list[DailyObservation], metric: str, target_date: date):
    """The valid values of the last 7 days ending at the target day."""
    values = valid_values(observations, metric, target_date - timedelta(days=TREND_RECENT_DAYS - 1), target_date)
    return [d for d, _ in values], [v for _, v in values]


def build_evidence(
    candidate: Candidate, user_id: str, observations: list[DailyObservation], id_prefix: str
) -> list[EvidenceRecord]:
    """One record per metric of the candidate. `id_prefix` makes ids unique per run (e.g. the insight id)."""
    records = []
    for index, metric in enumerate(candidate.metrics, start=1):
        comparison = candidate.comparisons[metric]
        dates, values = _recent_supporting(observations, metric, candidate.target_date)
        common = dict(
            evidence_id=f"{id_prefix}-ev{index}",
            user_id=user_id,
            metric=metric,
            target_date=candidate.target_date,
            observed_unit=METRICS[metric].unit,
            rule_id=candidate.rule_id,
            supporting_observation_dates=dates,
            supporting_observation_values=values,
            data_quality_flags=list(comparison.target_flags),
        )

        if candidate.trend is not None:
            trend = candidate.trend
            records.append(EvidenceRecord(
                **common,
                comparison="recent_7_day_median_vs_baseline",
                observed_value=trend.recent_median,
                baseline_value=trend.baseline.median,
                baseline_method=(
                    f"median of valid days {trend.baseline.window_start} to {trend.baseline.window_end}, "
                    f"compared with the median of {trend.recent_start} to {trend.recent_end}"
                ),
                baseline_window_start=trend.baseline.window_start,
                baseline_window_end=trend.baseline.window_end,
                valid_observation_count=trend.baseline.valid_count,
                absolute_difference=trend.change,
                percentage_difference=trend.percentage_change,
                standardized_score=None,
                score_method=None,
                direction=trend.direction,
                rule_threshold=(
                    f"{rule_threshold_text(metric)}; at least {TREND_MIN_SAME_SIDE_DAYS} of the last "
                    f"{TREND_RECENT_DAYS} days on the same side"
                ),
            ))
            continue

        baseline = comparison.baseline
        if candidate.category == "data_quality":
            threshold = (
                f"at least {BASELINE_MIN_OBS} valid days in the {baseline.window_days}-day baseline window, "
                "and a valid value on the target day"
            )
            flags = list(comparison.target_flags)
            if baseline.status != "ok":
                flags.append(f"insufficient_baseline:{metric}")
            common["data_quality_flags"] = flags
        else:
            threshold = rule_threshold_text(metric)
        records.append(EvidenceRecord(
            **common,
            comparison="data_quality" if candidate.category == "data_quality" else "target_day_vs_baseline",
            observed_value=comparison.observed_value,
            baseline_value=baseline.median,
            baseline_method=f"median of valid days {baseline.window_start} to {baseline.window_end} (target day excluded)",
            baseline_window_start=baseline.window_start,
            baseline_window_end=baseline.window_end,
            valid_observation_count=baseline.valid_count,
            absolute_difference=comparison.absolute_difference,
            percentage_difference=comparison.percentage_difference,
            standardized_score=comparison.standardized_score,
            score_method=comparison.score_method,
            direction=comparison.direction,
            rule_threshold=threshold,
        ))
    return records


def confidence_label(candidate: Candidate) -> str:
    """high / medium / low from evidence quality, never from the LLM (D9)."""
    if (
        candidate.category == "data_quality"
        or candidate.coverage < CONFIDENCE_LOW_COVERAGE
        or has_flagged_target(candidate)
        or "suspicious_spike" in candidate.qualifiers
    ):
        return "low"
    if (
        candidate.coverage >= CONFIDENCE_HIGH_COVERAGE
        and not is_unreliable(candidate)
        and candidate.persistence_days >= CONFIDENCE_HIGH_MIN_PERSISTENCE
    ):
        return "high"
    return "medium"


# --- deterministic fallback explanation (used when Gemini is unavailable or its answer fails validation) ---

NEUTRAL_CONTEXT = (
    "Day-to-day changes like this can reflect many everyday factors. This is an observation from your own data, "
    "not a diagnosis or medical advice."
)


def format_value(metric: str, value: float | None) -> str:
    if value is None:
        return "no valid value"
    if metric == "steps":
        return f"{round(value):,} steps"
    return f"{value:g} {METRICS[metric].unit}"


def _lower_label(metric: str) -> str:
    label = METRICS[metric].label
    return label if label.isupper() else label.lower()  # keep acronyms such as HRV


def _change_text(record: EvidenceRecord) -> str:
    difference = format_value(record.metric, abs(record.absolute_difference or 0))
    side = {"above": "above", "below": "below"}.get(record.direction, "at")
    text = f"{difference} {side} the personal baseline"
    if record.percentage_difference is not None:
        text += f" ({abs(record.percentage_difference):g}%)"
    return text


def fallback_explanation(insight_id: str, candidate: Candidate, records: list[EvidenceRecord]) -> dict:
    """A plain template built only from evidence values. Never repeats user-note text."""
    by_metric = {r.metric: r for r in records}
    first = records[0]
    label = METRICS[first.metric].label
    day = candidate.target_date.isoformat()

    if candidate.category == "data_quality":
        names = ", ".join(METRICS[m].label for m in candidate.metrics)
        title = "Missing-data warning"
        summary = f"Some data for {day} is missing, inconsistent or too sparse for a reliable comparison: {names}."
        what_changed = " ".join(
            f"{METRICS[m].label}: {', '.join(issues).replace('_', ' ')}."
            for m, issues in candidate.data_quality_issues.items()
        )
        why = "Selected so you know which conclusions are not supported by enough reliable data."
        reflection = "Was the device worn as usual on this day?"
    elif candidate.category == "combined":
        title = " and ".join(METRICS[m].label for m in candidate.metrics) + " changed together"
        summary = f"On {day}, " + "; ".join(
            f"{_lower_label(r.metric)} was {format_value(r.metric, r.observed_value)}, "
            f"compared with a baseline of {format_value(r.metric, r.baseline_value)}"
            for r in records
        ) + "."
        what_changed = " ".join(f"{METRICS[r.metric].label}: {_change_text(r)}." for r in records)
        why = (
            "Selected because both changes crossed their rule thresholds on the same day. They co-occurred; "
            "this does not show that one caused the other."
        )
        reflection = "Does anything about this day stand out to you?"
    elif candidate.trend is not None:
        trend = candidate.trend
        improving = candidate.category == "improving_trend"
        title = f"{label}: {'moving towards your goal' if improving else candidate.interpretation}"
        summary = (
            f"Over {trend.recent_start} to {trend.recent_end}, your median {_lower_label(first.metric)} was "
            f"{format_value(first.metric, first.observed_value)}, compared with "
            f"{format_value(first.metric, first.baseline_value)} over {trend.baseline.window_start} to "
            f"{trend.baseline.window_end}."
        )
        what_changed = f"That is {_change_text(first)}, on {trend.same_side_days} of the last {TREND_RECENT_DAYS} days."
        why = f"Selected because a sustained change crossed the trend rule ({first.rule_threshold})."
        if improving and candidate.goal:
            goal_text = format_value(first.metric, candidate.goal["goal"])
            why += f" The gap to your goal of {goal_text} became smaller."
        reflection = "Has your routine changed over the past week?"
    else:
        title = f"{label}: {candidate.interpretation}"
        summary = (
            f"{label} was {format_value(first.metric, first.observed_value)} on {day}, compared with your "
            f"usual {format_value(first.metric, first.baseline_value)} (median of "
            f"{first.valid_observation_count} days, {first.baseline_window_start} to {first.baseline_window_end})."
        )
        what_changed = f"That is {_change_text(first)}."
        why = f"Selected because the change crossed the rule threshold ({first.rule_threshold})"
        why += f" and has lasted {candidate.persistence_days} day(s)." if candidate.persistence_days > 1 else "."
        reflection = "Does anything about this day stand out to you?"

    return {
        "insight_id": insight_id,
        "title": title[:1].upper() + title[1:],
        "summary": summary,
        "what_changed": what_changed,
        "why_it_matters": why,
        "evidence_ids": [r.evidence_id for r in by_metric.values()],
        "possible_context": NEUTRAL_CONTEXT,
        "limitations": candidate.limitations or ["No additional limitations were found for this comparison."],
        "suggested_reflection": reflection,
    }
