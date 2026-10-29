# MEMORY — progress & working notes

Living file. Update at the end of every phase: status, what changed, and gotchas the next agent should know.

Requirements: `PRD.md` Part A (PRD) + Part B (Intern Hiring Task 3). Conflicts resolved in `DECISIONS.md` D13+.

## Phase plan (~5.5 h total, no Docker)

| # | Phase | Scope | Exit criteria | Est. |
|---|---|---|---|---|
| 0 | Planning & scaffold | Docs, git, tooling, Task 3 integration | User reviewed docs | done |
| 1 | Backend foundation & data | config, db/models (readings, notes, users w/ goals+tz), metrics, observations (D5), simulation (A–D, 7 scenarios, messy User D: gaps/spike/conflict/injection note), startup seed, endpoints: health, users, observations, simulation/*, notes | Unit: seeds reproducible, profiles distinct, scenarios applied, readings→observation flags (missing/unit/range/conflict/correction), timezone "today". Integration: those endpoints valid/invalid | 50 m |
| 2 | Analytics engine | baselines (+DoD/WoW), candidates (deviation, trend, improving_trend, combined, data_quality, spike), ranking + redundancy, evidence + confidence, tools.py | Unit: PRD §15 data/baseline/insight tests + Task 3 calc tests (target-day exclusion, zero MAD, zero baseline, insufficient history, trend minimum, stable → nothing, each scenario → expected candidate, determinism, top-3, dedupe, combined evidence, improving vs goal, spike qualified) | 60 m |
| 3 | LLM, pipeline & analytics API | explanations (Gemini tool loop, claim check, retry, fallback), pipeline, idempotency/staleness, endpoints: baselines, insights generate/feed/get/evidence, feedback, corrections | Unit (mocked LLM): invalid JSON, bad numbers, injection note, tool scoping, drop, failures → fallback. Integration: all endpoints valid/invalid, no-key mode, no duplicates, correction → stale + recompute, feedback hides | 70 m |
| 4 | Frontend dashboard | Vite+TS+Tailwind+Recharts+lucide; header/disclaimer, controls, metric cards (+correct value), trend chart, insight feed + "Why am I seeing this?", feedback buttons, notes, provider badge, DQ status, all UX states, responsive, a11y | Vitest: renders backend values; loading/empty/error/insufficient; feedback/correction interactions | 80 m |
| 5 | E2E & docs | Playwright e2e (real backend, fallback mode), `.env.example`, README (setup, algorithms, config, limitations, scenarios, API examples, demo-video script), REPORT.md (tech report + code walkthrough + acceptance results), real Gemini smoke check | All suites green; PRD §15 DoD + Task 3 checklist ticked | 45 m |

## Status

- [x] Phase 0 — planning & scaffold (incl. Task 3 integration)
- [x] Phase 1 — backend foundation & data (52 tests: 34 unit, 18 integration)
- [ ] Phase 2 — analytics engine
- [ ] Phase 3 — LLM, pipeline & analytics API
- [ ] Phase 4 — frontend dashboard
- [ ] Phase 5 — e2e & docs

## Notes / gotchas

- `PRD.pdf` is image-only (no text layer); `PRD.md` is the transcription (Part A) + Task 3 docx (Part B).
- Project-scoped tooling: `.mcp.json` (context7, playwright), `.claude/settings.json` (plugins superpowers, ui-ux-pro-max). Restart Claude Code to load them.
- Windows dev machine; Git Bash available. Python 3.13, Node 22.
- Gemini key goes in `backend/.env` (gitignored). Tests must never need it.
- Phase 1: `create_app(settings, seed_users)` in `app/main.py`; integration tests build the app with `Settings(_env_file=None, database_url=tmp)` so they never read `backend/.env`. Session factory lives on `app.state.session_factory`; `get_db` reads it.
- Env-dependent settings are in `Settings`; every other threshold/limit is a module constant in `app/config.py`. Phase 2 adds analytics thresholds there.
- `observations.build_observations` takes ORM `Reading`s or `ReadingData` (duck-typed `ReadingLike`). Analytics should consume `DailyObservation`s, never raw readings.
- Windows needs the `tzdata` package for `zoneinfo` (in requirements.txt).
- Corrections endpoint (D18) and run staleness are Phase 3; `regenerate_user` in `app/api/data.py` is where Phase 3 must also mark the user's runs stale (D1).
- Local DB file `backend/pulselens.db` is gitignored; delete it to reseed.

