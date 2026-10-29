from datetime import date, timedelta

import pytest

from app.candidates import SPIKE_LIMITATION, Goals, generate_candidates
from app.observations import build_observations
from app.simulation import PROFILES, simulate_user
from tests.unit.factory import TARGET, make_observations, recent

GOALS = Goals(activity_goal_steps=10_000, sleep_target_hours=7.5)


def flat(value: float, target: float | None, days: int = 60) -> dict[int, float | None]:
    """A flat history at `value`, with `target` on the end date."""
    return {**{i: value for i in range(1, days)}, 0: target}


def ids(candidates) -> list[str]:
    return [c.candidate_id for c in candidates]


# --- thresholds ---


@pytest.mark.parametrize(
    "metric, history, target, fires",
    [
        ("sleep_hours", 7.0, 6.0, True),  # exactly 1 h
        ("sleep_hours", 7.0, 6.01, False),
        ("resting_heart_rate_bpm", 60.0, 65.0, True),  # exactly 5 bpm
        ("resting_heart_rate_bpm", 60.0, 64.9, False),
        ("steps", 10_000, 7_500, True),  # exactly 25 %
        ("steps", 10_000, 7_510, False),
        ("steps", 3_000, 2_000, True),  # 33 % and exactly 1000 steps
        ("steps", 2_000, 1_400, False),  # 30 % but only 600 steps
        ("hrv_ms", 60.0, 51.0, True),  # exactly 15 %
        ("hrv_ms", 60.0, 51.1, False),
        ("hrv_ms", 15.0, 12.5, False),  # 16.7 % but only 2.5 ms
    ],
)
def test_deviation_thresholds_including_exact_boundary(metric, history, target, fires):
    candidates = generate_candidates(make_observations(overrides={metric: flat(history, target)}), TARGET, GOALS)
    assert (f"deviation:{metric}" in ids(candidates)) is fires


def test_zero_baseline_never_fires_a_percent_rule():
    candidates = generate_candidates(make_observations(overrides={"steps": flat(0, 8000)}), TARGET, GOALS)
    assert "deviation:steps" not in ids(candidates)


def test_stable_data_produces_no_candidates():
    assert generate_candidates(make_observations(), TARGET, GOALS) == []


def test_tiny_dispersion_deviation_is_kept_but_marked_not_standardized():
    candidates = generate_candidates(make_observations(overrides={"sleep_hours": flat(7.0, 5.5)}), TARGET, GOALS)
    deviation = next(c for c in candidates if c.candidate_id == "deviation:sleep_hours")
    assert "not_reliably_standardized" in deviation.qualifiers
    assert any("no standardized score" in note for note in deviation.limitations)


# --- insufficient / missing / conflicting data ---


def test_insufficient_baseline_suppresses_deviation_and_raises_data_quality():
    obs = make_observations(overrides={"hrv_ms": {**{i: None for i in range(1, 16)}, 0: 30.0}})
    candidates = generate_candidates(obs, TARGET, GOALS)
    assert "deviation:hrv_ms" not in ids(candidates)
    data_quality = next(c for c in candidates if c.category == "data_quality")
    assert data_quality.data_quality_issues == {"hrv_ms": ["insufficient_baseline"]}
    assert data_quality.rule_id == "data_quality.v1"


def test_conflicting_target_value_gives_data_quality_not_deviation():
    obs = make_observations(overrides={"hrv_ms": {0: None}}, flags={0: ["conflicting_values:hrv_ms"]})
    candidates = generate_candidates(obs, TARGET, GOALS)
    assert ids(candidates) == ["data_quality:hrv_ms"]
    assert candidates[0].data_quality_issues == {"hrv_ms": ["conflicting_values"]}


def test_corrected_value_is_not_a_data_quality_issue():
    obs = make_observations(flags={0: ["corrected:steps"]})
    assert generate_candidates(obs, TARGET, GOALS) == []


# --- trends & improving trends (D14) ---


def test_trend_needs_five_of_seven_days_on_the_same_side():
    four_low = make_observations(overrides={"sleep_hours": recent([7.5, 7.5, 7.5, 6.0, 6.0, 6.0, 6.0])})
    assert "trend:sleep_hours" not in ids(generate_candidates(four_low, TARGET, GOALS))
    five_low = make_observations(overrides={"sleep_hours": recent([7.5, 7.5, 6.0, 6.0, 6.0, 6.0, 6.0])})
    assert "trend:sleep_hours" in ids(generate_candidates(five_low, TARGET, GOALS))


def steps_trend(baseline: int, recent_value: int, goal: int):
    obs = make_observations(overrides={"steps": {**flat(baseline, recent_value), **recent([recent_value] * 7)}})
    candidates = generate_candidates(obs, TARGET, Goals(goal, 7.5))
    return next(c for c in candidates if c.category in ("trend", "improving_trend"))


def test_steps_rising_towards_goal_is_improving():
    candidate = steps_trend(8_000, 11_000, goal=12_000)
    assert candidate.category == "improving_trend" and candidate.rule_id == "improving_trend.steps.v1"
    assert candidate.goal == {"goal": 12_000, "gap_before": 4000.0, "gap_after": 1000.0}


def test_steps_rising_above_goal_is_a_plain_trend():
    assert steps_trend(8_000, 11_000, goal=6_000).category == "trend"


def test_steps_gap_shrinking_by_less_than_threshold_is_a_plain_trend():
    assert steps_trend(8_000, 11_000, goal=9_000).category == "trend"  # gap 1000 -> 0


