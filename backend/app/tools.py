"""The three read-only grounding tools Gemini may call (Part B §3, D13). Pure functions.

The caller passes only the current user's observations, so a tool can never read another user's data. Dates are
clamped to <= the target date and to at most 90 days. Bad arguments return {"error": ...} instead of raising, so
the model gets a usable answer.
"""

from collections.abc import Sequence
from datetime import date, timedelta

from app.baselines import compute_baseline, valid_values
from app.config import TOOL_MAX_RANGE_DAYS
from app.metrics import METRIC_ORDER, METRICS
from app.observations import DailyObservation


def _parse_date(value: date | str) -> date:
    return value if isinstance(value, date) else date.fromisoformat(str(value))


def _clamp_range(start: date | str, end: date | str, target_date: date) -> tuple[date, date]:
    start, end = _parse_date(start), _parse_date(end)
    end = min(end, target_date)
    start = max(start, end - timedelta(days=TOOL_MAX_RANGE_DAYS - 1))
    if start > end:
        raise ValueError("start must be on or before end (end is clamped to the target date)")
    return start, end


def _check_metric(metric: str) -> None:
    if metric not in METRICS:
        raise ValueError(f"unknown metric; expected one of {list(METRIC_ORDER)}")


def get_metric_history(
    observations: Sequence[DailyObservation], target_date: date, metric: str, start: date | str, end: date | str
) -> dict:
    try:
        _check_metric(metric)
        start, end = _clamp_range(start, end, target_date)
    except ValueError as error:
        return {"error": str(error)}
    by_date = {o.date: o for o in observations}
    history = []
    for offset in range((end - start).days + 1):
        day = start + timedelta(days=offset)
        observation = by_date.get(day)
        flags = [f for f in (observation.data_quality_flags if observation else []) if f.endswith(f":{metric}")]
        history.append({
            "date": day.isoformat(),
            "value": observation.value(metric) if observation else None,
            "flags": flags if observation else [f"missing:{metric}"],
        })
    return {"metric": metric, "unit": METRICS[metric].unit, "start": start.isoformat(), "end": end.isoformat(),
            "values": history}


def calculate_personal_baseline(
    observations: Sequence[DailyObservation], target_date: date, metric: str
) -> dict:
    try:
        _check_metric(metric)
    except ValueError as error:
        return {"error": str(error)}
    stats = compute_baseline(observations, metric, target_date)
    return {
        "metric": metric,
        "unit": METRICS[metric].unit,
        "status": stats.status,
        "window_start": stats.window_start.isoformat(),
        "window_end": stats.window_end.isoformat(),
        "valid_observation_count": stats.valid_count,
        "median": stats.median,
        "mean": stats.mean,
        "std": stats.std,
        "mad": stats.mad,
    }


def check_data_completeness(
    observations: Sequence[DailyObservation], target_date: date, start: date | str, end: date | str
) -> dict:
    try:
        start, end = _clamp_range(start, end, target_date)
    except ValueError as error:
        return {"error": str(error)}
    days = (end - start).days + 1
    in_range = [o for o in observations if start <= o.date <= end]
    metrics = {}
    for metric in METRIC_ORDER:
        valid = len(valid_values(in_range, metric, start, end))
        flagged = sorted({
            o.date.isoformat()
            for o in in_range
            if any(f.endswith(f":{metric}") and not f.startswith("missing:") for f in o.data_quality_flags)
        })
        metrics[metric] = {
            "valid_days": valid,
            "missing_days": days - valid,
            "coverage_percent": round(100 * valid / days, 1),
            "flagged_dates": flagged,
        }
    return {"start": start.isoformat(), "end": end.isoformat(), "days": days, "metrics": metrics}
