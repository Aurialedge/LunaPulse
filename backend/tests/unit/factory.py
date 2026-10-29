"""Hand-made daily observations for analytics tests."""

from datetime import date, timedelta

from app.metrics import METRIC_ORDER
from app.observations import DailyObservation

TARGET = date(2026, 6, 30)
NORMAL = {"steps": 10_000, "sleep_hours": 7.5, "resting_heart_rate_bpm": 56.0, "hrv_ms": 70.0}
# Small repeating wiggle so baselines have a usable MAD (no metric crosses its threshold from this alone)
WIGGLE = {"steps": (0, 300, -300, 150), "sleep_hours": (0, 0.2, -0.2, 0.1),
          "resting_heart_rate_bpm": (0, 1, -1, 0), "hrv_ms": (0, 2, -2, 1)}


def make_observations(
    days: int = 60, end: date = TARGET, overrides: dict[str, dict[int, float | None]] | None = None,
    flags: dict[int, list[str]] | None = None,
) -> list[DailyObservation]:
    """`days` observations ending at `end`, all near NORMAL with a small wiggle.

    overrides: {metric: {days_before_end: value}}, e.g. {"sleep_hours": {0: 5.0}} sets the end date's sleep.
    flags: {days_before_end: [flag, ...]}.
    """
    overrides = overrides or {}
    flags = flags or {}
    result = []
    for i in range(days):
        offset = days - 1 - i
        day = end - timedelta(days=offset)
        observation = DailyObservation(user_id="u", date=day, data_quality_flags=list(flags.get(offset, [])))
        for metric in METRIC_ORDER:
            value = NORMAL[metric] + WIGGLE[metric][i % 4]
            if offset in overrides.get(metric, {}):
                value = overrides[metric][offset]
            if value is not None and metric == "steps":
                value = int(value)
            setattr(observation, metric, value)
        result.append(observation)
    return result


def recent(values: list[float | None]) -> dict[int, float | None]:
    """[v_{t-n+1}, ..., v_t] -> {days_before_end: value}."""
    return {len(values) - 1 - i: v for i, v in enumerate(values)}
