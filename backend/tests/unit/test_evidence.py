from dataclasses import fields
from datetime import date, timedelta

from app.candidates import Goals, generate_candidates
from app.evidence import EvidenceRecord, build_evidence, confidence_label
from app.observations import build_observations
from app.ranking import rank_candidates
from app.simulation import PROFILES, SCENARIOS, simulate_user
from tests.unit.factory import TARGET, make_observations, recent

GOALS = Goals(activity_goal_steps=10_000, sleep_target_hours=7.5)
PRD_FIELDS = {
    "evidence_id", "user_id", "metric", "target_date", "observed_value", "observed_unit", "baseline_value",
    "baseline_method", "baseline_window_start", "baseline_window_end", "valid_observation_count",
    "absolute_difference", "percentage_difference", "standardized_score", "rule_id", "rule_threshold",
    "supporting_observation_dates", "supporting_observation_values", "data_quality_flags",
}


def only(obs, category):
    return next(c for c in generate_candidates(obs, TARGET, GOALS) if c.category == category)


def test_evidence_record_has_every_prd_field():
    assert PRD_FIELDS <= {f.name for f in fields(EvidenceRecord)}


def test_deviation_evidence_matches_the_calculation():
    obs = make_observations(overrides={"sleep_hours": recent([5.5, 5.5])})
    candidate = only(obs, "deviation")
    (record,) = build_evidence(candidate, "u", obs, "ins1")
    comparison = candidate.comparisons["sleep_hours"]
    assert record.evidence_id == "ins1-ev1"
    assert (record.observed_value, record.observed_unit) == (5.5, "hours")
    assert record.baseline_value == comparison.baseline.median
    assert record.absolute_difference == comparison.absolute_difference
    assert record.baseline_window_end == TARGET - timedelta(days=1)
    assert record.valid_observation_count == 28
    assert record.rule_id == "deviation.sleep_hours.v1"
    assert "1 hours" in record.rule_threshold
    assert record.supporting_observation_dates[-1] == TARGET and record.supporting_observation_values[-1] == 5.5
    assert len(record.supporting_observation_dates) == len(record.supporting_observation_values) == 7


def test_combined_evidence_covers_every_metric():
    obs = make_observations(overrides={"sleep_hours": recent([5.5, 5.5]), "resting_heart_rate_bpm": recent([66.0, 66.0])})
    records = build_evidence(only(obs, "combined"), "u", obs, "ins2")
    assert [r.metric for r in records] == ["sleep_hours", "resting_heart_rate_bpm"]
    assert [r.evidence_id for r in records] == ["ins2-ev1", "ins2-ev2"]
    assert all(r.observed_value is not None and r.baseline_value is not None for r in records)


def test_trend_evidence_compares_recent_median_with_trend_baseline():
    obs = make_observations(overrides={"sleep_hours": recent([6.0] * 7)})
    candidate = only(obs, "trend")
    (record,) = build_evidence(candidate, "u", obs, "ins3")
    assert record.comparison == "recent_7_day_median_vs_baseline"
    assert record.observed_value == 6.0 and record.baseline_value == candidate.trend.baseline.median
    assert record.baseline_window_end == TARGET - timedelta(days=7)


def test_data_quality_evidence_flags_insufficient_baseline():
    obs = make_observations(overrides={"hrv_ms": {i: None for i in range(1, 16)}})
    (record,) = build_evidence(only(obs, "data_quality"), "u", obs, "ins4")
    assert "insufficient_baseline:hrv_ms" in record.data_quality_flags
    assert record.valid_observation_count == 13 and record.baseline_value is None


def test_every_selected_insight_in_every_scenario_has_valid_evidence():
    end = date(2026, 6, 30)
    for user_id, profile in PROFILES.items():
        for scenario in SCENARIOS:
            data = simulate_user(profile, scenario, 42, 120, end)
            obs = build_observations(user_id, data.readings, data.start_date, end)
            ranked = rank_candidates(generate_candidates(obs, end, Goals(profile.activity_goal_steps, profile.sleep_target_hours)))
            for item in (r for r in ranked if r.status == "selected"):
                records = build_evidence(item.candidate, user_id, obs, "x")
                assert [r.metric for r in records] == item.candidate.metrics
                assert all(r.rule_id == item.candidate.rule_id and r.user_id == user_id for r in records)


# --- confidence (D9) ---


def test_confidence_high_for_persistent_clean_deviation():
    obs = make_observations(overrides={"hrv_ms": recent([50.0, 50.0])})
    assert confidence_label(only(obs, "deviation")) == "high"


def test_confidence_medium_for_persistent_change_with_partial_coverage():
    gaps = {i: None for i in range(3, 11)}  # 20 of 28 baseline days valid: coverage 0.71
    candidate = only(make_observations(overrides={"hrv_ms": {**gaps, 1: 50.0, 0: 50.0}}), "deviation")
    assert candidate.persistence_days == 2 and candidate.coverage < 0.85
    assert confidence_label(candidate) == "medium"


def test_confidence_medium_for_single_day_change_that_is_not_a_spike():
    noisy = {i: 60.0 + (i % 5) * 3 for i in range(1, 60)}  # wide spread: a 15% drop scores well under 5
    candidate = only(make_observations(overrides={"hrv_ms": {**noisy, 0: 50.0}}), "deviation")
    assert candidate.persistence_days == 1 and "suspicious_spike" not in candidate.qualifiers
    assert confidence_label(candidate) == "medium"


def test_confidence_low_for_spike_low_coverage_flags_and_data_quality():
    spike = make_observations(overrides={"resting_heart_rate_bpm": {0: 90.0}})
    assert confidence_label(only(spike, "deviation")) == "low"

    sparse = make_observations(overrides={"hrv_ms": {**{i: None for i in range(2, 15)}, 0: 50.0, 1: 50.0}})
    assert confidence_label(only(sparse, "deviation")) == "low"  # 15 of 28 days

    flagged = make_observations(overrides={"hrv_ms": recent([50.0, 50.0])}, flags={0: ["quality_marker:hrv_ms"]})
    assert confidence_label(only(flagged, "deviation")) == "low"

    missing = make_observations(overrides={"hrv_ms": {0: None}}, flags={0: ["missing:hrv_ms"]})
    assert confidence_label(only(missing, "data_quality")) == "low"
