# Dark UI and data editor: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle LunaPulse in a dark, sporty look (goal rings, glowing animated charts) and add an "Edit data" table that batch-saves corrections and marks insights outdated until the user recalculates.

**Architecture:** Three small backend additions:
- goal progress fields on `GET /baselines`;
- a distinct `404 insights_outdated` from the feed;
- `POST /corrections/batch`, which stores edits and marks runs stale without regenerating.

Then a frontend restyle on Tailwind `@theme` tokens, a tabbed shell, and a new `DataEditor` component. Every number still comes from the backend.

**Tech Stack:** FastAPI, SQLAlchemy, pytest · React 18, TypeScript, Tailwind 4, Recharts 2.15, lucide-react, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-dark-ui-and-data-editor-design.md`

## Global Constraints

- The frontend never computes statistics. Ring progress comes from `goal_progress_percent` (backend).
- The batch is all-or-nothing, 1–112 items, with no duplicate (date, metric) pairs. Any invalid item gives `422 invalid_value` naming the date and metric, and nothing is stored.
- The batch does **not** regenerate. Stale range: `[min(dates) − 1, max(dates) + STALE_AFTER_DAYS]`.
- Feed: `404 insights_outdated` when the date has a stale run and no current one; otherwise `404 insights_not_generated`.
- Dark-only theme. Text reaches WCAG AA on the navy surface. Every animation is disabled under `prefers-reduced-motion: reduce`.
- Metric accents: steps cyan, sleep violet, RHR rose, HRV indigo. Status colours always come with an icon and a label.
- Unsaved edits: confirm before switching user or date, or regenerating a scenario. Edits survive switching tabs.
- Commits never contain Claude attribution lines.
- AGENTS.md rules: thresholds in `config.py`, one API client, types in `types.ts`, readability over modularity.

## Review Focus

1. **A user edits a cell, then edits it back to its original value.** That cell is no longer "changed" and isn't sent. *(Task 7 test `reverting a cell to its original value clears the change`.)*
2. **Non-numeric or empty input in a cell.** It isn't sent, and the cell shows an inline error; Save is disabled while any cell is invalid. *(Task 7 test `invalid cell input blocks save`.)*
3. **Saving while a recalculation is running, or double-clicking Save.** Only one request is sent. *(Task 7 test `save button is disabled while saving`.)*
4. **A batch with a correction for a missing day** (filling a gap). It's accepted, and the observation shows the value with `corrected:` instead of `missing:`. *(Task 3 test `test_batch_can_fill_a_missing_day`.)*
5. **A feed date whose run was made outdated, then recalculated.** It returns the new run, not `insights_outdated`. *(Task 2 test `test_recalculating_an_outdated_day_returns_the_new_run`.)*

---

### Task 1: Goal progress on baselines (backend)

**Files:**
- Modify: `backend/app/schemas.py` (`MetricBaselineOut`), `backend/app/api/insights.py` (`get_baselines`)
- Test: `backend/tests/integration/test_api_insights.py`

**Interfaces:**
- Produces: `MetricBaselineOut.goal_value: float | None`, `MetricBaselineOut.goal_progress_percent: float | None`

- [ ] **Step 1: Write the failing tests**
  - `test_baselines_include_goal_progress_for_steps_and_sleep`: generate `user_b reduced_sleep`. Steps: `goal_value == 9000` and `goal_progress_percent == min(100, round(100*observed/9000, 1))`. Sleep: `goal_value == 8.0`. RHR and HRV: both fields `None`.
  - `test_goal_progress_is_capped_and_null_without_a_value`: generate `user_a gradual_trend`. Steps progress `== 100.0` (observed above the 10,000 goal). With `missing_data`, sleep `goal_progress_percent is None` (no value).
- [ ] **Step 2: Run `pytest tests/integration/test_api_insights.py -k goal -q`** → FAIL (fields missing)
- [ ] **Step 3: Implement.** Add a pure helper `goal_progress(metric: str, value: float | None, user: User) -> tuple[float | None, float | None]` in `app/api/insights.py`, add `GOAL_PROGRESS_CAP = 100.0` to `config.py`, and fill the two fields in `get_baselines`.
- [ ] **Step 4: Run `pytest -q`** → all pass
- [ ] **Step 5: Commit** `feat: goal progress on baselines`

### Task 2: Feed distinguishes "outdated" from "never generated" (backend)

**Files:**
- Modify: `backend/app/pipeline.py`, `backend/app/api/insights.py` (`get_feed`)
- Test: `backend/tests/integration/test_api_insights.py` (update two existing tests, add two)

**Interfaces:**
- Produces: `pipeline.has_stale_run(session, user_id: str, target_date: date) -> bool`; feed 404 code `"insights_outdated"`

- [ ] **Step 1: Update the existing tests.** In `test_regenerating_data_makes_insights_stale` and `test_correction_marks_later_affected_runs_stale`, the stale-date assertions now expect `insights_outdated`. Add two tests:
  - `test_never_generated_day_is_not_outdated`: `feed` on a fresh day → `insights_not_generated`.
  - `test_recalculating_an_outdated_day_returns_the_new_run`: generate, regenerate data (→ `insights_outdated`), generate again (`force` false) → 200 with a new `run_id`.
- [ ] **Step 2: Run them** → the updated and new tests FAIL
- [ ] **Step 3: Implement `has_stale_run`** (a stale run exists for user, date, `RULE_VERSION`). In `get_feed`, raise `ApiError(404, "insights_outdated", "The data for {date} changed since its insights were made. Recalculate them.")` when there's no current run and `has_stale_run` is true.
- [ ] **Step 4: Run `pytest -q`** → all pass
- [ ] **Step 5: Commit** `feat: feed reports outdated insights`

### Task 3: Batch corrections endpoint (backend)

**Files:**
- Modify: `backend/app/schemas.py`, `backend/app/api/insights.py`, `backend/app/config.py`, `DECISIONS.md` (D29 data editor; D30 `insights_outdated`, amending D11/D18; D31 goal progress in backend; D32 dark-only theme)
- Test: `backend/tests/integration/test_api_insights.py`

**Interfaces:**
- Consumes: `is_valid_reading`, `mark_runs_stale`, `STALE_AFTER_DAYS`, `resolve_date`
- Produces: `POST /api/v1/users/{user_id}/corrections/batch`
  - body `BatchCorrectionIn{corrections: list[CorrectionIn]}` (1–`MAX_BATCH_CORRECTIONS`=112)
  - response `BatchCorrectionOut{user_id: str, saved: int, stale_run_count: int, dates: list[date]}` (sorted, unique)

- [ ] **Step 1: Write the failing tests**
  - `test_batch_saves_all_edits_marks_stale_and_does_not_regenerate`: generate insights for END; batch-correct sleep for END and steps for END−2. Response `saved == 2`, `stale_run_count == 1`. Then `feed(END)` → `insights_outdated`, and observations show both values with `corrected:` flags.
  - `test_batch_is_all_or_nothing`: one valid item plus sleep `30` → `422 invalid_value` whose message contains the date and `sleep_hours`. The observation for the valid item is unchanged.
  - `test_batch_can_fill_a_missing_day`: `user_a missing_data`, correct sleep on END → the value appears with `corrected:sleep_hours` and no `missing:sleep_hours`.
  - `test_batch_invalid_inputs`: empty list → 422 `validation_error`; 113 items → 422; duplicate (date, metric) → 422 `invalid_value`; unknown user → 404; date out of range → 422 `invalid_value`.
- [ ] **Step 2: Run `pytest -k batch -q`** → FAIL
- [ ] **Step 3: Implement `add_corrections_batch(user_id, body, session) -> BatchCorrectionOut`.** Validate every item first, then add all the `Reading(source="user_correction")` rows, run one `mark_runs_stale` over the combined range, and `commit` once. Write the four DECISIONS entries.
- [ ] **Step 4: Run `pytest -q`** → all pass
- [ ] **Step 5: Commit** `feat: batch corrections without regeneration`

### Task 4: Dark theme tokens, app shell and tabs (frontend)

**Files:**
- Modify: `frontend/src/index.css`, `frontend/src/App.tsx`, `frontend/src/components/Header.tsx`, `Controls.tsx`, `StateViews.tsx`, `DataQualityStatus.tsx`, `NotesPanel.tsx`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Produces:
  - `@theme` tokens `--color-surface`, `--color-surface-raised`, `--color-glass`, `--color-line`, `--color-ink`, `--color-ink-soft`, `--color-ink-muted`, and `--color-steps` (cyan) / `--color-sleep` (violet) / `--color-rhr` (rose) / `--color-hrv` (indigo);
  - the component classes `.card`, `.btn-primary`, `.btn-secondary`, `.input`, `.chip` restyled dark;
  - `App` state `tab: "dashboard" | "edit"` and the tab buttons `role="tab"` named "Dashboard" / "Edit data";
  - `METRIC_INFO[metric].accent` (a CSS var name) in `format.ts`;
  - the CSS `@media (prefers-reduced-motion: reduce)` block turning animations off.
- [ ] **Step 1: Write the failing test** `tabs switch between dashboard and data editor`: the "Dashboard" tab is selected (`aria-selected=true`) and the metric region is visible; click "Edit data" → the metric region is gone and a heading "Edit data" is visible (placeholder until Task 7).
- [ ] **Step 2: Run `npm test`** → FAIL
- [ ] **Step 3: Implement** the navy background with a violet radial glow on `body`, the glass cards, and the header with a glowing logo mark. Controls and tabs go in one glass bar. Restyle the listed components using the tokens only.
- [ ] **Step 4: Run `npm test`, `npx tsc -b` and `npm run lint`** → pass. Screenshot at 1280 px and 390 px and look at them: no horizontal scroll, readable text.
- [ ] **Step 5: Commit** `feat: dark theme shell with tabs`

### Task 5: Metric tiles with goal rings (frontend)

**Files:**
- Modify: `frontend/src/api/types.ts` (`MetricBaseline.goal_value`, `goal_progress_percent`), `frontend/src/components/MetricCard.tsx`, `frontend/src/test/fixtures.ts`
- Test: `frontend/src/components/components.test.tsx`

**Interfaces:**
- Consumes: Task 1 fields; Task 4 tokens
- Produces:
  - `GoalRing({ percent: number, accent: string, label: string })` inside `MetricCard.tsx` (an SVG circle with `stroke-dashoffset` from `percent`, and an `aria-label` like "62% of goal");
  - the `MetricCard` prop `highlighted: boolean`;
  - the `InsightFeed` prop `onInsightMetrics?: (metrics: Metric[]) => void`, called with the union of the visible insights' `metrics` whenever the feed loads (`[]` when there's no current feed).

- [ ] **Step 1: Write the failing tests**
  - `shows a goal ring from the backend progress`: a steps fixture with `goal_progress_percent: 95.3` → the element with `aria-label` "95.3% of goal" exists and the text "goal 9,000 steps" is shown.
  - `metrics without a goal show no ring`: RHR → no `aria-label` matching `/of goal/`.
  - Keep all existing MetricCard tests passing (testids unchanged).
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** the tile:
  - the metric accent;
  - a ring for goal metrics, filling on mount;
  - a glowing lucide icon (`HeartPulse`, `Activity`) for RHR/HRV;
  - a glowing accent border when the new prop `highlighted: boolean` is true.

  `Dashboard` decides `highlighted` by set membership: the metric appears in a current feed insight's `metrics`. There are no thresholds or arithmetic in the frontend. Add the test `highlights tiles named by a current insight`.
- [ ] **Step 4: Run `npm test`** → pass
- [ ] **Step 5: Commit** `feat: metric tiles with goal rings`

### Task 6: Glowing animated trend chart (frontend)

**Files:**
- Modify: `frontend/src/components/TrendChart.tsx`, `frontend/src/index.css`
- Test: `frontend/src/components/components.test.tsx` (existing TrendChart tests must pass)

**Interfaces:**
- Consumes: Task 4 tokens (`METRIC_INFO[m].accent`)

- [ ] **Step 1: Write the failing test** `chart line uses the metric accent and the draw-in class`: render with HRV selected → the SVG `path.recharts-curve` has class `lp-draw` and stroke `var(--color-hrv)`.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement:**
  - an `<Area>` with a vertical gradient fill (accent at 0.35 → 0) plus the `<Line>` with `className="lp-draw"` and `filter="url(#lp-glow)"`;
  - `defs` with `feGaussianBlur stdDeviation=3` merged with the source graphic;
  - the CSS keyframes `lp-draw` (stroke-dasharray/dashoffset 1000 → 0, 1.2 s ease-out), restarted on metric or range change via `key`;
  - a dim dashed baseline; a dark tooltip; the range and metric toggles restyled as pills.
- [ ] **Step 4: Run `npm test`** → pass. Look at it in the browser (animation plays; reduced motion disables it via DevTools emulation).
- [ ] **Step 5: Commit** `feat: glowing animated trend chart`

### Task 7: Data editor tab (frontend)

**Files:**
- Create: `frontend/src/components/DataEditor.tsx`
- Modify: `frontend/src/api/client.ts` (`api.correctBatch`), `frontend/src/api/types.ts`, `frontend/src/App.tsx` (edits state lifted into `Dashboard`, confirm on switch/regenerate)
- Test: `frontend/src/components/DataEditor.test.tsx`, `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: Task 3 endpoint; `api.observations(userId, end)`
- Produces:
  - `api.correctBatch(userId: string, corrections: {date: string; metric: Metric; value: number}[]): Promise<BatchCorrectionResponse>`;
  - `type Edits = Record<string, string>`, keyed `` `${date}|${metric}` ``, holding the raw input text;
  - `DataEditor({ observations: Observation[]; dataStart: string; edits: Edits; onEditsChange: (e: Edits) => void; onSaved: () => void; userId: string })`.
    It shows only rows with `date >= dataStart`, which is a string comparison, not statistics.

