import json
from datetime import date

import pytest

from app.candidates import Goals, generate_candidates
from app.evidence import build_evidence
from app.explanations import (
    ExplanationOut,
    InsightForLlm,
    ModelTurn,
    build_payload,
    check_explanation,
    explain_insights,
)
from app.observations import build_observations
from app.ranking import rank_candidates
from app.simulation import INJECTION_NOTE, PROFILES, SCENARIOS, simulate_user
from tests.fakes import PayloadAwareChat, ScriptedChat, grounded_answer, payload_from
from tests.unit.factory import TARGET, make_observations, recent

GOALS = Goals(activity_goal_steps=10_000, sleep_target_hours=7.5)
OBS = make_observations(overrides={"sleep_hours": recent([5.5, 5.5]), "hrv_ms": recent([90.0, 90.0])})


def selected_items(observations=OBS, target=TARGET, goals=GOALS) -> list[InsightForLlm]:
    ranked = rank_candidates(generate_candidates(observations, target, goals))
    return [
        InsightForLlm(f"ins{r.rank}", r.candidate, build_evidence(r.candidate, "u", observations, f"ins{r.rank}"))
        for r in ranked if r.status == "selected"
    ]


ITEMS = selected_items()


def explain(chat, note=None, items=ITEMS):
    return explain_insights(items, OBS, TARGET, note, (lambda: chat) if chat is not None else None)


def answer_text(**overrides) -> str:
    """A grounded answer for ITEMS, with optional field overrides on the first explanation."""
    payload = build_payload(ITEMS, TARGET, None)
    data = json.loads(grounded_answer(json.loads(json.dumps(payload))))
    data["explanations"][0].update(overrides)
    return json.dumps(data)


def test_two_insights_are_selected_for_the_fixture():
    assert sorted(i.candidate.candidate_id for i in ITEMS) == ["deviation:hrv_ms", "deviation:sleep_hours"]


# --- happy path ---


def test_grounded_answer_is_accepted():
    result = explain(ScriptedChat([ModelTurn(answer_text())]))
    assert result.provider == "gemini" and result.fallback_reason is None
    assert set(result.explanations) == {i.insight_id for i in ITEMS}
    assert all(p == "gemini" for p in result.providers.values())


def test_payload_has_only_selected_evidence_and_no_user_identity():
    chat = ScriptedChat([ModelTurn(answer_text())])
    explain(chat)
    payload = payload_from(chat.sent[0])
    assert [i["insight_id"] for i in payload["insights"]] == [i.insight_id for i in ITEMS]
    assert all("user_id" not in e for i in payload["insights"] for e in i["evidence"])
    assert "untrusted_user_note" not in payload


def test_code_fenced_json_is_accepted():
    assert explain(ScriptedChat([ModelTurn("```json\n" + answer_text() + "\n```")])).provider == "gemini"


# --- invalid output -> one retry -> fallback ---


def test_invalid_json_twice_falls_back():
    chat = ScriptedChat([ModelTurn("not json"), ModelTurn("{still not json")])
    result = explain(chat)
    assert result.provider == "fallback" and result.fallback_reason == "invalid_response"
    assert len(chat.sent) == 2 and "problems" in chat.sent[1]  # exactly one correction retry


def test_invalid_json_then_valid_retry_is_accepted():
    result = explain(ScriptedChat([ModelTurn("oops"), ModelTurn(answer_text())]))
    assert result.provider == "gemini"


def test_unsupported_number_is_rejected_and_falls_back():
    bad = answer_text(summary="Your HRV improved 40% this week.")
    chat = ScriptedChat([ModelTurn(bad), ModelTurn(bad)])
    result = explain(chat)
    first = ITEMS[0].insight_id
    assert result.providers[first] == "fallback" and result.fallback_reason == "validation_failed"
    assert "40" in chat.sent[1]  # the retry names the unsupported number
    # the other insight's valid explanation from the first answer is kept
    assert result.providers[ITEMS[1].insight_id] == "gemini" and result.provider == "mixed"


def test_retry_only_asks_for_failed_insights():
    fixed = json.loads(answer_text())
    fixed["explanations"] = fixed["explanations"][:1]
    chat = ScriptedChat([ModelTurn(answer_text(summary="It rose 999 units.")), ModelTurn(json.dumps(fixed))])
    result = explain(chat)
    assert result.provider == "gemini"
    assert ITEMS[0].insight_id in chat.sent[1] and ITEMS[1].insight_id not in chat.sent[1].split("insight_ids")[1]


@pytest.mark.parametrize(
    "text",
    [
        "This means you may have a condition worth checking.",
        "Short sleep caused by stress led to a higher heart rate.",
        "Consider a supplement or medication.",
        "You are at risk of illness.",
    ],
)
def test_unsafe_wording_is_rejected(text):
    errors = check_explanation(ExplanationOut.model_validate(json.loads(answer_text(possible_context=text))["explanations"][0]), ITEMS[0], [])
    assert any("forbidden wording" in e for e in errors)


def test_disclaimers_are_not_mistaken_for_unsafe_wording():
    explanation = json.loads(answer_text(possible_context="This is not a diagnosis and not medical advice."))
    assert check_explanation(ExplanationOut.model_validate(explanation["explanations"][0]), ITEMS[0], []) == []


def test_unknown_evidence_ids_and_added_insights_are_rejected():
    data = json.loads(answer_text(evidence_ids=["made-up-ev"]))
    data["explanations"].append({**data["explanations"][1], "insight_id": "ins_new"})
    chat = ScriptedChat([ModelTurn(json.dumps(data)), ModelTurn(json.dumps(data))])
    result = explain(chat)
    assert "ins_new" not in result.explanations
    assert result.providers[ITEMS[0].insight_id] == "fallback"


