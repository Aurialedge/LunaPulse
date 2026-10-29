# Design: dark "sporty" UI and a data editor

Date: 2026-10-29 · Status: draft for approval

## Intent and why

The user finds the current dashboard "too basic": a plain light admin-style page. LunaPulse will be judged partly through a demo video and by reviewers opening the app, so it should look like a modern wearable product and make its evidence-first behaviour feel alive. They also want to **edit any day's values in a table and recalculate insights**, so a demo can show the data changing and the analysis following it. Today they can only correct one value at a time through a pencil icon on a metric card.

## Goals

1. **Visual redesign in the "dark, sporty" direction** the user picked from mockups (option B, like Whoop/Oura):
   - deep navy background with a soft violet radial glow;
   - glassy translucent cards with thin light borders;
   - bright accents: cyan, rose, violet, pink, indigo.
2. **Goal rings** for steps (the user's activity goal) and sleep (their sleep target). RHR and HRV have no goal, so their tiles show a glowing icon and the change against the baseline instead.
3. **Animated, glowing charts** (the user asked for "glowing lines in graph"):
   - the trend line draws itself in on load and whenever the metric or range changes;
   - a soft glow under the line (SVG blur filter) and a gradient area fill;
   - the baseline as a dim dashed line.
4. **A data editor:** a table of the 28 days ending at the selected date (rows = days, columns = the four metrics).
   - Any cell can be changed, and edited cells glow until saved.
   - **Save** stores every edit at once. Each one is stored as a user correction and validated with the existing unit and range rules.
   - Saving does **not** recalculate. It marks affected insights outdated, and the feed then shows a "data changed — recalculate" state with a **Recalculate insights** button.
5. Keep everything that already works: every number comes from the backend; "Why am I seeing this?", confidence labels, provider badge, feedback, notes, scenario switching, the trend table view, and all the loading / empty / error / insufficient-history states.

## Non-goals

- Uploading or importing your own data, or connecting real wearables (PRD §3 out of scope; no real health data).
- Turning a value back into "missing", deleting readings, or undoing a correction. A cell can be changed, never cleared.
- A light theme or theme toggle. The app becomes dark-only.
- New analytics rules or changes to ranking.

## Anti-goals (a failure even if it technically works)

- Showing an outdated insight after its data changed (Part B §5).
- The frontend computing statistics. Goal-ring progress is computed by the **backend** (see below), so golden rule 4 holds.
- Animations that make the app feel slow, or that ignore `prefers-reduced-motion`.
- Text on the dark background below WCAG AA contrast.
- Losing unsaved edits silently.

## Constraints

- Requirements: `PRD.md` Parts A and B, plus the project rules in `AGENTS.md`: readability over modularity, no new state libraries, one API client, types mirroring the backend, Tailwind only.
- Existing stack: React 18, TypeScript, Vite, Tailwind 4, Recharts 2.15, lucide-react; FastAPI and SQLAlchemy on the backend.
- Gemini can take 15–35 s. Recalculating stays an explicit user action with a clear progress state.
- All tests stay green and get extended: backend pytest, Vitest, Playwright e2e.

## Approaches considered (data editing)

| | Approach | Trade-off |
|---|---|---|
| 1 | Batch save, then recalculate the selected day immediately | One Gemini call per save; always fresh; needs a new endpoint |
| 2 | Save each cell through the existing correction endpoint | No backend change, but every cell triggers a recalculation (up to 30 s each) |
| **3 ✔** | **Edit freely; Save stores and marks outdated; recalculate on demand** | Most flexible. The user chose it. Outdated insights are hidden, never shown. |

**Picked: 3 (user's choice).**

## Decided design

### Backend

1. **`POST /api/v1/users/{user_id}/corrections/batch`**
   - Body: `{"corrections": [{"date", "metric", "value"}, …]}`, between 1 and 112 items (28 days × 4 metrics).
   - Each item is validated with the same rules as the single correction: date inside the user's data range, metric known, value in range, steps rounded to an integer. **All or nothing:** if any item is invalid, nothing is stored and the response is `422 invalid_value` naming the first bad item (date and metric).
   - Stores each value as a `user_correction` reading (the latest correction wins, D5).
   - Marks stale every non-stale run with `target_date` in `[min(dates) − 1, max(dates) + 34]` (D11/D18 rule).
   - **Does not regenerate.** It returns `{user_id, saved: n, stale_run_count, dates: [...]}`.
2. **The existing single-value `POST /corrections`** stays as it is (it recalculates). The pencil on a metric card keeps using it.
3. **Goal progress in `GET /baselines`.** Each metric gets `goal_value` (steps → `activity_goal_steps`, sleep → `sleep_target_hours`, RHR/HRV → `null`) and `goal_progress_percent` = `round(100 · observed / goal, 1)`, capped at 100, or `null` when there's no goal or no value. It's computed in Python; the frontend only draws it.
4. **"Outdated" is distinguishable from "never generated"** (user's choice, option b).
   - `GET /users/{id}/insights?date=` returns `404 insights_outdated` when the date has a stale run and no current one, whatever made it stale: batch edit, pencil correction, or scenario regeneration. It keeps returning `404 insights_not_generated` when the date never had a run.
   - The message says the data changed since the insights were made.
   - Existing tests that expect `insights_not_generated` after a regeneration or correction are updated to `insights_outdated`.
   - **Recalculate** calls the normal generate endpoint. There's no current run, so it simply creates a new one.
5. New decision entries in `DECISIONS.md`: data editor (option 3, all-or-nothing batch); `insights_outdated` (amends D11/D18); goal progress computed in the backend; dark-only theme.

### Frontend

1. **Layout:** dark app shell.
   - The header has the LunaPulse mark (a glowing moon/pulse logo), the synthetic-data banner, and the LLM-mode chip.
   - Two tabs under the header: **Dashboard** and **Edit data**. The controls (user, date, scenario) sit in a glass bar shared by both tabs.
2. **Dashboard tab:**
   - Day summary.
   - Four metric tiles: rings for steps and sleep, glowing icons for RHR and HRV. Each shows the value, baseline, difference and flags; a tile with a target-day deviation gets a coloured border; the pencil correction stays.
   - The glowing animated trend chart.
   - The insight feed (violet-tinted cards, "Insight 1 of 3 · high confidence").
   - The notes panel.
3. **Edit data tab:**
   - A table of 28 rows; flagged or missing cells are tinted amber with a tooltip naming the flag.
   - Clicking a cell gives an inline numeric input. Enter or Tab moves to the next cell, and Escape cancels the cell edit.
   - Edited cells glow violet. A sticky bar says "N unsaved changes" and offers **Discard** and **Save changes**.
   - Errors from the backend show in that bar.
   - Switching user or date with unsaved edits asks for confirmation (`window.confirm`).
   - After a successful save, the panels re-fetch, and the feed (on this and every other affected date) gets `insights_outdated`. It shows "Data changed since these insights were made — recalculate" with a **Recalculate insights** button.
4. **Animation:**
   - SVG `stroke-dashoffset` draw-in (≈ 1.2 s ease-out) on the chart line;
   - a glow from an SVG `feGaussianBlur` filter;
   - rings fill on mount, and cards fade/slide in subtly.
   - Everything is disabled under `@media (prefers-reduced-motion: reduce)`.
5. **Colour tokens** defined once in `index.css` (`@theme`): navy surfaces, glass card, borders, text primary/secondary/muted, and accents per metric (steps cyan, sleep violet, RHR rose, HRV indigo).
   - Status colours (good / warning / alert) always come with an icon and a label.
   - Contrast is checked to reach AA on the navy surface.

### Tests

- **Backend:** batch endpoint, valid and invalid (empty list, too many items, duplicate cells, a bad value means nothing is stored, unknown user, date out of range); it marks the right runs stale and does not regenerate; `insights_outdated` vs `insights_not_generated`; goal-progress fields (cap at 100, null cases).
- **Vitest:** the editor (edit a cell, glow, discard, save calls the API with the edits, a backend error is shown, confirm on switch); rings render the backend `goal_progress_percent`; existing tests updated for the new markup.
- **Playwright:** edit two cells in the table → save → the feed shows "recalculate" → recalculate → the values match the API and the changed insight is gone. Existing e2e tests are updated for the new layout.

## Calls made without asking (check these)

- **Regenerating a scenario while there are unsaved edits asks for confirmation**, the same as switching user or date, because regeneration wipes corrections.
- **Unsaved edits survive moving between the Dashboard and Edit data tabs.** They're only discarded on Discard, a confirmed user or date switch, or a regeneration.
- **A batch that names the same (date, metric) twice** is rejected with `422`.
- **An out-of-range date inside a batch** returns `422 invalid_value`, like any other invalid item.
- **Near the start of the data, the table shows fewer than 28 rows.**
- **Corrected cells get their own subtle tint**, separate from the amber used for flagged or missing values.

## Left to the builder

- Exact spacing and component composition, and the icon choices (lucide).
- How to implement the chart glow and draw-in within Recharts (custom `defs` and `filter`, or a CSS animation on the line path).
- Whether to split the editor into one or two components, following the "readability over modularity" rule.
- Wording of the empty and outdated states, within the meaning above.
