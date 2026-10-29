# Light production redesign: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the LunaPulse frontend into a light, production-grade analytics dashboard: a sidebar and top-bar layout, metric cards with sparklines, a trends section, a prominent insight feed, an evidence drawer and a correction dialog, built on shadcn/ui primitives, responsive and accessible.

**Architecture:** Restyle and restructure the existing components. Add shadcn primitives as owned source in `src/components/ui`. Keep the API client, types, `useAsync`, `format.ts` and every backend contract. Panels still load their own data and refresh through the page's `version` number.

**Tech Stack:** React 18, TypeScript, Vite 6, Tailwind 4, shadcn/ui (Radix), Recharts 2.15, lucide-react, sonner, Vitest + RTL, Playwright.

**Spec:** `design.md` and its addendum `docs/superpowers/specs/2026-10-29-light-redesign-design.md`

## Global Constraints

- **Palette (exact):** page `#F7F8FA`, surface `#FFFFFF`, text `#172033`, secondary text `#687386`, accent `#635BFF`, border `#E6E9EF`, positive `#16845B`, warning `#B7791F`, negative `#C24141`, neutral `#64748B`.
- No glows, glassmorphism or decorative gradients. Use thin borders, subtle shadows and one radius scale.
- **Type scale:** page title 28–32px, section 18–22px, card title 14–16px, metric value 28–36px, body 14–16px, meta 12–13px. Font: Inter / system sans.
- Status colour always comes with an icon or text.
- The frontend computes no statistics. Every number comes from an API response; sparklines plot the observations response.
- The backend is unchanged.
- No non-functional navigation.
- Responsive with no horizontal page overflow at 390, 768 and 1440 px.
- Visible focus everywhere; dialogs and drawers trap focus and close on Escape; `prefers-reduced-motion` disables motion.
- Native `<select>` stays for the user and scenario choices (robust, mobile-friendly, testable). Radix is used for Dialog, Sheet, DropdownMenu, Tabs and Tooltip.
- Commit messages carry no Claude attribution.

## Review Focus

1. **Changing user or date while an insight's evidence drawer is open:** the drawer closes and no evidence from the previous user remains. *(Task 6 test `evidence drawer closes when the user changes`.)*
2. **A correction rejected by the backend** (out-of-range value): the dialog stays open with the backend message, nothing refreshes, and there's no success toast. *(Task 7 test `correction errors stay in the dialog`.)*
3. **A metric with no value and an insufficient baseline:** the card shows "No data recorded" and "Insufficient history", with no change figure, no goal bar and no fake zero in the sparkline. *(Task 3 test `missing value and insufficient history`.)*
4. **Mobile navigation:** the drawer opens from the menu button, a navigation choice closes it, and the chosen view shows. *(Task 2 test `mobile menu opens navigation and closes after choosing`.)*
5. **Double-clicking a feedback action:** one request; the feedback is reflected only after the backend confirms. *(Task 5 test `feedback sends one request and confirms`.)*

---

### Task 1: shadcn foundation and light tokens

**Files:** `frontend/package.json`, `vite.config.ts` and `tsconfig.json` (the `@/*` alias), `components.json`, `src/lib/utils.ts` (`cn`), `src/components/ui/{button,card,badge,dialog,sheet,tabs,tooltip,dropdown-menu,skeleton,separator}.tsx`, `src/index.css` (tokens), `src/test/setup.ts` (Radix polyfills: `scrollIntoView`, `hasPointerCapture`, `releasePointerCapture`, `ResizeObserver`); restyle `.card/.btn-*/.input/.chip` users to light tokens.

**Interfaces:** Produces `cn(...classes)`; `Button` variants `default | outline | ghost | secondary` and sizes `sm | default | icon`; `Card`, `CardHeader`, `CardTitle`, `CardContent`; `Badge` variants `secondary | outline`; theme utilities `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-positive`, `text-warning`, `text-negative`, plus metric accents `text-steps` / `text-sleep` / `text-rhr` / `text-hrv`.

- [ ] Write a failing test `src/lib/utils.test.ts`, `cn merges and de-duplicates Tailwind classes`: `cn("px-2", "px-4")` returns `"px-4"`.
- [ ] Install pinned deps: `@radix-ui/react-{dialog,tabs,tooltip,dropdown-menu,slot,separator}`, `class-variance-authority`, `clsx`, `tailwind-merge`, `sonner`. Add the shadcn component sources (new-york style, Tailwind 4) adapted to the tokens.
- [ ] Replace the dark `@theme` with the light palette, and keep the reduced-motion block.
- [ ] Run `npm test`, `tsc` and `lint`. All existing tests stay green; markup changes come in later tasks.
- [ ] Commit `feat: shadcn foundation and light design tokens`.

