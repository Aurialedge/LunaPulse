# MEMORY — progress & working notes

Living file. Update at the end of every phase: status, what changed, and gotchas the next agent should know.

## Phase plan (~5 h total)

| # | Phase | Scope | Exit criteria | Est. |
|---|---|---|---|---|
| 0 | Planning & scaffold | Docs (AGENTS/PRD/ARCHITECTURE/DECISIONS/MEMORY), git, tooling (MCPs/plugins) | Docs reviewed by user | 15 m |
| 1 | Backend foundation & data | config, db/models, metrics, simulation (A–D + 7 scenarios), validation, startup seed, data endpoints (`health`, `users`, `observations`, `simulation/*`) | Unit: reproducible seeds, profiles distinct, scenarios applied, validation flags. Integration: data endpoints valid/invalid | 45 m |
| 2 | Analytics engine | baselines, candidates (deviation/trend/combined/data-quality), ranking + redundancy, evidence + confidence | Unit: PRD §15 data/baseline & insight tests (target-day exclusion, zero MAD, zero baseline, insufficient history, stable → no anomalies, each scenario → expected candidate, determinism, top-3, dedupe, combined evidence) | 60 m |
| 3 | Explanations, pipeline & analytics API | explanations (Gemini + claim check + retry + fallback), pipeline (15 steps), idempotency/staleness, `baselines`/`insights` endpoints | Unit: mocked LLM — invalid JSON, bad numbers, failures → fallback. Integration: all analytics endpoints valid/invalid, no-key demo mode, no duplicates, stale on regenerate | 45 m |
| 4 | Frontend dashboard | Vite+TS+Tailwind+Recharts+lucide; header/disclaimer, controls, metric cards, trend chart (7/28d, metric switch), insights + evidence panels, provider badge, DQ status, all UX states, responsive + a11y | Vitest: cards/insights/evidence render backend values; loading/empty/error/insufficient states | 75 m |
| 5 | E2E, delivery & docs | Playwright e2e (real backend, fallback mode), Docker + compose, `.env.example`, README (setup, algorithms, config, limitations, scenarios, API examples), REPORT.md (technical report + acceptance results), real Gemini smoke check | All test suites green; DoD §15 checklist ticked | 60 m |

## Status

- [x] Phase 0 — planning & scaffold
- [ ] Phase 1 — backend foundation & data
- [ ] Phase 2 — analytics engine
- [ ] Phase 3 — explanations, pipeline & analytics API
- [ ] Phase 4 — frontend dashboard
- [ ] Phase 5 — e2e, delivery & docs

## Notes / gotchas

- `PRD.pdf` is image-only (no text layer); `PRD.md` is the transcription.
- Project-scoped tooling: `.mcp.json` (context7, playwright), `.claude/settings.json` (plugins superpowers, ui-ux-pro-max). Restart Claude Code to load them.
- Windows dev machine; Git Bash available. Python 3.13, Node 22.
