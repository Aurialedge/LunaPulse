import json
from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.models import InsightRun
from app.simulation import INJECTION_NOTE, MESSY_SPIKE_DAY
from tests.fakes import PayloadAwareChat, ScriptedChat, grounded_answer
from tests.integration.test_api_data import assert_error

END = date(2026, 6, 30)


def generate_data(client, user_id="user_a", scenario="reduced_sleep"):
    response = client.post(
        "/api/v1/simulation/generate", json={"user_id": user_id, "scenario": scenario, "end_date": END.isoformat()}
    )
    assert response.status_code == 200


def generate_insights(client, user_id="user_a", day=END, **extra):
    return client.post(f"/api/v1/users/{user_id}/insights/generate", json={"date": day.isoformat(), **extra})


def feed(client, user_id="user_a", day=END, **params):
    return client.get(f"/api/v1/users/{user_id}/insights", params={"date": day.isoformat(), **params})


# --- baselines ---


def test_baselines_endpoint_returns_all_metrics_with_statistics(client):
    generate_data(client)
    body = client.get("/api/v1/users/user_a/baselines", params={"date": END.isoformat()}).json()
    assert body["date"] == END.isoformat()
    by_metric = {m["metric"]: m for m in body["metrics"]}
    assert list(by_metric) == ["steps", "sleep_hours", "resting_heart_rate_bpm", "hrv_ms"]
    sleep = by_metric["sleep_hours"]
    assert sleep["status"] == "ok" and sleep["window_end"] == (END - timedelta(days=1)).isoformat()
    assert sleep["absolute_difference"] == pytest.approx(sleep["observed_value"] - sleep["median"], abs=0.01)
    assert sleep["direction"] == "below" and sleep["day_over_day"] is not None


def test_baselines_report_insufficient_history(client):
    generate_data(client, scenario="missing_data")
    hrv = client.get("/api/v1/users/user_a/baselines").json()["metrics"][3]
    assert hrv["status"] == "insufficient" and hrv["median"] is None and hrv["valid_observation_count"] < 14


def test_baselines_invalid_inputs(client):
    generate_data(client)
    assert_error(client.get("/api/v1/users/nobody/baselines"), 404, "user_not_found")
    assert_error(client.get("/api/v1/users/user_a/baselines", params={"date": "2026-02-30"}), 422, "validation_error")
    assert_error(client.get("/api/v1/users/user_a/baselines", params={"date": "2020-01-01"}), 422, "date_out_of_range")


# --- generate & feed (fallback mode: no key) ---


def test_generate_in_fallback_mode_returns_evidence_backed_insights(client):
    generate_data(client)
    response = generate_insights(client)
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "fallback" and body["fallback_reason"] == "no_api_key"
    assert 1 <= len(body["insights"]) <= 3
    for insight in body["insights"]:
        assert insight["evidence_ids"] and insight["explanation"]["evidence_ids"] == insight["evidence_ids"]
        assert insight["confidence_label"] in {"high", "medium", "low"}
        evidence = client.get(f"/api/v1/insights/{insight['insight_id']}/evidence").json()
        assert [e["evidence_id"] for e in evidence] == insight["evidence_ids"]
        assert [e["metric"] for e in evidence] == insight["metrics"]
    first = body["insights"][0]
    assert first["category"] == "deviation" and first["metrics"] == ["sleep_hours"]
    statuses = {c["status"] for c in body["candidates"]}
    assert "selected" in statuses


def test_ui_values_trace_to_evidence(client):
    generate_data(client)
    insight = generate_insights(client).json()["insights"][0]
    (evidence,) = client.get(f"/api/v1/insights/{insight['insight_id']}/evidence").json()
    baselines = {m["metric"]: m for m in client.get("/api/v1/users/user_a/baselines").json()["metrics"]}
    assert evidence["observed_value"] == baselines["sleep_hours"]["observed_value"]
    assert evidence["baseline_value"] == baselines["sleep_hours"]["median"]
    assert str(evidence["observed_value"]) in insight["explanation"]["summary"]


def test_stable_data_gives_an_empty_feed(client):
    generate_data(client, scenario="stable_baseline")
    body = generate_insights(client).json()
    assert body["insights"] == [] and body["provider"] == "none" and body["candidates"] == []


