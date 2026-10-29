# Requirements — Part A: PRD (Personalised Wearable Insight & Evidence Agent)

> Faithful Markdown transcriptions of `PRD.pdf` (v1.0, Part A) and `Intern Hiring Task 3.docx` (Part B, at the end). The original files are the source of truth. Do not add scope here.

**Version:** 1.0
**Project type:** AI/ML + LLM agent + data analytics web application
**Primary objective:** Build a working, reproducible, evidence-backed daily-insights agent using simulated wearable data.

## 1. Product vision

Build a web application that helps users understand meaningful changes in their daily activity, sleep, resting heart rate (RHR), and heart-rate variability (HRV).

The application must not simply display charts or send raw measurements to an LLM. It must implement a deterministic analytics pipeline that calculates personal baselines, detects deviations, ranks candidate insights, and supplies verified evidence to an LLM that explains the results in accessible language.

The project must demonstrate:

- Data simulation and ingestion.
- Statistical analysis and personalized baselines.
- Rule-based anomaly and trend detection.
- Explainable insight prioritization.
- LLM-based natural-language explanations.
- Evidence provenance and traceability.
- Reliable API design, testing, and a polished dashboard.

## 2. Target users

1. Individuals who want to understand changes in their wearable measurements.
2. Developers and evaluators who want to inspect how the agent derives its insights.
3. Project reviewers who need to verify that insights come from actual computations rather than fabricated LLM output.

## 3. Scope

### Must-have features

- Simulated daily wearable records.
- Multiple synthetic user profiles with distinct behavioral patterns.
- Daily measurements for steps, sleep duration, RHR, and HRV.
- Configurable historical lookback window.
- Personal baseline and deviation calculations.
- Data-quality validation and missing-data handling.
- Deterministic candidate generation and ranking.
- Selection of the top 3 relevant insights, or fewer when insufficient evidence exists.
- Gemini-powered explanations with a deterministic fallback.
- Evidence panels showing calculations and source observations.
- Historical charts and a daily insights dashboard.
- Reproducible demo scenarios.
- Unit tests, integration tests, setup documentation, and environment configuration.

### Out of scope

- Real wearable integrations such as Fitbit, Apple Health, or Garmin.
- Medical diagnosis, treatment recommendations, or emergency detection.
- Clinical claims that have not been validated.
- Training a foundation model.
- Population-level medical risk prediction.
- Production deployment requiring real patient data.

## 4. Recommended technology stack

Use the following stack unless an implementation constraint makes a specific choice impractical.

### Frontend

- React with TypeScript.
- Vite.
- Tailwind CSS.
- Recharts for time-series charts.
- Lucide icons.
- Responsive layouts for desktop and mobile.

### Backend

- Python 3.12 or a compatible supported Python version.
- FastAPI.
- Pydantic for validation and API schemas.
- Pandas and NumPy for data processing.
- SciPy only where statistically appropriate.
- pytest for testing.

### Persistence

- SQLite for the initial local implementation.
- SQLAlchemy for database access and migrations if needed.
- Store simulated observations, generated insight records, and associated evidence.

### LLM integration

- Gemini API through the official supported Python SDK.
- Read the API key from `GEMINI_API_KEY` in the environment.
- Never expose the API key in frontend code or commit it to version control.
- Use structured JSON output validated through Pydantic.
- Provide a deterministic template-based fallback when the API is unavailable.

### Development and delivery

- Git.
- Docker and Docker Compose where practical.
- `.env.example`.
- README with exact installation, configuration, testing, and run commands.

Do not add LangChain, LangGraph, vector databases, or additional infrastructure unless a concrete requirement justifies them. The core project should remain understandable and easy to run locally.

## 5. Data model

Generate one observation per user per calendar day.

Required fields:

- `user_id`: string
- `date`: ISO 8601 calendar date
- `steps`: non-negative integer or null
- `sleep_hours`: non-negative numeric value or null
- `resting_heart_rate_bpm`: positive numeric value or null
- `hrv_ms`: positive numeric value or null
- `data_quality_flags`: list of validation or missing-data flags

Use synthetic users with clearly different patterns:

- User A: consistently active, regular sleep, relatively stable measurements.
- User B: irregular sleep and activity.
- User C: gradual changes over several weeks.
- User D: missing readings and occasional noisy measurements.

