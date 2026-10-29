# PulseLens — Frontend Design & Implementation Specification

## 1. Project Overview

PulseLens is a personalised wearable-insights dashboard that transforms wearable data into clear, evidence-backed daily insights.

The application works with four primary metrics:

- **Steps:** Daily physical activity.
- **Sleep Duration:** Total sleep recorded per day.
- **Resting Heart Rate (RHR):** Daily resting heart rate.
- **Heart Rate Variability (HRV):** Daily HRV measurements.

The backend is already implemented. Your task is to **inspect, fix, integrate, and polish the existing frontend** so that it feels like a production-quality analytics product.

The UI must help users answer three questions:

1. What changed in my wearable data?
2. Why is this insight being shown to me?
3. What underlying data supports this conclusion?

This is an evidence-first analytics application, not a generic chatbot or a medical diagnosis tool.

---

## 2. Primary Objective

Improve the existing frontend without unnecessarily rebuilding the project.

Before making changes:

1. Inspect the existing repository and frontend structure.
2. Read the current frontend components, styles, routing, state management, and API service layer.
3. Inspect the backend routes, request parameters, response schemas, and existing functionality.
4. Identify the actual integration gaps and UI defects.
5. Create a concise implementation plan, then implement the changes.

**Important constraints:**

- The backend is ready. Do not rewrite backend functionality.
- Do not replace existing API endpoints with mock endpoints.
- Do not invent API response fields. Use the actual backend schemas.
- Do not hardcode insight values, baseline values, or chart data when the backend provides them.
- Preserve existing working functionality.
- Reuse the current framework and dependencies wherever possible.
- Do not introduce unnecessary libraries.
- Do not remove features just because they need integration fixes.
- If an API contract is unclear, inspect the backend implementation before deciding how to consume it.

The result should be a complete, functional frontend connected to the existing backend—not just a static design mockup.

---

## 3. Visual Design Direction

### Overall aesthetic

Create a refined, modern health-data analytics dashboard with the visual quality of a premium SaaS product.

The design should feel:

- Clean and minimal.
- Data-rich without feeling cluttered.
- Calm and trustworthy.
- Modern and polished.
- Highly readable.
- Focused on meaningful insights rather than decorative charts.

Avoid the appearance of a generic admin template.

### Design references

Use the following broad visual principles as inspiration:

- Linear: consistent spacing, restrained surfaces, and polished interactions.
- Vercel: clean typography and clear visual hierarchy.
- Stripe: well-structured analytics and readable data presentations.
- Modern wellness applications: calm colors and approachable language.

Do not copy any product's exact layout or branding.

### Color palette

Use a restrained palette with CSS variables or the project's existing design-token system.

Suggested light theme:

- Page background: `#F7F8FA`
- Primary surface: `#FFFFFF`
- Primary text: `#172033`
- Secondary text: `#687386`
- Primary accent: `#635BFF`
- Borders: `#E6E9EF`
- Positive trend: `#16845B`
- Warning: `#B7791F`
- Negative trend: `#C24141`
- Neutral information: `#64748B`

Use status colors consistently and always pair them with text or icons. Color alone must not communicate meaning.

Use subtle shadows, thin borders, consistent corner radii, and adequate whitespace. Avoid excessive gradients, glowing effects, glassmorphism, and oversized decorative elements.

### Typography

Use the existing font if it is already configured. Otherwise, use a clean sans-serif typeface such as Inter.

Establish a clear hierarchy:

- Page title: 28–32px on desktop.
- Section title: 18–22px.
- Card title: 14–16px.
- Main metric value: 28–36px.
- Body text: 14–16px.
- Metadata and helper text: 12–13px.

Maintain comfortable line heights and sufficient contrast.

### Layout

- Desktop-first analytics dashboard.
- Center the main content within a sensible maximum width.
- Use a consistent spacing scale.
- Use a responsive grid for metric and insight cards.
- Avoid horizontal overflow.
- Make tables, charts, and evidence panels responsive.
- Use consistent alignment across all sections.

---

## 4. Application Layout

Build upon the existing routing and page structure. If the project currently has a single dashboard page, improve it rather than introducing unnecessary pages.

The primary application layout should contain:

### A. Sidebar

Create a compact, elegant sidebar with:

- PulseLens logo and wordmark.
- Dashboard navigation.
- Wearable Metrics navigation, if supported by existing functionality.
- Insights navigation, if supported.
- A small informational footer identifying the application as an informational insights tool.