def test_generation_is_idempotent_and_force_creates_a_new_run(client):
    generate_data(client)
    first = generate_insights(client).json()
    again = generate_insights(client).json()
    assert again["run_id"] == first["run_id"]
    assert [i["insight_id"] for i in again["insights"]] == [i["insight_id"] for i in first["insights"]]

    forced = generate_insights(client, force=True).json()
    assert forced["run_id"] != first["run_id"]
    assert feed(client).json()["run_id"] == forced["run_id"]
    old = client.get(f"/api/v1/insights/{first['insights'][0]['insight_id']}").json()
    assert old["is_stale"] is True
    # deterministic: same scores and categories
    assert [(i["category"], i["score"]) for i in forced["insights"]] == [(i["category"], i["score"]) for i in first["insights"]]


def test_feed_before_generation_is_404(client):
    generate_data(client)
    assert_error(feed(client), 404, "insights_not_generated")


def test_generate_and_feed_invalid_inputs(client):
    generate_data(client)
    assert_error(generate_insights(client, user_id="nobody"), 404, "user_not_found")
    assert_error(generate_insights(client, day=END + timedelta(days=1)), 422, "date_out_of_range")
    assert_error(client.post("/api/v1/users/user_a/insights/generate", json={"date": "tomorrow"}), 422, "validation_error")
    assert_error(client.post("/api/v1/users/user_a/insights/generate", json={"force": "maybe"}), 422, "validation_error")
    assert_error(feed(client, user_id="nobody"), 404, "user_not_found")
    assert_error(client.get("/api/v1/users/user_a/insights", params={"date": "x"}), 422, "validation_error")


def test_insight_and_evidence_not_found(client):
    assert_error(client.get("/api/v1/insights/ins_missing"), 404, "insight_not_found")
    assert_error(client.get("/api/v1/insights/ins_missing/evidence"), 404, "insight_not_found")


def test_regenerating_data_makes_insights_stale(client):
    generate_data(client)
    insight_id = generate_insights(client).json()["insights"][0]["insight_id"]
    generate_data(client, scenario="elevated_rhr")
    assert_error(feed(client), 404, "insights_outdated")
    assert client.get(f"/api/v1/insights/{insight_id}").json()["is_stale"] is True
    assert generate_insights(client).json()["insights"][0]["metrics"] == ["resting_heart_rate_bpm"]


# --- messy data (Part B §6) ---


def test_spike_is_qualified_and_conflict_gives_a_warning(client):
    generate_data(client, user_id="user_d", scenario="stable_baseline")
    spike = generate_insights(client, user_id="user_d", day=END - timedelta(days=MESSY_SPIKE_DAY)).json()["insights"][0]
    assert spike["confidence_label"] == "low"
    assert any("artefact" in note for note in spike["explanation"]["limitations"])
    conflict = generate_insights(client, user_id="user_d", day=END - timedelta(days=1)).json()["insights"]
    assert [(i["category"], i["metrics"]) for i in conflict] == [("data_quality", ["hrv_ms"])]
    assert conflict[0]["explanation"]["title"] == "Missing-data warning"


# --- feedback (D17) ---


def test_feedback_hides_the_insight_and_is_kept(client):
    generate_data(client)
    body = generate_insights(client).json()
    insight_id = body["insights"][0]["insight_id"]
    response = client.post(f"/api/v1/insights/{insight_id}/feedback", json={"action": "dismissed"})
    assert response.status_code == 201 and response.json()["action"] == "dismissed"

    visible = feed(client).json()
    assert insight_id not in [i["insight_id"] for i in visible["insights"]]
    assert visible["hidden_count"] == 1
    everything = feed(client, include_hidden=True).json()
    hidden = next(i for i in everything["insights"] if i["insight_id"] == insight_id)
    assert hidden["feedback"] == "dismissed"
    client.post(f"/api/v1/insights/{insight_id}/feedback", json={"action": "irrelevant"})
    assert client.get(f"/api/v1/insights/{insight_id}").json()["feedback"] == "irrelevant"
    # feedback does not change the ranking
    forced = generate_insights(client, force=True).json()
    assert [i["category"] for i in forced["insights"]] == [i["category"] for i in body["insights"]]


def test_feedback_invalid_inputs(client):
    generate_data(client)
    insight_id = generate_insights(client).json()["insights"][0]["insight_id"]
    assert_error(client.post(f"/api/v1/insights/{insight_id}/feedback", json={"action": "love_it"}), 422, "validation_error")
    assert_error(client.post(f"/api/v1/insights/{insight_id}/feedback", json={}), 422, "validation_error")
    assert_error(client.post("/api/v1/insights/ins_missing/feedback", json={"action": "dismissed"}), 404, "insight_not_found")


