from datetime import timedelta

import pytest

from app.baselines import compare_to_baseline, compute_baseline, compute_trend, threshold_ratio
from tests.unit.factory import TARGET, make_observations, recent


def test_target_day_is_excluded_from_its_own_baseline():
    obs = make_observations(overrides={"resting_heart_rate_bpm": {0: 200.0}})
    baseline = compute_baseline(obs, "resting_heart_rate_bpm", TARGET)
    assert baseline.window_end == TARGET - timedelta(days=1)
    assert baseline.window_start == TARGET - timedelta(days=28)
    assert all(d < TARGET for d, _ in baseline.values)
    assert baseline.median == 56.0 and baseline.valid_count == 28


def test_missing_values_are_excluded():
    obs = make_observations(overrides={"hrv_ms": {i: None for i in range(1, 11)}})
    baseline = compute_baseline(obs, "hrv_ms", TARGET)
    assert baseline.valid_count == 18
    assert baseline.status == "ok"


def test_insufficient_history_is_explicit_and_invents_nothing():
    obs = make_observations(overrides={"hrv_ms": {i: None for i in range(1, 16)}})  # 13 valid left
    baseline = compute_baseline(obs, "hrv_ms", TARGET)
    assert (baseline.status, baseline.valid_count) == ("insufficient", 13)
    assert baseline.median is None and baseline.mean is None and baseline.mad is None
    comparison = compare_to_baseline(obs, "hrv_ms", TARGET)
    assert comparison.absolute_difference is None and comparison.standardized_score is None
    assert comparison.observed_value is not None


def test_exactly_minimum_observations_is_enough():
    obs = make_observations(overrides={"hrv_ms": {i: None for i in range(1, 15)}})  # 14 valid
    assert compute_baseline(obs, "hrv_ms", TARGET).status == "ok"


def test_short_history_is_insufficient():
    assert compute_baseline(make_observations(days=10), "steps", TARGET).status == "insufficient"


def test_statistics_and_robust_z():
    obs = make_observations()
    baseline = compute_baseline(obs, "hrv_ms", TARGET)
    # window values cycle 70, 72, 68, 71 (target excluded): median 70.5; |x - median| is 0.5/1.5/2.5/0.5 -> MAD 1.0
    assert baseline.median == 70.5 and baseline.mad == 1.0 and baseline.mean == 70.25
    obs[-1].hrv_ms = 60.0
    comparison = compare_to_baseline(obs, "hrv_ms", TARGET)
    assert comparison.absolute_difference == -10.5
    assert comparison.percentage_difference == pytest.approx(-14.9)
    assert comparison.score_method == "robust_z"
    assert comparison.standardized_score == pytest.approx(round(0.6745 * -10.5 / 1.0, 2))
    assert comparison.direction == "below"
    assert comparison.interpretation == "lower than the user's personal reference"


def test_zero_mad_and_zero_std_give_no_score_without_dividing():
    flat = {i: 60.0 for i in range(1, 60)}
    obs = make_observations(overrides={"resting_heart_rate_bpm": {**flat, 0: 70.0}})
    comparison = compare_to_baseline(obs, "resting_heart_rate_bpm", TARGET)
    assert comparison.baseline.mad == 0 and comparison.baseline.std == 0
    assert comparison.standardized_score is None and comparison.score_method is None
    assert comparison.absolute_difference == 10.0


def test_zero_mad_falls_back_to_sd_score():
    # 20 days at 60 and 8 days at 70: MAD is 0 but the SD is usable
    values = {i: (70.0 if i <= 8 else 60.0) for i in range(1, 60)}
    obs = make_observations(overrides={"resting_heart_rate_bpm": {**values, 0: 75.0}})
    comparison = compare_to_baseline(obs, "resting_heart_rate_bpm", TARGET)
    assert comparison.baseline.mad == 0
    assert comparison.score_method == "z"
    expected = (75.0 - comparison.baseline.mean) / comparison.baseline.std
    assert comparison.standardized_score == pytest.approx(expected, abs=0.01)


def test_zero_baseline_has_no_percentage_and_no_division_error():
    obs = make_observations(overrides={"steps": {**{i: 0 for i in range(1, 60)}, 0: 5000}})
    comparison = compare_to_baseline(obs, "steps", TARGET)
    assert comparison.baseline.median == 0
    assert comparison.percentage_difference is None
    assert comparison.absolute_difference == 5000
    assert threshold_ratio("steps", 5000, 0) is None


def test_missing_target_value_gives_no_comparison():
    obs = make_observations(overrides={"sleep_hours": {0: None}}, flags={0: ["missing:sleep_hours"]})
    comparison = compare_to_baseline(obs, "sleep_hours", TARGET)
    assert comparison.observed_value is None and comparison.absolute_difference is None
    assert comparison.target_flags == ["missing:sleep_hours"]


def test_day_over_day_and_week_over_week():
    week = [7.0] * 7
    obs = make_observations(overrides={"sleep_hours": {**recent([8.0] * 7 + week[:-1] + [6.5])}})
    comparison = compare_to_baseline(obs, "sleep_hours", TARGET)
    assert comparison.day_over_day == -0.5
    this_week = (7.0 * 6 + 6.5) / 7
    assert comparison.week_over_week == pytest.approx(round(this_week - 8.0, 2))


def test_week_over_week_needs_four_valid_days_each_week():
    obs = make_observations(overrides={"steps": {i: None for i in range(7, 11)}})  # 3 valid in the earlier week
    assert compare_to_baseline(obs, "steps", TARGET).week_over_week is None


def test_trend_windows_and_minimums():
    obs = make_observations(overrides={"sleep_hours": recent([6.0] * 7)})
    trend = compute_trend(obs, "sleep_hours", TARGET)
    assert trend.status == "ok"
    assert trend.recent_start == TARGET - timedelta(days=6)
    assert (trend.baseline.window_start, trend.baseline.window_end) == (
        TARGET - timedelta(days=34), TARGET - timedelta(days=7),
    )
    assert trend.recent_median == 6.0 and trend.change == -1.55 and trend.same_side_days == 7

    four = make_observations(overrides={"sleep_hours": recent([None, None, None, 6.0, 6.0, 6.0, 6.0])})
    assert compute_trend(four, "sleep_hours", TARGET).status == "ok"
    three = make_observations(overrides={"sleep_hours": recent([None, None, None, None, 6.0, 6.0, 6.0])})
    assert compute_trend(three, "sleep_hours", TARGET).status == "insufficient"
    short = make_observations(days=20)  # trend baseline [t-34, t-7] holds only 13 days
    assert compute_trend(short, "sleep_hours", TARGET).status == "insufficient"


def test_calculations_are_deterministic():
    obs = make_observations(overrides={"steps": {0: 4000}})
    assert compare_to_baseline(obs, "steps", TARGET) == compare_to_baseline(obs, "steps", TARGET)
