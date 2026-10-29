# Design: light, production-grade redesign (addendum to `design.md`)

Date: 2026-10-29 · Status: approved ("do what's best")

The full specification is the user's [`design.md`](../../../design.md). This addendum records how it maps onto the existing LunaPulse code and the calls made where it conflicts with earlier decisions. Everything in `design.md` applies unless it is overridden here.

## Calls (all approved by the user)

1. **Name: LunaPulse.** `design.md` says "PulseLens"; the user renamed the project (D27). Every visible name stays LunaPulse.
2. **shadcn/ui is used,** despite `design.md` §2's "no unnecessary libraries", because the user asked for it. Only the primitives the spec needs are added, as owned source in `src/components/ui`:
   - Button, Card, Badge, Dialog, Sheet, Tabs, Tooltip, DropdownMenu, Select, Skeleton, Separator, Progress;
   - Sonner for toasts.

   This brings in Radix UI, `class-variance-authority`, `clsx` and `tailwind-merge`.
3. **The dark "sporty" theme (D32) is replaced** by the light palette from `design.md` §3. There are no glows, glass or decorative gradients. The goal rings become a thin goal-progress bar inside each metric card, still using the backend's `goal_progress_percent` (D31).

## Layout mapping (no non-functional navigation, `design.md` §4)

- **Sidebar (desktop ≥ lg):**
  - LunaPulse mark;
  - **Overview** (the dashboard view);
  - **Insights** and **Trends**, which scroll to those sections of the Overview;
  - **Edit data**, the existing data editor (D29) as its own view;
  - footer: "Informational tool · synthetic data · not medical advice".
- **Mobile and tablet (< lg):** a top bar with a menu button that opens the same navigation in a Sheet drawer.
- **Top bar:**
  - page title;
  - user Select (from `GET /users`);
  - date input (bounded by `data_start` and the user's `today`/`data_end`);
  - **Refresh**, which re-fetches every panel;
  - a data-status indicator (loaded / loading / unavailable, with text);
  - a **Demo data** dropdown holding the scenario switcher (`POST /simulation/generate`).
- **Overview order** (`design.md` §4C):
  1. heading "Your daily insights" with the user context and a compact synthetic-data notice;
  2. four metric cards (value, baseline, change, sparkline from the real 28-day observations, goal progress, unavailable states);
  3. trends with Tabs for the metric and a 7/28-day toggle, a baseline reference line and the baseline explanation tooltip;
  4. the insight feed (prominent, backend order, 0–3);
  5. evidence in a Sheet drawer opened from "Why am I seeing this?";
  6. a data-quality notice when relevant (calm, not red);
  7. notes.
- **Insight cards** load their own evidence records (`GET /insights/{id}/evidence`, at most three requests) to show the observed value, the comparison value and the change, since the feed response doesn't carry them. Feedback (Dismiss / Not relevant) sits in a DropdownMenu with a pending state and a toast once the backend confirms.
- **Correction:** each metric card has a "Correct value" action that opens a Dialog. It shows the metric, the date and the current value, takes a new value, and submits through `POST /users/{id}/corrections`, which recalculates. On success it shows a toast and refreshes every panel; backend validation errors appear in the dialog. The data editor stays for multi-cell edits.
- **States:** skeletons for the metric cards, chart and insight cards; empty and error states with Retry; partial failures keep the other sections visible.

## Unchanged

The backend and the API contracts are unchanged. Every number still comes from the backend; the frontend computes no statistics. The existing behaviours stay: the outdated state, recalculate, the editor's batch save, confirmation before discarding edits, and keyboard navigation in the editor. The existing tests are adapted to the new markup and the e2e flow is extended.