# --- corrections (D18, Part B §5) ---


def test_correction_recomputes_and_removes_the_outdated_insight(client):
    generate_data(client)
    before = generate_insights(client).json()
    old_id = before["insights"][0]["insight_id"]
    usual = client.get("/api/v1/users/user_a/baselines").json()["metrics"][1]["median"]

    response = client.post("/api/v1/users/user_a/corrections",
                           json={"date": END.isoformat(), "metric": "sleep_hours", "value": usual})
    assert response.status_code == 200
    body = response.json()
    assert body["stale_run_count"] == 1 and body["value"] == usual and body["unit"] == "hours"
    assert body["feed"]["run_id"] != before["run_id"]
    assert all(i["metrics"] != ["sleep_hours"] or i["category"] != "deviation" for i in body["feed"]["insights"])
    assert client.get(f"/api/v1/insights/{old_id}").json()["is_stale"] is True
    assert feed(client).json()["run_id"] == body["feed"]["run_id"]

    observation = client.get("/api/v1/users/user_a/observations").json()["observations"][-1]
    assert observation["sleep_hours"] == usual and "corrected:sleep_hours" in observation["data_quality_flags"]


def test_correction_marks_later_affected_runs_stale(client):
    generate_data(client)
    corrected_day = END - timedelta(days=5)
    generate_insights(client, day=END)
    generate_insights(client, day=END - timedelta(days=20))  # before the corrected day: unaffected
    client.post("/api/v1/users/user_a/corrections",
                json={"date": corrected_day.isoformat(), "metric": "steps", "value": 12345.4})
    assert_error(feed(client, day=END), 404, "insights_outdated")
    assert feed(client, day=END - timedelta(days=20)).status_code == 200
    value = next(o for o in client.get("/api/v1/users/user_a/observations").json()["observations"]
                 if o["date"] == corrected_day.isoformat())["steps"]
    assert value == 12345


def test_correction_invalid_inputs(client):
    generate_data(client)
    url = "/api/v1/users/user_a/corrections"
    day = END.isoformat()
    assert_error(client.post(url, json={"date": day, "metric": "sleep_hours", "value": 30}), 422, "invalid_value")
    assert_error(client.post(url, json={"date": day, "metric": "steps", "value": -10}), 422, "invalid_value")
    assert_error(client.post(url, json={"date": day, "metric": "weight", "value": 70}), 422, "validation_error")
    assert_error(client.post(url, json={"date": day, "metric": "steps", "value": "lots"}), 422, "validation_error")
    assert_error(client.post(url, json={"date": day, "metric": "steps", "value": "8000"}), 422, "validation_error")
    assert_error(client.post(url, json={"date": day, "metric": "sleep_hours", "value": True}), 422, "validation_error")
    assert_error(client.post(url, json={"date": day, "metric": "sleep_hours", "value": None}), 422, "validation_error")
    batch = "/api/v1/users/user_a/corrections/batch"
    assert_error(client.post(batch, json={"corrections": [{"date": day, "metric": "steps", "value": True}]}), 422, "validation_error")
    assert_error(client.post(url, json={"date": "2020-01-01", "metric": "steps", "value": 100}), 422, "date_out_of_range")
    assert_error(client.post("/api/v1/users/nobody/corrections", json={"date": day, "metric": "steps", "value": 1}), 404, "user_not_found")


# --- mocked Gemini through the API ---


def test_mocked_gemini_explanations_and_tool_calls_are_stored(client):
    generate_data(client)
    client.app.state.chat_factory = lambda: PayloadAwareChat(
        tool_call=("calculate_personal_baseline", {"metric": "sleep_hours"})
    )
    body = generate_insights(client).json()
    assert body["provider"] == "gemini" and body["fallback_reason"] is None
    assert all(i["explanation_provider"] == "gemini" for i in body["insights"])
    with client.app.state.session_factory() as session:
        tool_calls = session.scalar(select(InsightRun.tool_calls).where(InsightRun.run_id == body["run_id"]))
    assert tool_calls == [{"name": "calculate_personal_baseline", "args": {"metric": "sleep_hours"}}]