Provide at least 90 days of reproducible synthetic observations per demo user.

### Data simulation requirements

Use a configurable random seed so the same seed produces the same dataset.

Generate plausible variation using a combination of:

- User-specific means and standard deviations.
- Weekly activity patterns.
- Small day-to-day random variation.
- Gradual trends.
- Occasional missing readings.
- Controlled synthetic anomalies.

Do not independently randomize every metric without regard to user identity or temporal continuity.

Support named scenarios such as:

- `stable_baseline`
- `reduced_sleep`
- `elevated_rhr`
- `lower_hrv`
- `reduced_activity`
- `missing_data`
- `gradual_trend`

Document that all records are synthetic and are not actual medical measurements.

## 6. Personalized baseline engine

Implement the baseline engine entirely in Python. Do not delegate statistical calculations to the LLM.

### Baseline window

Use the previous 28 calendar days as the default lookback window, excluding the target day. Make the window configurable.

A baseline should require a configurable minimum number of valid observations. Default to 14 valid observations within the 28-day window.

When the minimum is not met:

- Mark the baseline as insufficient.
- Return the valid observation count.
- Do not invent a baseline.
- Suppress unsupported deviation-based insights.

### Metrics to calculate

For each metric, calculate:

- Valid observation count.
- Personal baseline mean.
- Personal baseline median.
- Standard deviation or robust dispersion estimate.
- Most recent valid observation.
- Absolute difference from baseline.
- Percentage difference where mathematically meaningful.
- Robust standardized deviation where appropriate.
- Baseline window start and end dates.

Use metric-specific rules.

For steps and sleep, use the median as a robust reference and optionally show the mean for comparison.

For resting heart rate and HRV, use a robust reference such as the median and a robust dispersion estimate such as the median absolute deviation (MAD).

If MAD is zero or too small, do not divide by zero. Use a documented fallback, such as a standard-deviation-based score when valid, or classify the deviation as not reliably standardized.

For a conventional standardized score, define:

```
z = (current_value - baseline_mean) / baseline_standard_deviation
```

For a robust score, define:

```
robust_z = 0.6745 * (current_value - baseline_median) / MAD
```

Only calculate a score when its denominator is valid. Document the conventions and metric-specific interpretation.

### Directionality

Store both the raw direction and the interpretation.

Examples:

- Steps below baseline: reduced activity.
- Sleep below baseline: shorter sleep duration.
- RHR above baseline: elevated relative to the user's history.
- HRV below baseline: lower than the user's personal reference.

Do not assume that every decrease is bad or every increase is good. Interpret measurements in context, and do not make medical diagnoses.

## 7. Insight generation and prioritization

Build a deterministic insight engine that converts validated baseline comparisons into candidate insights.

The engine must operate before the LLM call.

### Candidate insight categories

- Meaningful deviation from personal baseline.
- Multi-day trend.
- Unusual combination of metrics.
- Positive or negative change relative to personal patterns.
- Data-quality limitation that prevents a reliable conclusion.

### Example candidate rules

These thresholds are illustrative starting values, not medical thresholds. Keep them configurable and test their behavior.

- Steps: a change of approximately 25% or more relative to the baseline median, provided the baseline is positive.
- Sleep: a change of approximately 1 hour or more relative to the baseline median.
- RHR: a difference of approximately 5 bpm or more relative to the baseline median.
- HRV: a difference of approximately 15% or more relative to the baseline median, provided the baseline is positive.

Add a minimum absolute or relative difference requirement where appropriate to avoid reporting insignificant changes. Do not rely on standardized scores alone when the baseline dispersion is extremely small.

### Ranking

Rank candidates with a deterministic score based on:

- Magnitude of deviation.
- Persistence across multiple days.
- Data quality and baseline reliability.
- Relevance to the user's recent pattern.
- Novelty relative to previously surfaced insights.
- Redundancy with other candidates.

Normalize the components to comparable ranges. Document the formula, component weights, and tie-breaking rules.

The ranking algorithm must be implemented and tested in code.

Select at most three primary insights per day by default. Allow fewer than three if there are not enough supported insights.

Do not force the system to produce insights when the data is stable or insufficient.

### Combined-metric insights

Support combinations such as:

