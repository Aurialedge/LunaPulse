# Decisions

Choices the PRD left open. Newest at the bottom. Format: **decision** — why.

## D1. Scenarios are injected into one of the four base users
`POST /simulation/generate {user_id, scenario, seed, days, end_date?}` regenerates that user's full history from their base profile and the seed, then applies the scenario to the most recent days. Only users A–D exist. — Chosen by the user. Keeps the user list small and the demo flow natural (pick a user, inject an anomaly, generate insights).

## D2. Gemini model: `gemini-2.5-flash` via the official `google-genai` SDK
Set with the `GEMINI_MODEL` env var. Uses structured output (`response_mime_type="application/json"` plus a Pydantic `response_schema`). Without a key, the app runs in fallback mode. — Chosen by the user.

## D3. Minimal Docker in the final phase
One Dockerfile each for backend and frontend, plus `docker-compose.yml`. The local (non-Docker) run stays the primary documented path. — Chosen by the user.

## D4. Tooling: `venv` + `pip` + `requirements.txt`; npm; one git commit per phase
— Chosen by the user. Local Python is 3.13, which is compatible with the PRD's 3.12+ requirement.

## D5. Validation: implausible values are nulled and flagged, not dropped
Plausible ranges: steps 0–100 000, sleep 0–24 h, RHR 25–220 bpm, HRV 1–300 ms. An out-of-range value or wrong unit gets stored as `null` with a flag such as `out_of_range:resting_heart_rate_bpm` or `invalid_unit:hrv_ms`. A missing value gets `missing:<metric>`. — Analytics never see bad numbers, and the flag keeps the reason visible (PRD §5, §14, §15).

## D6. Two comparison windows: target-day deviation and 7-day trend
- **Deviation:** the target day vs. baseline window `[t-28, t-1]`.
- **Trend:** the median of the recent window `[t-6, t]` vs. baseline window `[t-34, t-7]`. This catches gradual or persistent shifts that a moving baseline would absorb (User C, `gradual_trend`).
Both windows use the configurable window length and minimum-observation count. — Simple, explainable, and needs no regression model.

## D7. Redundancy: a metric appears in at most one selected insight
Candidates are sorted by score and selected greedily. A candidate is suppressed (`suppressed_redundant`) if any of its metrics are already covered by a selected insight. So a combined sleep+RHR insight suppresses the separate sleep and RHR deviations, and a deviation suppresses the same metric's trend (or the reverse, whichever scores higher). — Meets "avoid nearly identical insights" with a rule you can explain in one sentence.

## D8. Novelty uses previously *surfaced* insights from persisted runs
A candidate's novelty is lower if an insight with the same `(category, metrics, direction)` was selected for this user in the 3 days before the target date, within the current dataset version. The target date's own earlier runs are ignored, so regenerating a day gives the same result. — The PRD says "previously surfaced insights", which means persisted history.

## D9. The confidence label is deterministic and never comes from the LLM
`high` / `medium` / `low` is computed from valid-observation coverage, data-quality flags, standardization reliability, and persistence. The LLM's schema doesn't include it; the backend merges it in afterward. — PRD §9: the label must reflect evidence quality, not the LLM's confidence.

## D10. Numeric-claim validation for LLM output
Every number in the LLM's text fields must match an allowed value (evidence numbers and their rounded forms, day counts, the date parts of supporting dates) within a small tolerance. Any unsupported number fails validation, then: one correction retry, then the fallback for that insight. — PRD §9, §15 "unsupported numeric claims are rejected".

## D11. Idempotent generation keyed by dataset version
Each user has a `dataset_version` that goes up whenever their observations are regenerated. A run is identified by `(user_id, target_date, dataset_version, rule_version)`. `POST …/insights/generate` returns the existing run unless `{"force": true}` is passed, in which case the run is replaced. Runs from older dataset versions are marked `stale` and not returned by `GET`. — PRD §13: no duplicates, and stale insights are invalidated.

## D12. Default simulation: seed 42, 120 days ending today
Reproducible for a given `(seed, days, end_date)`. Tests always pass an explicit `end_date`. — 120 days gives more than 90 days of history plus room for the 28-day baseline and 34-day trend windows.