The Dashboard item should be visibly active when the dashboard is open.

On smaller screens, collapse the sidebar into a mobile navigation drawer or suitable compact navigation.

Do not add non-functional navigation items.

### B. Top navigation bar

Include:

- Current page title or breadcrumb.
- User selector, if supported by the backend.
- Selected date or date-range control, where supported.
- Refresh action.
- A compact indication of whether data is loaded, loading, or unavailable.

Use existing backend capabilities to populate user and date controls. Do not assume an endpoint exists without inspecting the API.

### C. Main content area

Arrange the dashboard in this order:

1. Page heading and selected-user context.
2. Key metric summary cards.
3. Metric trends and personal-baseline comparisons.
4. Daily insight feed.
5. Insight evidence and explanation interactions.
6. Data-quality or missing-data information when relevant.

The daily insight feed should be visually prominent. The dashboard's main purpose is to explain meaningful changes, not simply display numbers.

---

## 5. Dashboard Header

At the top of the dashboard, display a heading such as:

**Your daily insights**

Supporting text:

"Understand what changed in your wearable data, with the evidence behind every insight."

Display the selected user's available profile information and selected date.

Include a date selector or date navigation only if the backend supports the necessary date ranges.

Keep the header compact. Do not fill the page with introductory marketing copy.

If the backend provides a data refresh or recomputation operation, expose it through a refresh action and show the result accurately.

---

## 6. Wearable Metric Summary Cards

Create four summary cards for Steps, Sleep Duration, Resting Heart Rate, and HRV.

Each card should display:

- Metric name.
- Latest valid measurement for the selected date.
- Correct unit.
- Comparison with the relevant personal baseline, when available.
- A concise trend indicator, when supported by the backend.
- A small trend visualization using actual historical data.
- A clear unavailable-data state when the measurement is missing or invalid.

### Suggested card structure

**Steps**

`8,420 steps`

`Personal baseline: 7,900 steps`

A compact trend indicator and sparkline may appear below the values.

Apply the same structure to the other metrics, adapting units and formatting.

### Data integrity requirements

- Never substitute zero for missing data.
- Do not display a percentage change when the reference value is zero or invalid.
- Do not display a baseline when there is insufficient valid history.
- Do not calculate a frontend baseline that conflicts with the backend's authoritative calculation.
- Show a neutral placeholder such as "No data" or "Insufficient history" when appropriate.
- Do not infer improvement or deterioration solely from a higher or lower value. The interpretation depends on the metric and the evidence supplied by the backend.

Keep these cards compact and consistent.

---

## 7. Metric Trends and Personal Baselines

Add a dedicated analytics section showing historical trends for the four wearable metrics.

Use the charting library already installed in the project. If no charting library exists, select an appropriate lightweight library only after inspecting the existing dependencies.

### Chart requirements

- Display dates on the horizontal axis.
- Display the relevant metric and unit on the vertical axis.
- Use readable tooltips.
- Show missing observations as missing data rather than zero.
- Allow users to distinguish actual measurements from personal-baseline references.
- Keep grid lines subtle.
- Use responsive chart containers.
- Avoid excessive labels and unnecessary chart decorations.

Where supported by the backend, display the personal baseline as a reference line or clearly differentiated reference value.

### Metric selection

Provide tabs, segmented controls, or another compact selector for:

- Steps
- Sleep
- Resting Heart Rate
- HRV

Switching the selected metric should update the chart and relevant summary information using the existing data.

### Personal-baseline explanation

Include a small explanatory label or tooltip:

"Your personal baseline is calculated from your historical wearable data. Comparisons depend on the amount and quality of available data."

Do not imply that a personal baseline is a clinical reference range.

---

## 8. Daily Insight Feed

This is the most important section of PulseLens.

The feed must display **at most three ranked insights** for the selected user and date. If the backend returns fewer insights, display only those insights. If no insight is sufficiently supported, display a useful empty state instead of inventing one.

Each insight should be rendered as a polished card.

### Insight card contents

Every card should support the following fields when supplied by the backend:

1. Headline.
2. Concise explanation.
3. Primary metric or metrics.
4. Relevant date or date range.
5. Actual measurement and comparison value.
6. Change amount or percentage, when valid.
7. Confidence or evidence-quality indicator.
8. A "Why am I seeing this?" interaction.
9. Dismiss or mark-irrelevant controls.

Use the actual backend response schema. If a field is absent, omit it or show an appropriate unavailable state rather than fabricating a value.

