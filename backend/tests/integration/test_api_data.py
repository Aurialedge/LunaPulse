from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.main import create_app
from app.simulation import INJECTION_NOTE, SCENARIOS, local_today
from tests.integration.conftest import make_settings

END = date(2026, 6, 30)


def assert_error(response, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    body = response.json()
    assert set(body) == {"error"} and body["error"]["code"] == code and body["error"]["message"]
    assert "Traceback" not in response.text


def generate(client, user_id="user_a", scenario="stable_baseline", **extra):
    body = {"user_id": user_id, "scenario": scenario, "end_date": END.isoformat(), **extra}
    return client.post("/api/v1/simulation/generate", json=body)


# --- health ---


def test_health_reports_fallback_mode_without_key(client):
    body = client.get("/api/v1/health").json()
    assert body == {"status": "ok", "db": "ok", "llm_mode": "fallback", "rule_version": "v1"}


def test_health_reports_gemini_mode_with_key_and_never_returns_the_key(tmp_path):
    with TestClient(create_app(make_settings(tmp_path, gemini_api_key="secret-test-key"))) as client:
        response = client.get("/api/v1/health")
    assert response.json()["llm_mode"] == "gemini"
    assert "secret-test-key" not in response.text


def test_unknown_route_uses_error_shape(client):
    assert_error(client.get("/api/v1/nope"), 404, "not_found")


# --- users ---


def test_startup_seeds_four_users_with_goals_timezone_and_local_today(client):
    users = client.get("/api/v1/users").json()
    assert [u["user_id"] for u in users] == ["user_a", "user_b", "user_c", "user_d"]
    for u in users:
        assert u["activity_goal_steps"] > 0 and u["sleep_target_hours"] > 0
        assert u["today"] == local_today(u["timezone"]).isoformat()
        assert u["scenario"] in SCENARIOS
        assert date.fromisoformat(u["data_end"]) - date.fromisoformat(u["data_start"]) == timedelta(days=119)


# --- observations ---


def test_observations_default_to_last_28_days_of_data(client):
    generate(client)
    body = client.get("/api/v1/users/user_a/observations").json()
    assert body["end"] == END.isoformat() and body["start"] == (END - timedelta(days=27)).isoformat()
    assert len(body["observations"]) == 28
    first = body["observations"][0]
    assert set(first) == {
        "user_id", "date", "steps", "sleep_hours", "resting_heart_rate_bpm", "hrv_ms", "data_quality_flags",
    }


def test_observations_explicit_range(client):
    generate(client)
    response = client.get("/api/v1/users/user_a/observations", params={"start": "2026-06-01", "end": "2026-06-07"})
    assert response.status_code == 200
    assert [o["date"] for o in response.json()["observations"]] == [f"2026-06-0{i}" for i in range(1, 8)]


def test_observations_outside_data_are_flagged_missing_not_invented(client):
    generate(client)
    body = client.get("/api/v1/users/user_a/observations", params={"start": "2026-07-01", "end": "2026-07-02"}).json()
    for o in body["observations"]:
        assert o["steps"] is None and "missing:steps" in o["data_quality_flags"]


def test_observations_invalid_inputs(client):
    assert_error(client.get("/api/v1/users/nobody/observations"), 404, "user_not_found")
    assert_error(client.get("/api/v1/users/user_a/observations", params={"start": "2026-13-01"}), 422, "validation_error")
    assert_error(
        client.get("/api/v1/users/user_a/observations", params={"start": "2026-06-10", "end": "2026-06-01"}),
        422, "invalid_date_range",
    )
    assert_error(
        client.get("/api/v1/users/user_a/observations", params={"start": "2024-01-01", "end": "2026-06-01"}),
        422, "invalid_date_range",
    )


def test_user_d_observations_show_quality_flags(client):
    generate(client, user_id="user_d")
    body = client.get("/api/v1/users/user_d/observations", params={"start": "2026-05-15", "end": END.isoformat()}).json()
    flags = {f.split(":")[0] for o in body["observations"] for f in o["data_quality_flags"]}
    assert {"missing", "out_of_range", "invalid_unit", "conflicting_values"} <= flags


# --- simulation ---


def test_scenarios_catalog(client):
    scenarios = client.get("/api/v1/simulation/scenarios").json()
    assert [s["name"] for s in scenarios] == list(SCENARIOS)
    assert all(s["description"] and s["affected_metrics"] and s["days_affected"] > 0 for s in scenarios)


def test_generate_replaces_data_and_is_reproducible(client):
    response = generate(client, scenario="reduced_sleep", seed=7, days=90)
    assert response.status_code == 200
    assert response.json() == {
        "user_id": "user_a", "scenario": "reduced_sleep", "seed": 7, "days": 90,
        "start_date": (END - timedelta(days=89)).isoformat(), "end_date": END.isoformat(),
        "reading_count": 360, "note_count": 0,
    }
    first = client.get("/api/v1/users/user_a/observations").json()
    generate(client, scenario="reduced_sleep", seed=7, days=90)
    assert client.get("/api/v1/users/user_a/observations").json() == first

    user = next(u for u in client.get("/api/v1/users").json() if u["user_id"] == "user_a")
    assert (user["scenario"], user["seed"], user["data_end"]) == ("reduced_sleep", 7, END.isoformat())


def test_generate_scenario_changes_the_selected_users_data_only(client):
    generate(client, user_id="user_a", scenario="stable_baseline")
    generate(client, user_id="user_b", scenario="stable_baseline")
    before_a = client.get("/api/v1/users/user_a/observations").json()
    before_b = client.get("/api/v1/users/user_b/observations").json()
    generate(client, user_id="user_a", scenario="reduced_activity")
    after_a = client.get("/api/v1/users/user_a/observations").json()
    assert after_a != before_a
    assert after_a["observations"][-1]["steps"] < before_a["observations"][-1]["steps"]
    assert client.get("/api/v1/users/user_b/observations").json() == before_b


def test_generate_defaults_seed_and_end_date(client):
    body = client.post("/api/v1/simulation/generate", json={"user_id": "user_c", "scenario": "gradual_trend"}).json()
    assert body["seed"] == 42 and body["days"] == 120
    assert body["end_date"] == local_today("Asia/Kolkata").isoformat()


def test_generate_invalid_inputs(client):
    assert_error(generate(client, user_id="nobody"), 404, "user_not_found")
    assert_error(generate(client, scenario="heart_attack"), 422, "validation_error")
    assert_error(generate(client, days=20), 422, "validation_error")
    assert_error(generate(client, days=366), 422, "validation_error")
    assert_error(generate(client, seed=-1), 422, "validation_error")
    assert_error(generate(client, end_date="not-a-date"), 422, "validation_error")
    assert_error(client.post("/api/v1/simulation/generate", json={"scenario": "stable_baseline"}), 422, "validation_error")


# --- notes ---


def test_user_d_has_seeded_injection_note(client):
    generate(client, user_id="user_d")
    notes = client.get("/api/v1/users/user_d/notes", params={"date": END.isoformat()}).json()
    assert [n["text"] for n in notes] == [INJECTION_NOTE]


def test_add_and_list_notes(client):
    generate(client)
    response = client.post("/api/v1/users/user_a/notes", json={"date": "2026-06-29", "text": "  Long hike today  "})
    assert response.status_code == 201
    note = response.json()
    assert note["text"] == "Long hike today" and note["user_id"] == "user_a" and note["date"] == "2026-06-29"
    assert [n["id"] for n in client.get("/api/v1/users/user_a/notes").json()] == [note["id"]]
    assert client.get("/api/v1/users/user_a/notes", params={"date": "2026-06-28"}).json() == []


def test_regenerating_removes_user_added_notes(client):
    generate(client)
    client.post("/api/v1/users/user_a/notes", json={"date": "2026-06-29", "text": "hello"})
    generate(client)
    assert client.get("/api/v1/users/user_a/notes").json() == []


def test_notes_invalid_inputs(client):
    url = "/api/v1/users/user_a/notes"
    assert_error(client.post("/api/v1/users/nobody/notes", json={"date": "2026-06-01", "text": "x"}), 404, "user_not_found")
    assert_error(client.get("/api/v1/users/nobody/notes"), 404, "user_not_found")
    assert_error(client.post(url, json={"date": "2026-06-01", "text": "   "}), 422, "validation_error")
    assert_error(client.post(url, json={"date": "2026-06-01", "text": "x" * 501}), 422, "validation_error")
    assert_error(client.post(url, json={"date": "06/01/2026", "text": "x"}), 422, "validation_error")
    future = (local_today("America/New_York") + timedelta(days=2)).isoformat()
    assert_error(client.post(url, json={"date": future, "text": "x"}), 422, "date_in_future")
