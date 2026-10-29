import random
from dataclasses import replace

import pytest

from app.candidates import Goals, generate_candidates
from app.config import DATA_QUALITY_SCORE, RANKING_WEIGHTS
from app.ranking import insight_key, rank_candidates, score_candidate
from tests.unit.factory import TARGET, make_observations, recent

GOALS = Goals(activity_goal_steps=10_000, sleep_target_hours=7.5)


def four_deviations():
    """Same-day, 2-day deviations in all four metrics, in directions that form no combined pair."""
    obs = make_observations(overrides={
        "steps": recent([14_000, 14_000]),
        "sleep_hours": recent([9.0, 9.0]),
        "resting_heart_rate_bpm": recent([48.0, 48.0]),
        "hrv_ms": recent([90.0, 90.0]),
    })
    return generate_candidates(obs, TARGET, GOALS)


def selected(ranked):
    return [r for r in ranked if r.status == "selected"]


def test_top_three_limit_is_enforced():
    candidates = four_deviations()
    assert len(candidates) == 4
    ranked = rank_candidates(candidates)
    assert [r.rank for r in selected(ranked)] == [1, 2, 3]
    assert [r.status for r in ranked].count("below_limit") == 1


def test_fewer_than_three_and_zero_are_valid():
    assert rank_candidates([]) == []
    one = generate_candidates(make_observations(overrides={"sleep_hours": recent([5.5, 5.5])}), TARGET, GOALS)
    assert len(selected(rank_candidates(one))) == 1


def test_redundant_candidates_for_the_same_metric_are_suppressed():
    obs = make_observations(overrides={"sleep_hours": recent([5.5] * 7)})
    ranked = rank_candidates(generate_candidates(obs, TARGET, GOALS))
    assert {r.candidate.category for r in ranked} == {"deviation", "trend"}
    assert sorted(r.status for r in ranked) == ["selected", "suppressed_redundant"]


def test_no_metric_appears_in_two_selected_insights():
    obs = make_observations(overrides={"sleep_hours": recent([5.5] * 3), "resting_heart_rate_bpm": recent([66.0] * 3)})
    ranked = rank_candidates(generate_candidates(obs, TARGET, GOALS))
    assert any(r.candidate.category == "combined" for r in ranked)
    metrics = [m for r in selected(ranked) for m in r.candidate.metrics]
    assert len(metrics) == len(set(metrics))


def test_score_is_the_weighted_sum_of_components_in_unit_range():
    for candidate in four_deviations():
        score, components = score_candidate(candidate)
        assert set(components) == set(RANKING_WEIGHTS)
        assert all(0 <= v <= 1 for v in components.values())
        assert score == pytest.approx(sum(RANKING_WEIGHTS[k] * v for k, v in components.items()), abs=1e-4)


def test_data_quality_has_a_fixed_score():
    obs = make_observations(overrides={"hrv_ms": {0: None}}, flags={0: ["missing:hrv_ms"]})
    (candidate,) = generate_candidates(obs, TARGET, GOALS)
    assert score_candidate(candidate) == (DATA_QUALITY_SCORE, {})


def test_novelty_lowers_the_score_of_a_recently_surfaced_insight():
    candidate = four_deviations()[0]
    fresh, _ = score_candidate(candidate)
    repeat, components = score_candidate(candidate, {insight_key(candidate)})
    assert components["novelty"] == 0.3 and repeat < fresh


def test_unreliable_evidence_lowers_reliability():
    obs = make_observations(overrides={"resting_heart_rate_bpm": {0: 90.0}})  # spike
    (spike,) = generate_candidates(obs, TARGET, GOALS)
    assert score_candidate(spike)[1]["reliability"] == 0.5


def test_ranking_is_deterministic_and_independent_of_input_order():
    candidates = four_deviations()
    expected = [(r.candidate.candidate_id, r.score, r.status) for r in rank_candidates(candidates)]
    shuffled = candidates[:]
    random.Random(3).shuffle(shuffled)
    assert [(r.candidate.candidate_id, r.score, r.status) for r in rank_candidates(shuffled)] == expected


def test_ties_break_by_category_priority_then_metric_then_rule_id():
    deviation = generate_candidates(make_observations(overrides={"sleep_hours": recent([5.5, 5.5])}), TARGET, GOALS)[0]
    trend_twin = replace(deviation, category="trend", rule_id="trend.sleep_hours.v1")
    ranked = rank_candidates([trend_twin, deviation])
    assert ranked[0].score == ranked[1].score
    assert [r.candidate.category for r in ranked] == ["deviation", "trend"]