@pytest.mark.parametrize(
    "baseline, recent_value, category",
    [(5.5, 7.0, "improving_trend"), (7.5, 9.0, "trend"), (7.5, 6.0, "trend")],
)
def test_sleep_trend_judged_against_sleep_target(baseline, recent_value, category):
    obs = make_observations(overrides={"sleep_hours": {**flat(baseline, recent_value), **recent([recent_value] * 7)}})
    trend = next(c for c in generate_candidates(obs, TARGET, GOALS) if c.metrics == ["sleep_hours"] and c.trend)
    assert trend.category == category


def test_rhr_trend_stays_neutral():
    obs = make_observations(overrides={"resting_heart_rate_bpm": recent([64.0] * 7)})
    trend = next(c for c in generate_candidates(obs, TARGET, GOALS) if c.trend)
    assert (trend.category, trend.direction, trend.goal) == ("trend", "above", None)


# --- combined & spikes ---


def test_combined_sleep_and_rhr_references_both_metrics():
    obs = make_observations(overrides={"sleep_hours": recent([5.5, 5.5]), "resting_heart_rate_bpm": recent([66.0, 66.0])})
    candidates = generate_candidates(obs, TARGET, GOALS)
    combined = next(c for c in candidates if c.category == "combined")
    assert combined.metrics == ["sleep_hours", "resting_heart_rate_bpm"]
    assert set(combined.comparisons) == {"sleep_hours", "resting_heart_rate_bpm"}
    assert combined.rule_id == "combined.sleep_hours+resting_heart_rate_bpm.v1"
    assert "co-occurred" in combined.interpretation and "caused" not in combined.interpretation


def test_no_combined_for_pairs_outside_the_list():
    obs = make_observations(overrides={"sleep_hours": recent([9.0, 9.0]), "resting_heart_rate_bpm": recent([66.0, 66.0])})
    assert not any(c.category == "combined" for c in generate_candidates(obs, TARGET, GOALS))


def test_one_day_spike_is_qualified_not_hidden():
    obs = make_observations(overrides={"resting_heart_rate_bpm": {0: 90.0}})
    deviation = next(c for c in generate_candidates(obs, TARGET, GOALS) if c.category == "deviation")
    assert "suspicious_spike" in deviation.qualifiers
    assert SPIKE_LIMITATION in deviation.limitations


def test_spike_uses_the_next_day_when_available():
    end = TARGET + timedelta(days=1)
    calm_next = make_observations(end=end, overrides={"resting_heart_rate_bpm": {1: 90.0}})
    raised_next = make_observations(end=end, overrides={"resting_heart_rate_bpm": {1: 90.0, 0: 80.0}})
    spike = lambda obs: next(c for c in generate_candidates(obs, TARGET, GOALS) if c.category == "deviation")  # noqa: E731
    assert "suspicious_spike" in spike(calm_next).qualifiers
    assert "suspicious_spike" not in spike(raised_next).qualifiers


def test_persistent_change_is_not_a_spike_and_spikes_are_not_combined():
    obs = make_observations(overrides={"resting_heart_rate_bpm": recent([90.0, 90.0])})
    deviation = next(c for c in generate_candidates(obs, TARGET, GOALS) if c.category == "deviation")
    assert "suspicious_spike" not in deviation.qualifiers and deviation.persistence_days == 2

    spiky = make_observations(overrides={"sleep_hours": recent([5.5, 5.5]), "resting_heart_rate_bpm": {0: 90.0}})
    assert not any(c.category == "combined" for c in generate_candidates(spiky, TARGET, GOALS))


# --- simulated scenarios (PRD §15: each injected scenario produces its expected candidate) ---

END = date(2026, 6, 30)


def scenario_candidates(user_id: str, scenario: str):
    profile = PROFILES[user_id]
    data = simulate_user(profile, scenario, 42, 120, END)
    observations = build_observations(user_id, data.readings, data.start_date, END)
    return generate_candidates(observations, END, Goals(profile.activity_goal_steps, profile.sleep_target_hours))


@pytest.mark.parametrize(
    "user_id, scenario, expected, direction",
    [
        ("user_a", "reduced_sleep", "deviation:sleep_hours", "below"),
        ("user_a", "elevated_rhr", "deviation:resting_heart_rate_bpm", "above"),
        ("user_a", "lower_hrv", "deviation:hrv_ms", "below"),
        ("user_a", "reduced_activity", "deviation:steps", "below"),
        ("user_c", "gradual_trend", "improving_trend:steps", "above"),
        ("user_a", "gradual_trend", "trend:steps", "above"),
    ],
)
def test_each_scenario_produces_its_expected_candidate(user_id, scenario, expected, direction):
    candidate = next(c for c in scenario_candidates(user_id, scenario) if c.candidate_id == expected)
    assert candidate.direction == direction


def test_missing_data_scenario_produces_a_missing_data_warning():
    data_quality = next(c for c in scenario_candidates("user_a", "missing_data") if c.category == "data_quality")
    assert data_quality.metrics == ["sleep_hours", "resting_heart_rate_bpm", "hrv_ms"]
    assert "insufficient_baseline" in data_quality.data_quality_issues["hrv_ms"]


@pytest.mark.parametrize("user_id", list(PROFILES))
def test_stable_scenario_forces_no_anomalies(user_id):
    assert scenario_candidates(user_id, "stable_baseline") == []


def test_candidate_generation_is_deterministic():
    assert scenario_candidates("user_b", "reduced_sleep") == scenario_candidates("user_b", "reduced_sleep")
