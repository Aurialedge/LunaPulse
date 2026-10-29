import statistics
from datetime import date, datetime, timedelta, timezone

import pytest

from app.metrics import METRIC_ORDER
from app.observations import build_observations
from app.simulation import (
    INJECTION_NOTE,
    MESSY_CONFLICT_DAY,
    MESSY_GAP_DAYS,
    MESSY_INVALID_UNIT_DAY,
    MESSY_OUT_OF_RANGE_DAY,
    MESSY_SPIKE_DAY,
    PROFILES,
    SCENARIOS,
    local_today,
    simulate_user,
)

END = date(2026, 6, 30)


def observations(user_id: str, scenario: str, seed: int = 42, days: int = 120, end: date = END):
    data = simulate_user(PROFILES[user_id], scenario, seed, days, end)
    return build_observations(user_id, data.readings, data.start_date, end)


def series(obs, metric: str):
    return [o.value(metric) for o in obs]


def valid(values):
    return [v for v in values if v is not None]


# --- reproducibility & shape ---


def test_same_seed_gives_identical_data():
    a = simulate_user(PROFILES["user_b"], "reduced_sleep", 7, 90, END)
    b = simulate_user(PROFILES["user_b"], "reduced_sleep", 7, 90, END)
    assert a == b


def test_different_seed_gives_different_data():
    assert observations("user_a", "stable_baseline", seed=1) != observations("user_a", "stable_baseline", seed=2)


@pytest.mark.parametrize("user_id", list(PROFILES))
def test_every_user_gets_one_observation_per_day_for_at_least_90_days(user_id):
    obs = observations(user_id, "stable_baseline")
    assert len(obs) == 120
    assert obs[0].date == END - timedelta(days=119) and obs[-1].date == END


@pytest.mark.parametrize("user_id", ["user_a", "user_b", "user_c"])
def test_clean_users_only_have_missing_or_quality_flags(user_id):
    for o in observations(user_id, "stable_baseline"):
        assert all(f.split(":")[0] in {"missing", "quality_marker"} for f in o.data_quality_flags)


def test_profiles_are_distinct():
    a = observations("user_a", "stable_baseline")
    b = observations("user_b", "stable_baseline")
    c = observations("user_c", "stable_baseline")
    d = observations("user_d", "stable_baseline")
    # B is more irregular than A
    assert statistics.stdev(valid(series(b, "sleep_hours"))) > 2 * statistics.stdev(valid(series(a, "sleep_hours")))
    assert statistics.stdev(valid(series(b, "steps"))) > 2 * statistics.stdev(valid(series(a, "steps")))
    # C changes gradually: the last month is clearly more active than the first month
    assert statistics.median(valid(series(c, "steps")[-30:])) > 1.15 * statistics.median(valid(series(c, "steps")[:30]))
    # D has far more missing values than A
    missing = lambda obs: sum(o.value(m) is None for o in obs for m in METRIC_ORDER)  # noqa: E731
    assert missing(d) > 5 * max(1, missing(a))


def test_unknown_scenario_is_rejected():
    with pytest.raises(ValueError):
        simulate_user(PROFILES["user_a"], "nope", 42, 30, END)


# --- scenarios: compare against a scenario that leaves the metric alone ---


@pytest.mark.parametrize(
    "scenario, metric, reference, check",
    [
        ("reduced_sleep", "sleep_hours", "elevated_rhr", lambda new, old: old - new == pytest.approx(1.8, abs=0.02)),
        ("elevated_rhr", "resting_heart_rate_bpm", "reduced_sleep", lambda new, old: new - old == pytest.approx(8, abs=1)),
        ("lower_hrv", "hrv_ms", "reduced_sleep", lambda new, old: new / old == pytest.approx(0.7, abs=0.01)),
        ("reduced_activity", "steps", "reduced_sleep", lambda new, old: new / old == pytest.approx(0.55, abs=0.01)),
    ],
)
def test_scenario_changes_only_its_metric_on_its_recent_days(scenario, metric, reference, check):
    n = SCENARIOS[scenario].days_affected
    new = series(observations("user_a", scenario), metric)
    old = series(observations("user_a", reference), metric)
    assert new[:-n] == old[:-n]
    for a, b in zip(new[-n:], old[-n:]):
        assert a is not None and b is not None and check(a, b)
    # other metrics untouched outside the reference scenario's own window
    other = next(m for m in METRIC_ORDER if m not in SCENARIOS[scenario].affected_metrics + SCENARIOS[reference].affected_metrics)
    assert series(observations("user_a", scenario), other) == series(observations("user_a", reference), other)


