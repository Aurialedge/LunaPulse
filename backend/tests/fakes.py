"""Scripted stand-ins for Gemini. Automated tests never call the real provider."""

import json
from collections.abc import Callable

from app.explanations import ModelTurn


class ScriptedChat:
    """Returns pre-written turns in order and records everything sent to it."""

    def __init__(self, turns: list[ModelTurn | Exception]) -> None:
        self.turns = list(turns)
        self.sent: list = []

    def _next(self) -> ModelTurn:
        turn = self.turns.pop(0)
        if isinstance(turn, Exception):
            raise turn
        return turn

    def send_text(self, text: str) -> ModelTurn:
        self.sent.append(text)
        return self._next()

    def send_tool_results(self, results: list[tuple[str, dict]]) -> ModelTurn:
        self.sent.append(results)
        return self._next()


def payload_from(message: str) -> dict:
    return json.loads(message[message.index("{"):])


def grounded_answer(payload: dict, extra_text: str = "") -> str:
    """A valid answer that only uses evidence numbers (what a well-behaved model would write)."""
    explanations = []
    for insight in payload["insights"]:
        evidence = insight["evidence"][0]
        explanations.append({
            "insight_id": insight["insight_id"],
            "title": f"{insight['interpretation']}".capitalize(),
            "summary": f"The value was {evidence['observed_value']} against a baseline of {evidence['baseline_value']}."
            + extra_text,
            "what_changed": f"A difference of {evidence['absolute_difference']} {evidence['observed_unit']}.",
            "why_it_matters": "It crossed the rule threshold for this metric.",
            "evidence_ids": [e["evidence_id"] for e in insight["evidence"]],
            "possible_context": "Everyday factors can change these values; this is not a diagnosis.",
            "limitations": insight["limitations"],
            "suggested_reflection": "Does anything about this day stand out?",
        })
    return json.dumps({"explanations": explanations, "dropped": []})


class PayloadAwareChat:
    """Builds its answer from the payload it receives. `answer` maps the payload to the JSON text to return."""

    def __init__(self, answer: Callable[[dict], str] = grounded_answer, tool_call: tuple[str, dict] | None = None):
        self.answer = answer
        self.tool_call = tool_call
        self.sent: list = []
        self._payload: dict | None = None

    def send_text(self, text: str) -> ModelTurn:
        self.sent.append(text)
        if self._payload is None:
            self._payload = payload_from(text)
            if self.tool_call:
                return ModelTurn(text="", function_calls=[self.tool_call])
        return ModelTurn(text=self.answer(self._payload))

    def send_tool_results(self, results: list[tuple[str, dict]]) -> ModelTurn:
        self.sent.append(results)
        return ModelTurn(text=self.answer(self._payload))
