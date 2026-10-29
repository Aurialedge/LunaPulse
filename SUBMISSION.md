# LunaPulse — submission (Intern Hiring Task 3)

Personalised Wearable Insight & Evidence Agent. All data is synthetic, and nothing here is medical advice.

| Deliverable | Where |
|---|---|
| **Source code** | This repository: `backend/` (FastAPI, Python) and `frontend/` (React, TypeScript) |
| **README with setup and run instructions** | [`README.md`](README.md) → *Quick start*: Git Bash/macOS and Windows PowerShell commands, configuration, and how to run the tests |
| **Sample data** | [`docs/sample-data/`](docs/sample-data/): 4 users × 120 days as CSV, with a guide to each user and to User D's deliberate gaps, spike, conflicting values, wrong unit and injection note. It's reproducible: seed 42, `python -m scripts.export_sample_data` |
| **Tests** | 193 backend (pytest: calculations, rules, ranking, evidence, LLM validation with Gemini mocked, every API endpoint), 106 frontend (Vitest), 10 end-to-end (Playwright against the real backend). See [`REPORT.md` §6](REPORT.md#6-acceptance-test-results) |
| **Demo video** | **VIDEO LINK** (the file is [`docs/demo/lunapulse-demo.webm`](docs/demo/lunapulse-demo.webm), ≈ 2.5 min) |
| **Code walkthrough** | [`REPORT.md`](REPORT.md): §3.4 candidate rules, [§4 how an insight is selected](REPORT.md#4-code-walkthrough-how-an-insight-is-selected), [§5 grounding the LLM response](REPORT.md#5-code-walkthrough-grounding-the-llm-response) |

## Task 3 requirements → implementation

| Task section | Where it's handled |
|---|---|
| 1. Wearable data and user goals | [`simulation.py`](backend/app/simulation.py), `Reading`/`User` in [`models.py`](backend/app/models.py) |
| 2. Baselines and trend calculations | [`baselines.py`](backend/app/baselines.py), [`candidates.py`](backend/app/candidates.py): deviation, improving/declining trend, missing-data warning, minimum valid days |
| 3. LLM integration and evidence tools | [`explanations.py`](backend/app/explanations.py) (Gemini, claim validation, fallback), [`tools.py`](backend/app/tools.py): `get_metric_history`, `calculate_personal_baseline`, `check_data_completeness` |
| 4. Daily insight feed | `GET/POST /users/{id}/insights`; the dashboard's **Insights** page and **Why am I seeing this?** drawer |
| 5. Feedback and data correction | `POST /insights/{id}/feedback`, `POST /users/{id}/corrections` (+ `/batch`); outdated runs are never shown |
| 6. Incomplete and contradictory data | [`observations.py`](backend/app/observations.py) quality flags, spike qualifier, conflict warning, timezone-aware dates |
| 7. Safety and verification | Validator (no invented numbers, no diagnosis/treatment/risk/causal wording), notes as untrusted data; tests listed in REPORT.md §6 |
| 8. Deliverables | This page |

Further reading: [`ARCHITECTURE.md`](ARCHITECTURE.md) (modules and algorithms), [`DECISIONS.md`](DECISIONS.md) (every choice the task left open), [`API_EXAMPLES.md`](API_EXAMPLES.md).