def test_gradual_trend_ramps_steps_up_over_21_days():
    new = series(observations("user_a", "gradual_trend"), "steps")
    old = series(observations("user_a", "reduced_sleep"), "steps")
    assert new[:-21] == old[:-21]
    ratios = [a / b for a, b in zip(new[-21:], old[-21:])]
    assert ratios == sorted(ratios)
    assert ratios[-1] == pytest.approx(1.45, abs=0.01)


def test_missing_data_scenario_removes_recent_overnight_metrics_and_starves_hrv_baseline():
    obs = observations("user_a", "missing_data")
    for o in obs[-3:]:
        assert o.sleep_hours is None and o.resting_heart_rate_bpm is None and o.hrv_ms is None
        assert o.steps is not None
    hrv_baseline = valid(series(obs, "hrv_ms")[-29:-1])  # 28 days before the end date
    assert len(hrv_baseline) < 14


def test_stable_baseline_keeps_recent_days_close_to_usual():
    obs = observations("user_b", "stable_baseline")
    recent = valid(series(obs, "sleep_hours")[-7:])
    earlier = valid(series(obs, "sleep_hours")[:-7])
    assert len(recent) == 7
    assert statistics.stdev(recent) < 0.5 * statistics.stdev(earlier)


# --- User D messy data (Part B §6) ---


def test_user_d_has_gap_bad_values_spike_conflict_and_injection_note():
    data = simulate_user(PROFILES["user_d"], "stable_baseline", 42, 120, END)
    by_date = {o.date: o for o in build_observations("user_d", data.readings, data.start_date, END)}
    day = lambda offset: by_date[END - timedelta(days=offset)]  # noqa: E731

    for offset in MESSY_GAP_DAYS:
        assert all(day(offset).value(m) is None for m in METRIC_ORDER)
    assert "out_of_range:steps" in day(MESSY_OUT_OF_RANGE_DAY).data_quality_flags
    assert "invalid_unit:sleep_hours" in day(MESSY_INVALID_UNIT_DAY).data_quality_flags
    assert "conflicting_values:hrv_ms" in day(MESSY_CONFLICT_DAY).data_quality_flags
    assert day(MESSY_SPIKE_DAY).resting_heart_rate_bpm >= day(MESSY_SPIKE_DAY + 1).resting_heart_rate_bpm + 20
    assert [(n.date, n.text) for n in data.notes] == [(END, INJECTION_NOTE)]


def test_messy_data_survives_short_histories():
    data = simulate_user(PROFILES["user_d"], "reduced_sleep", 42, 21, END)
    assert data.start_date == END - timedelta(days=20)
    assert all(r.date >= data.start_date for r in data.readings)


# --- timezones (D19) ---


def test_local_today_uses_the_users_timezone():
    now = datetime(2026, 1, 1, 3, 0, tzinfo=timezone.utc)
    assert local_today("America/New_York", now) == date(2025, 12, 31)
    assert local_today("Europe/London", now) == date(2026, 1, 1)
    assert local_today("Australia/Sydney", now) == date(2026, 1, 1)
    late = datetime(2026, 1, 1, 20, 0, tzinfo=timezone.utc)
    assert local_today("Asia/Kolkata", late) == date(2026, 1, 2)