### Visual hierarchy

Each insight card should have:

- A short, prominent headline.
- A readable explanation of approximately two or three sentences.
- A compact evidence summary.
- A subtle confidence or data-quality label.
- An expandable evidence section.
- Clearly accessible feedback actions.

Do not use large colored backgrounds for every insight. Use small icons, subtle left borders, or restrained status indicators where useful.

### Example presentation

The following is illustrative UI copy, not hardcoded data:

**Your step count increased compared with your recent baseline**

"Your recorded steps were higher than your personal baseline for this date."

Evidence:
- Observed value: supplied by the backend.
- Baseline value: supplied by the backend.
- Comparison period: supplied by the backend.
- Data coverage: supplied by the backend.

The frontend must render the actual returned evidence, not these illustrative placeholders.

### Insight ranking

Respect the order returned by the backend.

Do not independently reorder insights using frontend heuristics. The backend owns insight detection and ranking.

---

## 9. "Why Am I Seeing This?" Evidence Panel

Every insight must have a discoverable evidence interaction.

When a user clicks "Why am I seeing this?", open an expandable panel, side drawer, or modal. Prefer an inline expandable panel for simple evidence and a side drawer for richer details.

The interaction must reveal the data and reasoning that support the insight.

### Evidence panel contents

Display available information such as:

- Insight rule or explanation.
- Primary metric.
- Target date or comparison period.
- Actual observation.
- Personal baseline or comparison value.
- Difference and percentage change, where applicable.
- Historical observations used.
- Valid and missing observation counts.
- Data-quality warnings.
- Confidence or evidence-quality explanation.
- Any other provenance fields returned by the backend.

Use readable labels and formatted values instead of dumping raw JSON.

For example:

| Field | Display |
|---|---|
| Metric | Actual metric name |
| Observed value | Actual backend value and unit |
| Baseline | Actual backend baseline and unit |
| Comparison | Actual backend comparison |
| Coverage | Actual valid-data coverage |
| Rule | Actual rule or explanation |

### Evidence visualization

When useful, show a small table or chart of the historical observations supporting the insight.

Highlight the target date and distinguish it from historical comparison observations.

Do not invent missing values or claim that observations were used unless the backend identifies them as evidence.

### Interaction behavior

- The panel opens without navigating away from the dashboard.
- The user can close or collapse it easily.
- Loading and API error states are handled gracefully.
- The displayed evidence corresponds to the selected insight.
- Evidence must update when the insight is recomputed after a correction.

The evidence interaction is a core feature, not an optional decorative component.

---

## 10. Data Quality and Missing Data

The application must communicate data limitations clearly.

The backend may provide missing observations, suspicious spikes, conflicting values, or insufficient history.

Render those states explicitly and calmly.

### Missing data

When a metric is unavailable:

- Show "No data recorded" or equivalent.
- Preserve the gap in the chart.
- Do not replace the value with zero.
- Do not show misleading comparisons based on incomplete history.
- Display any relevant data-quality explanation returned by the backend.

### Insufficient history

If the backend indicates insufficient history for a baseline or insight:

- Show "Insufficient history" or the supplied explanation.
- Do not invent a baseline.
- Explain that more valid observations are needed if the backend supplies that information.

### Suspicious observations

If the backend flags a suspicious value, display a subtle warning badge and an explanation.

Do not automatically delete, rewrite, or normalize the value in the frontend.

### Conflicting observations

If the backend identifies conflicting values for the same date:

- Show that the data is inconsistent.
- Avoid presenting an unsupported comparison as definitive.
- Preserve the backend's data-quality status and explanation.

Avoid alarming red warning banners for ordinary missing data.

---

## 11. Correcting a Sample Measurement

If the backend already exposes measurement correction functionality, implement a user-friendly correction interaction.

A user should be able to select a supported metric and date, edit the value, and submit the correction.

### Correction flow

1. Open a correction dialog or inline form.
2. Display the selected metric, date, and existing value.
3. Let the user enter a replacement value.
4. Validate required fields and basic input format.
5. Submit the correction through the existing backend API.
6. Display loading and error states.
7. On successful correction, refresh the affected measurements, baselines, charts, and insights.
8. Ensure that stale insights are not left visible.
9. Show a subtle success message after the backend confirms the change.

The frontend must not pretend that a correction succeeded before receiving a successful response.

Use backend validation rules as the source of truth. Any frontend validation should improve usability without replacing backend validation.

