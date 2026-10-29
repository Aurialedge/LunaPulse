from datetime import date, datetime, timedelta, timezone

from app.observations import ReadingData, build_daily_observation, build_observations

DAY = date(2026, 6, 1)


def obs(*readings: ReadingData):
    return build_daily_observation("u", DAY, readings)


def reading(metric: str, value: float | None, unit: str, **kwargs) -> ReadingData:
    return ReadingData(DAY, metric, value, unit, **kwargs)


def test_single_valid_reading_has_value_and_no_flags():
    o = obs(reading("sleep_hours", 7.25, "hours"))
    assert o.sleep_hours == 7.25
    assert "missing:sleep_hours" not in o.data_quality_flags
    assert not any(f.endswith(":sleep_hours") for f in o.data_quality_flags)


def test_no_reading_and_unavailable_reading_are_missing():
    o = obs(reading("hrv_ms", None, "ms", is_available=False))
    assert o.hrv_ms is None and "missing:hrv_ms" in o.data_quality_flags
    assert o.steps is None and "missing:steps" in o.data_quality_flags


def test_invalid_unit_is_never_used_or_converted():
    o = obs(reading("sleep_hours", 420, "min"))
    assert o.sleep_hours is None
    assert o.data_quality_flags.count("invalid_unit:sleep_hours") == 1
    assert "missing:sleep_hours" not in o.data_quality_flags


def test_out_of_range_values_are_flagged():
    assert obs(reading("steps", 250_000, "steps")).data_quality_flags[0] == "out_of_range:steps"
    assert obs(reading("steps", -1, "steps")).steps is None
    assert "out_of_range:resting_heart_rate_bpm" in obs(reading("resting_heart_rate_bpm", 10, "bpm")).data_quality_flags


def test_range_boundaries_are_valid():
    assert obs(reading("steps", 0, "steps")).steps == 0
    assert obs(reading("sleep_hours", 24, "hours")).sleep_hours == 24
    assert obs(reading("hrv_ms", 300, "ms")).hrv_ms == 300


def test_valid_reading_wins_over_bad_one_but_bad_one_is_still_flagged():
    o = obs(reading("sleep_hours", 7.0, "hours"), reading("sleep_hours", 420, "min"))
    assert o.sleep_hours == 7.0
    assert "invalid_unit:sleep_hours" in o.data_quality_flags


def test_conflicting_readings_beyond_tolerance_give_null():
    o = obs(reading("hrv_ms", 50, "ms"), reading("hrv_ms", 70, "ms"))
    assert o.hrv_ms is None
    assert "conflicting_values:hrv_ms" in o.data_quality_flags


def test_readings_within_and_exactly_at_tolerance_are_averaged():
    assert obs(reading("hrv_ms", 50, "ms"), reading("hrv_ms", 54, "ms")).hrv_ms == 52
    o = obs(reading("hrv_ms", 50, "ms"), reading("hrv_ms", 55, "ms"))  # tolerance is 5 ms
    assert o.hrv_ms == 52.5 and o.data_quality_flags.count("conflicting_values:hrv_ms") == 0


def test_user_correction_overrides_device_readings():
    o = obs(
        reading("hrv_ms", 50, "ms"),
        reading("hrv_ms", 70, "ms"),
        reading("hrv_ms", 61, "ms", source="user_correction"),
    )
    assert o.hrv_ms == 61
    assert "corrected:hrv_ms" in o.data_quality_flags
    assert "conflicting_values:hrv_ms" not in o.data_quality_flags


def test_latest_correction_wins_and_invalid_correction_is_ignored():
    t0 = datetime(2026, 6, 2, tzinfo=timezone.utc)
    o = obs(
        reading("steps", 8000, "steps"),
        reading("steps", 9000, "steps", source="user_correction", recorded_at=t0),
        reading("steps", 9500, "steps", source="user_correction", recorded_at=t0 + timedelta(hours=1)),
        reading("steps", -5, "steps", source="user_correction", recorded_at=t0 + timedelta(hours=2)),
    )
    assert o.steps == 9500


def test_quality_marker_keeps_value_but_adds_flag():
    o = obs(reading("resting_heart_rate_bpm", 61, "bpm", quality_marker="low_signal"))
    assert o.resting_heart_rate_bpm == 61
    assert "quality_marker:resting_heart_rate_bpm" in o.data_quality_flags


def test_steps_are_integers():
    o = obs(reading("steps", 8000, "steps"), reading("steps", 8001, "steps"))
    assert o.steps == 8000 and isinstance(o.steps, int)


def test_build_observations_one_per_day_including_days_without_readings():
    readings = [
        ReadingData(date(2026, 6, 1), "steps", 5000, "steps"),
        ReadingData(date(2026, 6, 3), "steps", 6000, "steps"),
        ReadingData(date(2026, 6, 9), "steps", 7000, "steps"),  # outside the range
    ]
    result = build_observations("u", readings, date(2026, 6, 1), date(2026, 6, 3))
    assert [o.date for o in result] == [date(2026, 6, 1), date(2026, 6, 2), date(2026, 6, 3)]
    assert [o.steps for o in result] == [5000, None, 6000]
    assert len([f for f in result[1].data_quality_flags if f.startswith("missing:")]) == 4