def test_missing_insight_in_answer_falls_back_for_that_insight():
    data = json.loads(answer_text())
    data["explanations"] = data["explanations"][1:]
    chat = ScriptedChat([ModelTurn(json.dumps(data)), ModelTurn(json.dumps(data))])
    assert explain(chat).providers[ITEMS[0].insight_id] == "fallback"


# --- drops, provider failures, no key ---


def test_model_may_drop_an_insight_with_a_reason():
    data = json.loads(answer_text())
    data["explanations"] = data["explanations"][1:]
    data["dropped"] = [{"insight_id": ITEMS[0].insight_id, "drop_reason": "Could not confirm in history."}]
    result = explain(ScriptedChat([ModelTurn(json.dumps(data))]))
    assert result.dropped == {ITEMS[0].insight_id: "Could not confirm in history."}
    assert ITEMS[0].insight_id not in result.explanations


@pytest.mark.parametrize("error", [TimeoutError("timed out"), RuntimeError("503 UNAVAILABLE secret details")])
def test_provider_failure_falls_back_for_everything(error):
    result = explain(ScriptedChat([error]))
    assert result.provider == "fallback" and result.fallback_reason == "provider_error"
    assert "secret details" not in json.dumps(result.explanations)


def test_failure_during_retry_keeps_already_valid_explanations():
    chat = ScriptedChat([ModelTurn(answer_text(summary="It rose 999 units.")), RuntimeError("boom")])
    result = explain(chat)
    assert result.providers == {ITEMS[0].insight_id: "fallback", ITEMS[1].insight_id: "gemini"}
    assert result.fallback_reason == "provider_error"


def test_no_api_key_uses_fallback_without_calling_anything():
    result = explain(None)
    assert result.provider == "fallback" and result.fallback_reason == "no_api_key"


def test_no_insights_means_no_call():
    chat = ScriptedChat([])
    result = explain_insights([], OBS, TARGET, None, lambda: chat)
    assert result.provider == "none" and chat.sent == []


# --- tools (D13) ---


def test_tool_results_ground_new_numbers_and_are_logged():
    history_value = OBS[-3].steps  # a number that is not in the evidence
    tool_call = ("get_metric_history", {"metric": "steps", "start": str(OBS[-3].date), "end": "2099-01-01", "user_id": "other"})
    chat = PayloadAwareChat(
        answer=lambda p: grounded_answer(p, extra_text=f" Steps were {history_value:,} two days earlier."),
        tool_call=tool_call,
    )
    result = explain(chat)
    assert result.provider == "gemini"
    name, tool_result = chat.sent[1][0]
    assert name == "get_metric_history" and tool_result["end"] == TARGET.isoformat()  # clamped
    assert result.tool_calls == [{"name": "get_metric_history", "args": {"metric": "steps", "start": str(OBS[-3].date), "end": "2099-01-01"}}]


def test_same_number_without_the_tool_call_is_rejected():
    history_value = OBS[-3].steps
    chat = PayloadAwareChat(answer=lambda p: grounded_answer(p, extra_text=f" Steps were {history_value:,} two days earlier."))
    assert explain(chat).provider == "fallback"


def test_unknown_tool_and_bad_arguments_return_errors_to_the_model():
    chat = ScriptedChat([
        ModelTurn("", [("delete_everything", {}), ("calculate_personal_baseline", {})]),
        ModelTurn(answer_text()),
    ])
    explain(chat)
    results = dict(chat.sent[1])
    assert "error" in results["delete_everything"] and "error" in results["calculate_personal_baseline"]


def test_endless_tool_calls_end_in_fallback():
    call = ModelTurn("", [("check_data_completeness", {"start": "2026-06-01", "end": "2026-06-30"})])
    chat = ScriptedChat([call] * 20)
    result = explain(chat)
    assert result.provider == "fallback"
    assert len([m for m in chat.sent if isinstance(m, list)]) <= 2 * 4  # at most 4 tool rounds per attempt


# --- untrusted user note (D15, Part B §7) ---


def test_injection_note_is_delimited_and_cannot_add_numbers_or_insights():
    def obey_the_note(payload: dict) -> str:
        data = json.loads(grounded_answer(payload, extra_text=" Your HRV improved 40% this week."))
        data["explanations"].append({**data["explanations"][0], "insight_id": "hrv_improved"})
        return json.dumps(data)

    chat = PayloadAwareChat(answer=obey_the_note)
    result = explain(chat, note=INJECTION_NOTE)
    assert payload_from(chat.sent[0])["untrusted_user_note"] == INJECTION_NOTE
    assert "hrv_improved" not in result.explanations
    assert set(result.providers.values()) == {"fallback"}
    text = json.dumps(result.explanations)
    assert "40%" not in text and "Ignore your rules" not in text


# --- the fallback itself only uses evidence numbers ---


def test_fallback_explanations_pass_the_numeric_claim_check_for_every_scenario():
    end = date(2026, 6, 30)
    for user_id, profile in PROFILES.items():
        for scenario in SCENARIOS:
            data = simulate_user(profile, scenario, 42, 120, end)
            observations = build_observations(user_id, data.readings, data.start_date, end)
            items = selected_items(observations, end, Goals(profile.activity_goal_steps, profile.sleep_target_hours))
            result = explain_insights(items, observations, end, None, None)
            for item in items:
                explanation = ExplanationOut.model_validate(result.explanations[item.insight_id])
                assert check_explanation(explanation, item, []) == [], (user_id, scenario, item.candidate.candidate_id)