Do not add a correction endpoint or modify the backend merely to support a frontend interaction. If the backend does not expose this capability, identify the limitation and report it rather than silently mocking the feature.

---

## 12. Insight Feedback

If supported by the existing backend, allow users to:

- Dismiss an insight.
- Mark an insight as irrelevant.

Use a small menu or compact action buttons on each card.

### Expected behavior

- Give each action a clear label or accessible tooltip.
- Prevent accidental duplicate submissions while a request is in progress.
- Reflect the result only after the backend confirms it.
- Refresh or update the feed when appropriate.
- Persist feedback through the existing API.

Dismissing an insight must not silently change the underlying measurement or calculation rules.

Do not implement feedback as a purely visual toggle if persistence is expected by the backend.

---

## 13. User Selection and Date Navigation

If multiple simulated users are available through the backend, provide a user selector.

When the selected user changes, refresh all user-specific content:

- Metric summaries.
- Historical charts.
- Personal baselines.
- Daily insights.
- Evidence panels.
- Data-quality information.

When the selected date changes, update all date-dependent data.

Avoid mixing measurements or evidence from different users or dates.

Preserve selections when appropriate, but reset invalid insight selections after a user/date change.

Use the backend's supported dates and date formats. Handle dates consistently and avoid off-by-one errors caused by timezone conversions.

Do not assume that the user profile contains fields that the backend does not return.

---

## 14. API Integration Requirements

Inspect the existing backend before implementing API calls.

Use the existing API service layer if one is present. Otherwise, introduce a small, centralized API client consistent with the current framework.

### Requirements

- Keep API calls out of presentational components wherever practical.
- Use the existing base URL and environment configuration.
- Do not hardcode local backend URLs across multiple files.
- Do not expose backend secrets or API keys in client-side code.
- Handle loading, empty, success, and error states.
- Validate or safely handle unexpected response shapes.
- Avoid unnecessary repeated requests.
- Cancel or ignore stale requests when the selected user/date changes rapidly, where appropriate.
- Avoid silently swallowing errors.
- Keep user-facing errors helpful and concise.

### Suggested frontend organization

Adapt these names to the existing codebase rather than creating duplicate structures.

```text
src/
  components/
    layout/
      AppLayout
      Sidebar
      TopBar
    dashboard/
      MetricCard
      MetricGrid
      MetricTrendChart
      InsightFeed
      InsightCard
      DataQualityNotice
    evidence/
      EvidencePanel
      EvidenceTable
    corrections/
      CorrectionDialog
    feedback/
      InsightFeedback
    ui/
      LoadingState
      EmptyState
      ErrorState
      StatusBadge
  pages/
    DashboardPage
  services/
    api
  hooks/
  types/
  utils/
  styles/
```

Use the project's existing naming conventions and architecture wherever possible.

### API contract discipline

Before connecting a component, determine:

- The actual endpoint.
- The HTTP method.
- Required parameters.
- Request body structure.
- Response structure.
- Error response format.
- Whether the endpoint returns computed or raw data.

Do not guess endpoint names or response fields based on component names.

If the API returns already-calculated insights and baselines, render those results rather than recalculating them in the browser.

---

## 15. Loading, Empty, and Error States

Every data-driven section must have appropriate states.

### Loading

- Use skeleton cards for metric summaries.
- Use a chart placeholder while chart data loads.
- Use skeleton insight cards while insights load.
- Avoid making the entire page flash or reload unnecessarily.

### Empty insights

If no insights are returned, show:

**No notable insights for this date**

"Your available data did not produce a sufficiently supported insight for this period."

Use this wording only when it accurately reflects the backend result. If the backend provides a different reason, display that reason.

### Missing metric data

Display a clear unavailable state within the relevant card or chart.

### API errors

Show a concise error message and a retry action where appropriate.

Do not replace API failures with fabricated example data.

### Partial success

If one metric or section fails while others succeed, keep successfully loaded sections visible whenever possible.

---

## 16. Responsive Design and Accessibility

The application must work on desktop, tablet, and mobile screens.

### Responsive behavior

- Desktop: full sidebar, four-column metric grid when space permits.
- Tablet: compact sidebar or suitable navigation, two-column metric grid.
- Mobile: compact navigation, one-column metric cards, vertically stacked insights, and scrollable or responsive charts.

### Accessibility

