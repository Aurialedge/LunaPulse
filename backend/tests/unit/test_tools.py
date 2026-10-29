from datetime import timedelta

from app.baselines import compute_baseline
from app.tools import calculate_personal_baseline, check_data_completeness, get_metric_history
from tests.unit.factory import TARGET, make_observations

# 120 days of data that run 5 days past the target date
OBS = make_observations(
    days=120, end=TARGET + timedelta(days=5),
    overrides={"hrv_ms": {6: None, 7: None}}, flags={6: ["missing:hrv_ms"], 7: ["missing:hrv_ms"], 8: ["quality_marker:hrv_ms"]},
)


def test_history_is_clamped_to_target_date_and_90_days():
    result = get_metric_history(OBS, TARGET, "steps", "2020-01-01", (TARGET + timedelta(days=5)).isoformat())
    assert result["end"] == TARGET.isoformat()
    assert result["start"] == (TARGET - timedelta(days=89)).isoformat()
    assert len(result["values"]) == 90
    assert result["unit"] == "steps"


def test_history_reports_missing_values_and_flags():
    day = TARGET - timedelta(days=1)  # offset 6 from the data end
    result = get_metric_history(OBS, TARGET, "hrv_ms", day, day)
    assert result["values"] == [{"date": day.isoformat(), "value": None, "flags": ["missing:hrv_ms"]}]


def test_history_rejects_bad_arguments_without_raising():
    assert "error" in get_metric_history(OBS, TARGET, "blood_pressure", TARGET, TARGET)
    assert "error" in get_metric_history(OBS, TARGET, "steps", "yesterday", TARGET)
    assert "error" in get_metric_history(OBS, TARGET, "steps", TARGET + timedelta(days=2), TARGET + timedelta(days=4))


def test_baseline_tool_matches_the_baseline_engine():
    result = calculate_personal_baseline(OBS, TARGET, "hrv_ms")
    stats = compute_baseline(OBS, "hrv_ms", TARGET)
    assert (result["median"], result["valid_observation_count"], result["mad"]) == (stats.median, stats.valid_count, stats.mad)
    assert result["window_end"] == (TARGET - timedelta(days=1)).isoformat()
    assert "error" in calculate_personal_baseline(OBS, TARGET, "weight")


def test_completeness_counts_missing_and_flagged_days():
    start = TARGET - timedelta(days=6)
    result = check_data_completeness(OBS, TARGET, start, TARGET + timedelta(days=30))
    assert result["days"] == 7 and result["end"] == TARGET.isoformat()
    hrv = result["metrics"]["hrv_ms"]
    assert (hrv["valid_days"], hrv["missing_days"]) == (5, 2)
    assert hrv["coverage_percent"] == round(100 * 5 / 7, 1)
    assert hrv["flagged_dates"] == [(TARGET - timedelta(days=3)).isoformat()]
    assert result["metrics"]["steps"]["valid_days"] == 7