def test_dropped_insight_is_recorded_not_shown(client):
    generate_data(client)

    def drop_first(payload):
        data = json.loads(grounded_answer(payload))
        first = data["explanations"].pop(0)
        data["dropped"] = [{"insight_id": first["insight_id"], "drop_reason": "Not supported by history."}]
        return json.dumps(data)

    client.app.state.chat_factory = lambda: PayloadAwareChat(answer=drop_first)
    body = generate_insights(client).json()
    dropped = [c for c in body["candidates"] if c["status"] == "dropped_by_llm"]
    assert len(dropped) == 1 and dropped[0]["drop_reason"] == "Not supported by history."
    assert dropped[0]["insight_id"] not in [i["insight_id"] for i in body["insights"]]


def test_injection_note_creates_no_insight_and_no_numbers(client):
    generate_data(client, user_id="user_d", scenario="lower_hrv")
    deterministic = generate_insights(client, user_id="user_d").json()

    def obey_the_note(payload):
        assert payload["untrusted_user_note"] == INJECTION_NOTE
        data = json.loads(grounded_answer(payload, extra_text=" Your HRV improved 40% this week."))
        data["explanations"].append({**data["explanations"][0], "insight_id": "hrv_improved_40"})
        return json.dumps(data)

    client.app.state.chat_factory = lambda: PayloadAwareChat(answer=obey_the_note)
    body = generate_insights(client, user_id="user_d", force=True).json()
    assert [i["category"] for i in body["insights"]] == [i["category"] for i in deterministic["insights"]]
    assert body["provider"] == "fallback" and body["fallback_reason"] == "validation_failed"
    text = json.dumps(body)
    assert "40%" not in text and "hrv_improved_40" not in text and "Ignore your rules" not in text


def test_provider_error_never_reaches_the_client(client):
    generate_data(client)
    client.app.state.chat_factory = lambda: ScriptedChat([RuntimeError("503 UNAVAILABLE key=AIzaSECRET")])
    response = generate_insights(client)
    assert response.status_code == 200
    assert response.json()["fallback_reason"] == "provider_error"
    assert "AIzaSECRET" not in response.text and "UNAVAILABLE" not in response.text


# --- goal progress (dark UI rings; computed in the backend) ---


def test_baselines_include_goal_progress_for_steps_and_sleep(client):
    generate_data(client, user_id="user_b", scenario="reduced_sleep")
    metrics = {m["metric"]: m for m in client.get("/api/v1/users/user_b/baselines").json()["metrics"]}
    steps = metrics["steps"]
    assert steps["goal_value"] == 9000
    assert steps["goal_progress_percent"] == min(100.0, round(100 * steps["observed_value"] / 9000, 1))
    assert metrics["sleep_hours"]["goal_value"] == 8.0
    assert metrics["sleep_hours"]["goal_progress_percent"] == round(100 * metrics["sleep_hours"]["observed_value"] / 8.0, 1)
    for metric in ("resting_heart_rate_bpm", "hrv_ms"):
        assert metrics[metric]["goal_value"] is None and metrics[metric]["goal_progress_percent"] is None


def test_goal_progress_is_capped_and_null_without_a_value(client):
    generate_data(client, user_id="user_a", scenario="gradual_trend")
    steps = client.get("/api/v1/users/user_a/baselines").json()["metrics"][0]
    assert steps["observed_value"] > 10000 and steps["goal_progress_percent"] == 100.0
    generate_data(client, user_id="user_a", scenario="missing_data")
    sleep = client.get("/api/v1/users/user_a/baselines").json()["metrics"][1]
    assert sleep["observed_value"] is None and sleep["goal_progress_percent"] is None and sleep["goal_value"] == 7.5


# --- outdated vs never generated (D30) ---


def test_never_generated_day_is_not_outdated(client):
    generate_data(client)
    generate_insights(client, day=END)
    assert_error(feed(client, day=END - timedelta(days=10)), 404, "insights_not_generated")


def test_recalculating_an_outdated_day_returns_the_new_run(client):
    generate_data(client)
    first = generate_insights(client).json()
    generate_data(client, scenario="elevated_rhr")
    response = feed(client)
    assert_error(response, 404, "insights_outdated")
    assert END.isoformat() in response.json()["error"]["message"]
    again = generate_insights(client).json()
    assert again["run_id"] != first["run_id"]
    assert feed(client).json()["run_id"] == again["run_id"]


# --- batch corrections for the data editor (D29) ---


def batch(client, items, user_id="user_a"):
    return client.post(f"/api/v1/users/{user_id}/corrections/batch", json={"corrections": items})