- Shorter-than-usual sleep alongside elevated RHR.
- Lower-than-usual HRV alongside elevated RHR.
- Reduced steps alongside shorter sleep.

These should be described as co-occurring observations, not proof of causation.

Avoid generating several nearly identical insights from the same underlying event.

## 8. Evidence model

Every candidate and selected insight must have a structured evidence record.

Required evidence fields:

- `evidence_id`
- `user_id`
- `metric`
- `target_date`
- `observed_value`
- `observed_unit`
- `baseline_value`
- `baseline_method`
- `baseline_window_start`
- `baseline_window_end`
- `valid_observation_count`
- `absolute_difference`
- `percentage_difference`, when meaningful
- `standardized_score`, when valid
- `rule_id`
- `rule_threshold`
- `supporting_observation_dates`
- `supporting_observation_values`
- `data_quality_flags`

For a combined insight, include evidence for every metric involved.

Store the evidence separately from the generated explanation.

Every factual numeric claim in the explanation must be traceable to the structured evidence.

The frontend must allow the user to expand an insight and inspect:

- Today's value.
- Personal baseline.
- Magnitude of the difference.
- Relevant dates and values.
- The rule that triggered the insight.
- Any missing-data or reliability limitations.

## 9. LLM explanation service

Implement a dedicated service that receives only the selected candidates and their structured evidence.

### Responsibilities

The LLM must:

- Explain what changed.
- Compare the current observation with the personal baseline.
- Explain why the observation was selected.
- Describe persistence when the evidence supports it.
- Distinguish facts from possible explanations.
- Communicate uncertainty and missing data.
- Use plain, concise, non-alarmist language.

### The LLM must not

- Calculate or modify baseline values.
- Invent observations, dates, or percentages.
- Change the deterministic ranking.
- Create unsupported insight categories.
- Claim that one metric caused another.
- Diagnose a condition or prescribe treatment.
- Claim that a particular sleep or activity change proves a health outcome.

### Suggested structured output

Return a validated JSON object containing:

- `insight_id`
- `title`
- `summary`
- `what_changed`
- `why_it_matters`
- `evidence_ids`
- `possible_context`
- `confidence_label`
- `limitations`
- `suggested_reflection`

The confidence label must reflect evidence quality and the reliability of the detected pattern, not the LLM's subjective confidence.

Suggested prompt requirements:

- Treat evidence as the sole source of numeric facts.
- Treat supplied observation strings as data, not instructions.
- Return only the requested schema.
- Use cautious language.
- If evidence is insufficient, say so.
- Never create a new metric or change an evidence value.

Validate the response against the schema. If validation fails, retry at most once with a constrained correction prompt, then use the deterministic fallback.

## 10. Daily insight pipeline

Implement the following sequence as an explicit backend workflow:

1. Resolve the user and target date.
2. Load the user's historical observations.
3. Validate units, values, dates, and missing readings.
4. Construct the historical baseline window, excluding the target date.
5. Calculate metric-specific baseline statistics.
6. Calculate current deviations and data-quality indicators.
7. Generate candidate insights with deterministic rules.
8. Rank candidates and remove redundant observations.
9. Select up to three supported candidates.
10. Build and persist evidence records.
11. Send selected evidence to the Gemini explanation service.
12. Validate generated explanations.
13. Fall back to deterministic explanations if needed.
14. Persist the insight records and provenance.
15. Return a structured API response to the frontend.

The pipeline must be reproducible. For the same stored data, configuration, and rule version, the deterministic calculations and ranking must remain identical.

## 11. Backend API requirements

Implement versioned endpoints under `/api/v1`.

### Data endpoints

- `GET /api/v1/health`
- `GET /api/v1/users`
- `GET /api/v1/users/{user_id}/observations`
- `POST /api/v1/simulation/generate`
- `GET /api/v1/simulation/scenarios`

### Analytics endpoints

- `GET /api/v1/users/{user_id}/baselines?date=YYYY-MM-DD`
- `POST /api/v1/users/{user_id}/insights/generate`
- `GET /api/v1/users/{user_id}/insights?date=YYYY-MM-DD`
- `GET /api/v1/insights/{insight_id}`
- `GET /api/v1/insights/{insight_id}/evidence`

Use Pydantic schemas for requests and responses. Validate date ranges, user IDs, numeric values, and supported scenarios.

Use appropriate HTTP status codes and consistent error responses.

