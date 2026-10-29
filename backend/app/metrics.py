"""The four wearable metrics: canonical unit, plausible range, conflict tolerance, neutral interpretations."""

from dataclasses import dataclass


@dataclass(frozen=True)
class MetricDef:
    name: str
    label: str
    unit: str
    min_value: float
    max_value: float
    # Two valid device readings for the same day that differ by more than this are "conflicting" (D5).
    conflict_tolerance: float
    above_interpretation: str
    below_interpretation: str


METRICS: dict[str, MetricDef] = {
    "steps": MetricDef(
        name="steps",
        label="Steps",
        unit="steps",
        min_value=0,
        max_value=100_000,
        conflict_tolerance=500,
        above_interpretation="more activity than usual",
        below_interpretation="reduced activity",
    ),
    "sleep_hours": MetricDef(
        name="sleep_hours",
        label="Sleep",
        unit="hours",
        min_value=0,
        max_value=24,
        conflict_tolerance=0.5,
        above_interpretation="longer sleep duration",
        below_interpretation="shorter sleep duration",
    ),
    "resting_heart_rate_bpm": MetricDef(
        name="resting_heart_rate_bpm",
        label="Resting heart rate",
        unit="bpm",
        min_value=25,
        max_value=220,
        conflict_tolerance=3,
        above_interpretation="elevated relative to the user's history",
        below_interpretation="lower relative to the user's history",
    ),
    "hrv_ms": MetricDef(
        name="hrv_ms",
        label="HRV",
        unit="ms",
        min_value=1,
        max_value=300,
        conflict_tolerance=5,
        above_interpretation="higher than the user's personal reference",
        below_interpretation="lower than the user's personal reference",
    ),
}

# Fixed display and tie-break order.
METRIC_ORDER: tuple[str, ...] = ("steps", "sleep_hours", "resting_heart_rate_bpm", "hrv_ms")