- Use semantic headings and buttons.
- Add accessible labels to icon-only controls.
- Ensure visible keyboard focus.
- Support keyboard navigation for dialogs and expandable panels.
- Maintain sufficient text contrast.
- Do not rely only on color to communicate data status.
- Ensure chart tooltips and key values remain accessible through appropriate text or labels.

Respect reduced-motion preferences when adding animations.

---

## 17. Interaction and Motion

Use subtle, purposeful interactions:

- Smooth but restrained panel expansion.
- Small hover and focus transitions.
- Clear button loading states.
- Gentle transitions when changing selected metrics.
- Consistent dialog and dropdown behavior.

Avoid unnecessary animations, parallax, animated backgrounds, or long transitions.

Every visible interactive element must perform its stated action.

Do not leave placeholder buttons, fake navigation, or controls that only change appearance without performing their intended behavior.

---

## 18. Technical Implementation Rules

1. Preserve the existing frontend framework and build configuration.
2. Inspect `package.json` and the source structure before adding dependencies.
3. Reuse existing components when they are suitable.
4. Keep components small and focused on clear responsibilities.
5. Use consistent types for API responses if the frontend uses TypeScript.
6. Avoid excessive `any` types and unsafe response assumptions.
7. Keep formatting, units, date handling, and status labels consistent.
8. Avoid duplicated API logic and repeated calculation code.
9. Do not move backend analytics logic into the frontend.
10. Do not modify backend behavior just to make the frontend easier to implement.
11. Do not break existing environment variables or startup commands.
12. Keep the application runnable using its current development workflow.

The LLM is responsible for grounded insight generation on the backend. The frontend should present the resulting insights and evidence clearly; it should not independently invent insight narratives or unsupported medical interpretations.

---

## 19. Testing and Verification

After implementation, run the existing frontend checks and verify the complete user flow.

### Visual checks

- Dashboard layout is consistent and polished.
- Metric cards align correctly.
- Charts render correctly.
- Insight cards remain readable.
- Evidence panels are usable.
- No horizontal overflow appears at common screen sizes.

### Functional checks

- User selection loads the correct user's data.
- Date selection loads the correct date's data.
- Metric selection updates the chart.
- Missing values remain missing.
- Baselines and comparisons come from the backend.
- Insight ordering matches the backend.
- The feed never displays more than three insights.
- Evidence corresponds to the selected insight.
- Correction requests use the real API and refresh affected results.
- Feedback actions persist through the backend when supported.
- Loading, empty, and error states work.
- Stale responses do not overwrite more recent selections.
- No stale insight remains visible after a successful correction and recomputation.

### Final verification

Run the available linting, type checking, and production build commands.

Fix any errors introduced by the changes.

If a check cannot be run because of a missing dependency, unavailable backend, or environment issue, report that limitation accurately.

Do not claim that the frontend is fully tested if the relevant checks have not been run.

---

## 20. Definition of Done

The frontend is complete when:

- The existing application has a coherent, production-quality visual design.
- All primary dashboard sections use real backend data.
- The four wearable metrics are displayed with correct units and unavailable-data handling.
- Historical trends and personal baselines are understandable.
- The daily insight feed displays zero to three backend-ranked insights.
- Every insight exposes its supporting evidence.
- Missing, suspicious, or conflicting data is communicated accurately.
- Supported correction and feedback actions work through the actual APIs.
- Loading, empty, and error states are handled.
- The interface is responsive and accessible.
- Existing backend functionality remains unchanged.
- The application builds successfully and the main user flows have been verified.

## 21. Final Instructions to Claude Code

Work in this order:

**Phase 1 — Inspect:** Understand the existing frontend, backend API contracts, and current defects.

**Phase 2 — Plan:** Identify the files to change, reusable components, missing integrations, and design improvements.

**Phase 3 — Implement:** Fix the existing frontend, improve the design system and layout, and connect all relevant components to real backend endpoints.

**Phase 4 — Verify:** Run the frontend, test API integration, check responsive layouts, and fix regressions.

**Phase 5 — Report:** Summarize the changes, files modified, API integrations completed, checks performed, and any remaining limitations.

Do not stop after generating a plan or providing sample code. Implement the changes in the existing repository.

**Priority order:** Correct API integration → functional dashboard → evidence transparency → polished visual design → responsive behavior → final testing.

The most important demonstration is this complete flow:

**Open a daily insight → inspect its supporting evidence → correct a measurement → observe the updated chart, baseline, and insight feed.**

Make that experience reliable, clear, and visually polished.