### Task 2: App shell: sidebar, mobile drawer, top bar

**Files:**
- Create: `src/components/layout/{AppLayout,Sidebar,TopBar}.tsx`.
- Modify: `src/App.tsx` (view state `overview | edit`; Overview sections get ids `insights` and `trends`).
- Remove: `Controls.tsx` and `Header.tsx` (their content moves into the TopBar and Sidebar; `ProviderBadge` moves into `InsightFeed.tsx`).

**Interfaces:**
- Sidebar navigation: `<nav aria-label="Main">` with links "Overview", "Insights", "Trends", "Edit data". The current view gets `aria-current="page"`; Insights and Trends scroll to their section.
- TopBar:
  - user select labelled "Synthetic user", date input labelled "Date";
  - button "Refresh" (bumps `version`);
  - status text "Data loaded" / "Loading…" / "Data unavailable";
  - "Demo data" DropdownMenu: a scenario select labelled "Demo scenario" plus a "Regenerate data" button (regenerating with unsaved edits still asks for confirmation).
- Mobile: a button "Open navigation" opens a Sheet with the same nav.

- [ ] Write failing tests in `App.test.tsx`:
  - `sidebar switches between overview and the data editor`;
  - `mobile menu opens navigation and closes after choosing`;
  - `refresh re-fetches every panel` (the baselines, observations and feed spies are called again);
  - `top bar shows the data status`.

  Port the existing App tests (user/date switch, scenario regenerate via the Demo data menu, correction refresh, unsaved-edits confirm, recalculation survives view switch, API-down error) to the new controls.
- [ ] Implement it. On ≥ lg the sidebar is fixed at 240 px and the content max width is 1200 px; below lg there's a sticky top bar with the menu button.
- [ ] Run `npm test`, `tsc` and `lint`, then take screenshots at 1440, 768 and 390 px with no horizontal overflow.
- [ ] Commit `feat: app shell with sidebar, mobile navigation and top bar`.

### Task 3: Overview heading, metric cards, data-quality notice

**Files:** `src/components/MetricCard.tsx` (rebuilt on Card), `src/components/DataQualityStatus.tsx` (a calm notice), the Overview heading in `App.tsx`.

**Interfaces:**
- `MetricCard({ baseline, history, highlighted, onCorrect })`:
  - `history: Observation[]` (the 28-day observations response) feeds the sparkline (`aria-label` "{Label} over the last 28 days");
  - `onCorrect()` opens the correction dialog (Task 7);
  - a goal-progress bar (`role="progressbar"`, `aria-valuenow`) is shown only when `goal_progress_percent` isn't null.
- `MetricCardSkeleton` while baselines load.
- Copy:
  - the heading "Your daily insights";
  - the subtext from `design.md` §5;
  - the user context line (name, profile, goals, timezone, date);
  - a compact synthetic-data notice.

- [ ] Write failing tests: `shows value, baseline and change from the backend`; `missing value and insufficient history` (Review Focus 3); `sparkline plots the real history and leaves gaps` (the sparkline has one point per non-null value and no zero); `goal progress bar uses backend progress`; `metric skeletons while loading`. Keep the existing value/baseline/difference testids.
- [ ] Implement, then run `npm test`, `tsc` and `lint`.
- [ ] Commit `feat: overview heading and metric cards with sparklines`.

### Task 4: Trends section

**Files:** `src/components/TrendChart.tsx`

- [ ] Write failing tests: `metric tabs switch the chart` (Radix Tabs with roles `tab` and `tabpanel`; the heading updates); `baseline explanation is available` (a tooltip trigger "About personal baselines" reveals the `design.md` §7 text); `chart skeleton while loading`. Keep the table-view tests.
- [ ] Implement: a light chart (accent line, a subtle grid, the baseline as a dashed neutral reference line labelled "Personal baseline", gaps for missing days, a white tooltip card, a y-axis unit label). Remove the glow filter and draw-in animation; a gentle fade is enough.
- [ ] Commit `feat: light trends section with metric tabs`.

### Task 5: Insight feed and cards