- [ ] **Step 1: Write the failing tests** (`DataEditor.test.tsx`):
  - `renders one row per observation with flagged cells marked`: a 28-row fixture; the missing steps cell has `data-flag="missing"` and the text "—".
  - `editing a cell marks it changed and shows the unsaved bar`: click the cell, type `7.2`, Enter → the cell has `data-changed="true"` and "1 unsaved change" is visible.
  - `reverting a cell to its original value clears the change`.
  - `invalid cell input blocks save`: type `abc` → inline error, and the "Save changes" button is disabled.
  - `save sends every change in one request and reports success`: the spy `api.correctBatch` is called once with both edits (numbers); `onSaved` is called; the bar disappears.
  - `save button is disabled while saving`: two clicks → one call.
  - `backend errors are shown in the bar`: reject with `ApiError(422, "invalid_value", "Sleep must be …")` → the alert shows the message and the edits are kept.
  - `discard clears all edits`.
  - `days before the data start are not shown`: a fixture whose first 5 dates are before `dataStart` → 23 rows.
  - In `App.test.tsx`: `switching user with unsaved edits asks for confirmation` (`vi.spyOn(window, "confirm").mockReturnValue(false)` keeps the user and the edits).
- [ ] **Step 2: Run `npm test`** → FAIL
- [ ] **Step 3: Implement.**
  - The table has a sticky header and rows newest-first. A cell is a button that turns into an `<input inputMode="decimal">`. Enter or Tab commits and moves right, Escape cancels.
  - Changed cells glow violet, flagged cells are amber, corrected cells teal.
  - The sticky bar reads "N unsaved change(s)" with Discard / Save changes.
  - After saving, `Dashboard` bumps `version` (all panels re-fetch).
  - Confirm on user or date change and on scenario regeneration when `Object.keys(edits).length > 0`.