def observation_on(client, day, user_id="user_a"):
    body = client.get(f"/api/v1/users/{user_id}/observations", params={"start": day.isoformat(), "end": day.isoformat()}).json()
    return body["observations"][0]


def test_batch_saves_all_edits_marks_stale_and_does_not_regenerate(client):
    generate_data(client)
    generate_insights(client, day=END)
    two_back = END - timedelta(days=2)
    response = batch(client, [
        {"date": END.isoformat(), "metric": "sleep_hours", "value": 7.4},
        {"date": two_back.isoformat(), "metric": "steps", "value": 12345.6},
    ])
    assert response.status_code == 200, response.text
    assert response.json() == {
        "user_id": "user_a", "saved": 2, "stale_run_count": 1, "dates": [two_back.isoformat(), END.isoformat()],
    }
    assert_error(feed(client, day=END), 404, "insights_outdated")
    today = observation_on(client, END)
    assert today["sleep_hours"] == 7.4 and "corrected:sleep_hours" in today["data_quality_flags"]
    earlier = observation_on(client, two_back)
    assert earlier["steps"] == 12346 and "corrected:steps" in earlier["data_quality_flags"]


def test_batch_is_all_or_nothing(client):
    generate_data(client)
    before = observation_on(client, END)
    response = batch(client, [
        {"date": END.isoformat(), "metric": "steps", "value": 5000},
        {"date": END.isoformat(), "metric": "sleep_hours", "value": 30},
    ])
    assert_error(response, 422, "invalid_value")
    message = response.json()["error"]["message"]
    # Shown to the user as-is, so it names the metric the way the UI does
    assert message == f"{END.isoformat()}: Sleep must be between 0 and 24 hours."
    assert observation_on(client, END) == before


def test_batch_can_fill_a_missing_day(client):
    generate_data(client, scenario="missing_data")
    assert observation_on(client, END)["sleep_hours"] is None
    assert batch(client, [{"date": END.isoformat(), "metric": "sleep_hours", "value": 7.1}]).status_code == 200
    filled = observation_on(client, END)
    assert filled["sleep_hours"] == 7.1
    assert "corrected:sleep_hours" in filled["data_quality_flags"]
    assert "missing:sleep_hours" not in filled["data_quality_flags"]


def test_batch_invalid_inputs(client):
    generate_data(client)
    day = END.isoformat()
    assert_error(batch(client, []), 422, "validation_error")
    too_many = [{"date": (END - timedelta(days=i // 4)).isoformat(), "metric": "steps", "value": 1} for i in range(113)]
    assert_error(batch(client, too_many), 422, "validation_error")
    duplicate = [{"date": day, "metric": "steps", "value": 1}, {"date": day, "metric": "steps", "value": 2}]
    assert_error(batch(client, duplicate), 422, "invalid_value")
    assert_error(batch(client, [{"date": day, "metric": "steps", "value": 1}], user_id="nobody"), 404, "user_not_found")
    assert_error(batch(client, [{"date": "2020-01-01", "metric": "steps", "value": 1}]), 422, "invalid_value")
    assert_error(batch(client, [{"date": day, "metric": "weight", "value": 1}]), 422, "validation_error")


# --- review fixes ---


def test_data_saved_while_explaining_makes_the_new_run_outdated(client):
    """A save that lands while Gemini is still explaining must not leave a 'current' run built from old data."""
    generate_data(client)

    def answer_after_a_concurrent_save(payload):
        # the user saves an edit in the data editor while this generation is still running
        assert batch(client, [{"date": END.isoformat(), "metric": "sleep_hours", "value": 7.4}]).status_code == 200
        return grounded_answer(payload)

    client.app.state.chat_factory = lambda: PayloadAwareChat(answer=answer_after_a_concurrent_save)
    assert generate_insights(client).status_code == 200
    assert_error(feed(client), 404, "insights_outdated")


def test_correction_values_must_be_finite(client):
    generate_data(client)
    raw = '{"date": "%s", "metric": "steps", "value": NaN}' % END.isoformat()
    headers = {"Content-Type": "application/json"}
    assert_error(client.post("/api/v1/users/user_a/corrections", content=raw, headers=headers), 422, "validation_error")
    raw_batch = '{"corrections": [{"date": "%s", "metric": "steps", "value": Infinity}]}' % END.isoformat()
    assert_error(client.post("/api/v1/users/user_a/corrections/batch", content=raw_batch, headers=headers), 422, "validation_error")
