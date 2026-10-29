# AGENTS.md — PulseLens

Instructions for any coding agent (Claude Code, Codex, etc.) working in this repo.

## What this is

**PulseLens** — "Your wearable data, explained with evidence." A research/demo prototype that simulates wearable data (steps, sleep, RHR, HRV), computes personal baselines, detects deviations with deterministic rules, ranks candidate insights, stores structured evidence, and asks Gemini to *explain* (never compute) the top ≤3 insights. A template fallback is used when Gemini is unavailable. **All data is synthetic. Nothing here is medical advice.**

## Read before working

| File | Purpose |
|---|---|
| `PRD.md` | The requirements. **Source of truth. Nothing outside it gets built.** |
| `ARCHITECTURE.md` | Layout, data flow, algorithms (baseline, rules, ranking, LLM validation). |
| `DECISIONS.md` | Choices the PRD left open, and why. Add one entry for each new choice. |
| `MEMORY.md` | Phase plan, current progress, gotchas. Update it at the end of every phase. |

## Golden rules

1. **Strict PRD scope.** If it isn't in `PRD.md`, don't build it. If the PRD is ambiguous, ask the user, then record the answer in `DECISIONS.md`.
2. **Readability over modularity.** A slightly longer file that reads top to bottom beats five tiny files. No abstract base classes, factories, or plugin systems unless there are two real implementations.
3. **Don't over-engineer.** No LangChain, vector DBs, queues, Redux, or react-query. Plain functions, plain fetch.
4. **Statistics live only in the backend.** The frontend displays backend values and never computes baselines, deviations, or scores.
5. **The LLM never produces numbers.** Every number shown to the user comes from deterministic Python code and is traceable to an evidence record.
6. **Safety language.** No diagnoses, no treatment advice, no causal claims ("co-occurred with", not "caused"). No fabricated sources.
7. **Secrets.** `GEMINI_API_KEY` lives only in `backend/.env` (gitignored). It never appears in frontend code, logs, or API responses.

## Repo layout

```
backend/            FastAPI + SQLAlchemy + pandas (Python 3.12+)
  app/              application code (see ARCHITECTURE.md for each module)
  tests/unit/       pure-function tests (no DB, no network)
  tests/integration/ API + pipeline tests (temp SQLite, mocked Gemini)
frontend/           React + TypeScript + Vite + Tailwind + Recharts + lucide-react
  src/              app code
  src/**/*.test.tsx Vitest + React Testing Library
  e2e/              Playwright tests against the real backend (fallback mode)
```

## Commands

```bash
# Backend (from backend/)
python -m venv .venv && source .venv/Scripts/activate   # Windows Git Bash; use .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
pytest                                  # all backend tests
pytest tests/unit -q                    # fast unit tests only

# Frontend (from frontend/)
npm install
npm run dev                             # http://localhost:5173
npm test                                # vitest
npm run test:e2e                        # playwright (starts backend + frontend)
npm run build && npm run lint
```

## Code conventions

**Python**
- Type hints on all public functions. Pydantic models for API I/O; SQLAlchemy 2.0 typed ORM (`Mapped[...]`).
- Pure functions for analytics (simulation, validation, baselines, candidates, ranking): they take data in and return data out, with no DB access. The pipeline and API layers do the I/O.
- Write a docstring only when the *why* isn't obvious. Name things after domain terms used in the PRD (`baseline_median`, `robust_z`, `rule_id`).
- All thresholds and weights live in `app/config.py`. No magic numbers in logic.
- Parameterized DB access only (the SQLAlchemy ORM); never use string-built SQL.

**TypeScript / React**
- Function components plus hooks. Types for API responses live in one file (`src/api/types.ts`) and mirror the backend schemas.
- One API client module (`src/api/client.ts`). Components don't call `fetch` directly.
- Tailwind utility classes; no CSS-in-JS. Accessible: labels, `aria-*`, keyboard-reachable controls, visible focus.
- Every data view handles **loading / empty / error / insufficient-history** states.

## Testing rules

- Every phase ends with tests green. A phase isn't done until its tests and PRD acceptance criteria pass (PRD §17.5).
- Backend: unit tests for every analytics module covering edge cases (zero MAD, zero baseline, all-missing, exactly-at-threshold, insufficient history, target-day exclusion, determinism). Integration tests for every endpoint, with valid and invalid inputs.
- Gemini is **always mocked** in automated tests. Tests never need a real API key.
- Frontend: Vitest for components and states. Playwright e2e runs against the real backend in fallback mode, and checks that UI values equal API values.

## Phase workflow

Work happens in phases (see `MEMORY.md`). At the end of each phase:
1. Run all tests and make sure they pass.
2. Update `MEMORY.md` (status, gotchas) and `DECISIONS.md` (any new choices).
3. Report: changed files, tests run, results, and what's left (PRD §17.10).
4. Commit: `git commit -m "Phase N: <summary>"`.