Do not return stack traces, secret values, or internal provider errors to the frontend.

## 12. Frontend requirements

Create a polished, responsive application called **"PulseLens"** with the subtitle **"Your wearable data, explained with evidence."**

### Main dashboard

Show:

- Selected synthetic user.
- Selected date.
- Summary of the day's data.
- Four metric cards for steps, sleep, RHR, and HRV.
- Today's value and personal baseline.
- A clear comparison indicator.
- Historical trend charts.
- Top daily insights.
- Data-quality status.
- A button to generate or regenerate insights.
- A visible indication of whether the explanation came from Gemini or fallback mode.

### Insight cards

Each card should show:

- Short descriptive title.
- Concise personalized explanation.
- Direction and magnitude of change.
- Why the insight was selected.
- Evidence reliability label.
- Expandable evidence details.
- Supporting date/value comparisons.
- Limitations and cautious contextual interpretation.

### Historical view

Allow the user to:

- Select among synthetic users.
- Choose a date.
- View at least 7-day and 28-day trends.
- Switch between metrics.
- Explore stable and anomalous demo scenarios.
- Inspect previous insights and their supporting evidence.

### User experience

Include:

- Loading states.
- Empty states.
- API error states.
- Insufficient-history states.
- Missing-data indicators.
- Responsive mobile layouts.
- Accessible labels and keyboard navigation.

Do not fill the UI with hardcoded insight examples. All dashboard measurements, baseline values, charts, and insight cards must come from backend responses.

## 13. Persistence and reproducibility

Persist:

- Synthetic user profiles.
- Daily observations.
- Insight candidates or generation results where appropriate.
- Selected insight records.
- Evidence records.
- Algorithm/rule version.
- Generation timestamp.
- Explanation provider and fallback status.

Repeated generation for the same target date and unchanged data should not create duplicate records unnecessarily.

Allow scenario regeneration with a fixed random seed. When the dataset changes, invalidate or version stale insights appropriately.

## 14. Reliability, privacy, and safety

- Clearly identify the application as a research/demo prototype using synthetic data.
- Do not collect real medical data.
- Do not expose API keys.
- Never send unnecessary personal information to the LLM.
- Use input validation and parameterized database access.
- Handle missing or implausible values without crashing.
- Keep deterministic analytics available when the LLM provider is unavailable.
- Do not present insights as diagnoses, medical advice, or proof of causation.
- Do not invent sources, citations, clinical studies, or external evidence.
- Distinguish observed evidence from speculative context.
- Do not claim clinical validation.

For this project, "evidence-backed" means traceable support from the simulated observations and calculations. External scientific references may be added as a separate, verified feature, but must never be fabricated.

## 15. Testing and acceptance criteria

### Data and baseline tests

- Fixed seeds produce reproducible observations.
- The target day is excluded from its own baseline.
- Missing values are excluded from calculations.
- Insufficient history is explicitly represented.
- Zero baselines do not cause division errors.
- Robust scores handle zero MAD safely.
- Invalid units and out-of-range values are flagged.

### Insight tests

- A stable dataset does not produce forced anomalies.
- Each injected scenario produces its expected candidate when thresholds are satisfied.
- Ranking is deterministic.
- Duplicate candidates are suppressed.
- The top-three limit is enforced.
- Every selected insight references valid evidence.
- Combined insights reference all required metrics.

### LLM tests

- Mock the provider in automated tests.
- Invalid JSON triggers validation and fallback behavior.
- Unsupported numeric claims are rejected or excluded.
- LLM failure does not break the daily pipeline.
- Every displayed insight contains evidence IDs.
- The application works without a Gemini API key in demo mode.

### API and UI tests

- All endpoints have tests for valid and invalid inputs.
- Frontend values match backend responses.
- Empty and error states render correctly.
- Scenario selection refreshes the correct data.
- Evidence panels show actual backend evidence.

### Definition of done

The project is complete when:

1. A developer can start it using documented commands.
2. At least four distinct synthetic users are available.
3. At least 90 days of data can be generated per demo user.
4. The baseline engine produces reproducible personalized statistics.
5. Candidate generation and ranking run independently of the LLM.
6. Daily insights include traceable evidence.
7. Gemini explanations work when configured.
8. A fallback explanation works without Gemini.
9. The dashboard displays live backend results rather than hardcoded data.
10. Automated tests pass.
11. The README explains architecture, algorithms, configuration, limitations, and demo scenarios.