- [ ] **Step 4: Run `npm test`, `tsc` and `lint`** → pass
- [ ] **Step 5: Commit** `feat: data editor with batch save`

### Task 8: Insight feed restyle and outdated state (frontend)

**Files:**
- Modify: `frontend/src/components/InsightFeed.tsx`, `InsightCard.tsx`, `EvidencePanel.tsx`
- Test: `frontend/src/components/components.test.tsx`

**Interfaces:**
- Consumes: Task 2 code `insights_outdated`

- [ ] **Step 1: Write the failing test** `outdated insights offer recalculation`: `api.feed` rejects with `ApiError(404, "insights_outdated", …)` → the text "Data changed since these insights were made" and the button "Recalculate insights" are shown; clicking it calls `api.generateInsights(userId, date, false)`.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** the violet-tinted glass insight cards with the "Insight N of M" eyebrow, confidence chips with an icon and a label, and the dark evidence panel (keep the table semantics and testids), plus the outdated state.
- [ ] **Step 4: Run `npm test`** → pass
- [ ] **Step 5: Commit** `feat: dark insight feed with outdated state`

### Task 9: End-to-end tests, docs and final verification

**Files:**
- Modify: `frontend/e2e/dashboard.spec.ts`, `README.md` (UI and editor sections, demo script step), `ARCHITECTURE.md` (the new endpoint, `insights_outdated`, frontend files), `API_EXAMPLES.md` (batch example), `REPORT.md` (test counts, editor), `MEMORY.md`

- [ ] **Step 1: Update the existing e2e tests** for the new layout: the "regenerating" flows expect the outdated state where relevant; selectors stay role- and testid-based.
- [ ] **Step 2: Add the e2e test** `editing the table marks insights outdated and recalculation updates them`: `user_b reduced_sleep` → generate → "Edit data" tab → set today's sleep to the baseline median and today−1's steps → Save → "Dashboard" tab shows "Data changed since these insights were made" → Recalculate → no sleep-deviation card, and the sleep tile shows the API value.
- [ ] **Step 3: Run everything:** `pytest -q`, `npm test`, `npx tsc -b`, `npm run lint`, `npm run build`, `npm run test:e2e` → all pass, e2e twice in a row.
- [ ] **Step 4: Live check:** run the app with the real key, screenshot the dashboard, the editor and a Gemini-explained feed at 1280 px and 390 px, and look at each.
- [ ] **Step 5: Commit** `feat: e2e and docs for dark UI and data editor`