**Files:** `src/components/InsightFeed.tsx`, `src/components/InsightCard.tsx`, `src/main.tsx` (the sonner `Toaster`).

**Interfaces:**
- `InsightCard` loads `api.evidence(insight_id)` and shows an evidence summary row: observed, baseline and change per metric, formatted with `formatValue` / `formatSigned` / `formatPercent`.
- Feedback lives in a DropdownMenu (trigger "Insight actions") with the items "Dismiss" and "Not relevant". It's disabled while pending, and a toast "Insight dismissed" or "Marked as not relevant" appears after the 201.
- "Why am I seeing this?" calls `onOpenEvidence(insight)`.
- The empty-feed copy comes from `design.md` §15; skeleton cards show while loading.

- [ ] Write failing tests: `cards show the evidence summary from the evidence endpoint`; `feedback sends one request and confirms` (Review Focus 5); `empty feed uses the specified copy`; `insight skeletons while loading`; `backend order is preserved` (render the fixture with ranks 2 and 1 in that order; the DOM order matches the response). Port the existing feed tests (generate, regenerate, outdated recalculate, hidden toggle, errors, insight metrics callback).
- [ ] Implement: a subtle left border in the metric accent, the headline, a 2–3 sentence explanation, a confidence badge with an icon, and the provider badge.
- [ ] Commit `feat: insight feed with evidence summaries and feedback menu`.

### Task 6: Evidence drawer

**Files:** `src/components/EvidencePanel.tsx` (it becomes the drawer body), `src/components/EvidenceDrawer.tsx` (Sheet), and `App.tsx` (the open insight is held in the Overview state and cleared on a user/date/version change).

**Interfaces:** `EvidenceDrawer({ insight: Insight | null, onClose })`. Its title is the insight title. It shows a table per evidence record (keeping the existing field rows) and a mini bar chart of the supporting observations with the target date highlighted (`aria-label` "Supporting observations"), plus a confidence explanation and the score breakdown.

- [ ] Write failing tests: `why am I seeing this opens the evidence drawer`, which shows the backend values and closes on Escape; `evidence drawer closes when the user changes` (Review Focus 1); `target date is highlighted in the supporting observations`. Port the existing evidence tests.
- [ ] Implement, then commit `feat: evidence drawer`.

### Task 7: Correction dialog

**Files:** `src/components/CorrectionDialog.tsx`, `MetricCard.tsx` (its action opens the dialog), `App.tsx`.

**Interfaces:** `CorrectionDialog({ open, metric: MetricBaseline | null, date, onOpenChange, onSubmit: (value: number) => Promise<void> })`. It shows the metric, the date, the current value and a "New value ({unit})" input; the button "Save correction" shows pending state; non-numbers are validated in the client; backend errors are shown inline. On success it closes, shows the toast "Correction saved — insights recalculated", and the page bumps `version`.

- [ ] Write failing tests: `correct value opens a dialog with metric, date and current value`; `correction errors stay in the dialog` (Review Focus 2); `successful correction closes the dialog, refreshes and confirms`. Remove the old inline pencil-form tests.
- [ ] Implement, then commit `feat: correction dialog`.

### Task 8: Data editor view and notes, light

**Files:** `src/components/DataEditor.tsx` and `src/components/NotesPanel.tsx` (light restyle only; behaviour unchanged); the Edit data view heading.

- [ ] Run the existing DataEditor and Notes tests; they must stay green untouched. Restyle with the tokens: changed cells get an accent-tinted background and ring, flagged cells a warning tint plus icon, corrected cells a positive tint.
- [ ] Commit `feat: light data editor and notes`.

### Task 9: E2E, docs, verification

**Files:** `frontend/e2e/dashboard.spec.ts`; `README.md` (UI section, demo script); `ARCHITECTURE.md` (frontend tree); `DECISIONS.md` (D35 shadcn/ui, D36 light theme supersedes D32, D37 layout mapping); `MEMORY.md`; `REPORT.md` (counts).

- [ ] Update the e2e tests to the new controls (the native selects keep their labels; tabs become sidebar links; the correction uses the dialog). Add `the core flow`: open an insight's evidence → correct the measurement in the dialog → the chart, baseline and feed update and the evidence drawer shows the new run's evidence.
- [ ] Run everything (pytest, vitest, tsc, lint, build, e2e twice). Take screenshots at 1440, 768 and 390 px and look at them.
- [ ] Commit `feat: e2e and docs for the light redesign`.