## 16. Required deliverables

- Complete frontend source code.
- Complete backend source code.
- Database models and initialization or migration scripts.
- Deterministic simulation engine.
- Baseline calculation module.
- Insight generation and ranking module.
- Evidence generation and persistence module.
- Gemini integration and deterministic fallback.
- Unit and integration tests.
- `.env.example`.
- Docker configuration if implemented.
- README with setup and demo instructions.
- Architecture diagram.
- Example API requests and responses.
- A brief technical report describing algorithms, design choices, limitations, and acceptance-test results.

## 17. Engineering principles

1. Build in small, verifiable phases.
2. Keep simulation, analytics, ranking, evidence, LLM, API, and UI logic separate.
3. Never place statistical logic inside frontend components.
4. Never rely on the LLM to generate raw metric values or evidence.
5. Do not mark a phase complete until its tests and acceptance criteria pass.
6. Keep the application runnable at every milestone.
7. Prefer a simple, explainable algorithm over an unnecessary complex model.
8. Document assumptions instead of silently inventing behavior.
9. Use real backend responses throughout the application.
10. At the end of each phase, report changed files, tests run, test results, and remaining (work).

---

# Part B — Intern Hiring Task 3 (additional requirements)

> Transcription of `Intern Hiring Task 3.docx`. Part B adds to Part A (the PRD). Where they conflict, the resolution is in `DECISIONS.md` (D13+).

## Intern Hiring - Personalised Wearable Insight & Evidence Agent

### Task Overview

Build an LLM-powered daily-insights agent using simulated wearable data. The system should decide which observations are worth showing, calculate their evidence in code, and explain them clearly to the user. The focus is on reliable prioritisation, personal baselines, explainability, and missing-data handling - not generating generic wellness advice.

### Core Tasks (Keep It Focused)

**1. Wearable Data & User Goals**
- Create at least 21 days of simulated steps, sleep duration, resting heart rate, and HRV for two users.
- Store date, value, unit, available/missing flag, and optional data-quality marker.
- Create a simple user profile with an activity goal and preferred sleep target.

**2. Baseline & Trend Calculations**
- Calculate rolling personal baselines and day-over-day or week-over-week changes in code.
- Implement rules for at least three insight types: improving trend, notable deviation, and missing-data warning.
- Require a stated minimum amount of valid data before generating a trend; avoid comparing incompatible units.

**3. LLM Integration & Evidence Tools (Primary Focus)**
- Integrate any LLM API and provide tools such as:
  - `get_metric_history(user_id, metric, date_range)`
  - `calculate_personal_baseline(user_id, metric)`
  - `check_data_completeness(user_id, date_range)`
- The LLM may choose and phrase insights, but may not invent metric values, percentages, or correlations.
- Each insight must identify the metric, dates, numbers, and comparison supporting it.

**4. Daily Insight Feed (Minimal UI)**
- Build a simple API or page showing at most three ranked insights for a selected day.
- Each card/result must include a short headline, grounded explanation, evidence, and confidence flag.
- Add an "Why am I seeing this?" interaction that reveals the underlying data and rule.

**5. User Feedback & Data Correction**
- Allow the user to dismiss an insight or flag it as irrelevant; retain the feedback.
- Provide a simple correction flow for one sample metric and recompute affected insights.
- Do not keep showing an outdated insight after its supporting data has changed.

**6. Incomplete & Contradictory Data**
- Seed scenarios with gaps, a suspicious one-day spike, and two conflicting values for one date.
- Suppress or qualify insights where coverage is too low or evidence is inconsistent.
- Handle dates and timezones consistently when generating the daily feed.

**7. Safety & Verification**
- Keep responses informational, without diagnosis, treatment, or predictions of medical risk.
- Treat user notes as untrusted, including a note instructing the model to fabricate an insight.
- Test at least four cases covering correct calculations, missing data, corrections, and unsupported claims.

**8. Deliverables**
- Submit source code, reproducible simulated data, calculation tests, and setup instructions.
- Include a short demo video showing a daily feed, evidence view, and changed result after correction.
- Include a code walkthrough explaining selection rules and grounding of the LLM response.
