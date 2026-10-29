# LunaPulse — Technical report and code walkthrough

LunaPulse is a personalised wearable insight and evidence agent, built as a research/demo prototype on synthetic data. This report covers both deliverables the requirements ask for: the PRD's technical report (algorithms, design choices, limitations, acceptance-test results, §16) and Part B's code walkthrough (selection rules and how the LLM response is grounded).

## 1. Summary

LunaPulse turns simulated wearable readings into **at most three daily insights**, each backed by stored evidence. Every statistic, comparison, rule decision, ranking score and confidence label is computed by deterministic Python. The language model (Gemini `gemini-3.5-flash`) only *phrases* insights that code already selected. It can call three read-only tools to check facts, and it can drop an insight it can't ground. Every number it writes is checked against the evidence and the tool results. When Gemini is unavailable or its answer fails validation, a deterministic template explanation is used instead, so the app works without an API key.

| Result | |
|---|---|
| Backend tests | **191 passed** (142 unit, 49 API integration), Gemini always mocked |
| Frontend tests | **100 passed** (Vitest + React Testing Library, incl. a WCAG contrast check of the design tokens) |
| End-to-end tests | **10 passed** (Playwright, real backend in fallback mode, real UI, incl. the evidence → correction → update flow and a 390 px mobile check), stable over repeated runs |
| Live Gemini | full tool loop verified with a real key: tool call → grounded JSON → validated → stored (§7) |
| Type-check / lint / build | clean |

## 2. Design choices

The requirements left several things open. Each choice is recorded with its reason in [`DECISIONS.md`](DECISIONS.md). The most important:

- **Deterministic selection; the LLM only explains (D13).** PRD §9 says the LLM "must not change ranking", while Part B says it "may choose and phrase insights". Code ranks and selects. Gemini can *drop* an insight it cannot ground (recorded with a reason), but it cannot add, reorder or rescore. This keeps every displayed insight reproducible and traceable.
- **Readings stored raw; daily observations derived (D5).** Part B asks for per-reading value, unit, available flag and quality marker; the PRD asks for one daily row. Readings are stored one per row, and `build_daily_observation` derives the PRD §5 shape with explicit flags. Units are never converted, so incompatible units are never compared.
- **Improving trend against the user's own goal (D14).** "Improving" is defined as the gap to the user's step goal or sleep target shrinking by at least the rule threshold. That avoids the "decrease is bad" assumption the PRD forbids. RHR and HRV trends are always described neutrally.
- **Idempotent runs and staleness instead of duplicates (D11, D18).** A run is keyed by (user, date, rule version). Regenerating data or correcting a value marks every affected run stale, so outdated insights are never shown again.
- **Untrusted notes (D15).** Notes reach the LLM only in a delimited `untrusted_user_note` field. Their numbers are never allowed in claims, and the fallback never repeats them.
- **Confidence comes from code (D9).** The confidence label depends on coverage, data-quality flags, standardisation reliability, persistence and spikes. It never comes from the model.
- **Simplicity.** No LangChain, vector DB, queue or state library. Plain functions, one `fetch` wrapper, and a `useAsync` hook. Analytics use Python's `statistics` module (D28).

## 3. Algorithms

### 3.1 Synthetic data ([`simulation.py`](backend/app/simulation.py))
Each user profile defines a mean, a day-to-day SD and an AR(1) continuity coefficient per metric, plus a weekly steps pattern, a slow drift (User C), and missing and noise rates. A shared daily "recovery" factor moves RHR up and HRV and sleep down together, so the metrics are not independent random draws. All random numbers are drawn **before** the scenario is applied, so a scenario changes only its own metric on its own recent days, and the same `(seed, days, end_date)` always gives identical data (`test_same_seed_gives_identical_data`). User D also carries the Part B messy cases at fixed offsets (§README).

### 3.2 Readings → daily observation ([`observations.py:64`](backend/app/observations.py#L64))
For each metric on each day:
1. A valid `user_correction` reading overrides everything (`corrected:<metric>`).
2. Unavailable → `missing`. Wrong unit → `invalid_unit` (never converted). Outside the plausible range → `out_of_range`.
3. Two or more valid device readings that differ by more than the metric's tolerance → `null` + `conflicting_values`. Readings within tolerance are averaged.
4. A device quality marker keeps the value and adds `quality_marker:<metric>`.

### 3.3 Baseline and deviation ([`baselines.py:163`](backend/app/baselines.py#L163), [`:214`](backend/app/baselines.py#L214))
- Window `[t−28, t−1]`. The target day is never included. Only non-null values count.
- Fewer than 14 valid values → `status: insufficient` with the count, and no statistics.
- `mean`, `median`, `std` (ddof 1), `MAD = median(|x − median|)`.
- `absolute_difference = x − median`. `percentage_difference = 100·Δ/median`, only when the median is > 0.
- Standardised score: `robust_z = 0.6745·(x − median)/MAD` if MAD ≥ the metric minimum; otherwise `z = (x − mean)/SD` if SD ≥ the minimum; otherwise none ("not reliably standardised"). Nothing ever divides by zero.
- Day-over-day `x_t − x_{t−1}`. Week-over-week `mean[t−6,t] − mean[t−13,t−7]`, each week needing ≥ 4 valid days.
- Numbers are rounded once, and the rules use the rounded values. A change exactly at the threshold fires.

### 3.4 Candidate rules ([`candidates.py`](backend/app/candidates.py))

| Rule | Condition | Notes |
|---|---|---|
| `deviation.<metric>.v1` ([L134](backend/app/candidates.py#L134)) | \|Δ\| ≥ threshold vs. the baseline median: steps 25% *and* ≥ 1,000 · sleep 1 h · RHR 5 bpm · HRV 15% *and* ≥ 3 ms | percent rules need a median > 0 |
| suspicious spike ([L117](backend/app/candidates.py#L117)) | \|score\| ≥ 5, both neighbouring days within the threshold, persistence 1 | kept, but qualified: low confidence + "may be a measurement artefact" (D16) |
| `trend` / `improving_trend` ([L178](backend/app/candidates.py#L178)) | median `[t−6,t]` (≥ 4 valid) vs. the median of `[t−34,t−7]` (≥ 14 valid) crosses the threshold, and ≥ 5 of 7 recent days lie on the same side by ≥ half the threshold | improving when the gap to the goal shrinks by ≥ the threshold (D14) |
| `combined.<m1>+<m2>.v1` ([L235](backend/app/candidates.py#L235)) | same-day deviations in a PRD pair: sleep↓ + RHR↑, HRV↓ + RHR↑, steps↓ + sleep↓ | evidence for both metrics; worded as "co-occurred", never causal; spikes are never paired |
| `data_quality.v1` ([L270](backend/app/candidates.py#L270)) | a target value that is missing, invalid, out of range, conflicting or low quality, or an insufficient baseline | shown as "Missing-data warning"; one per day |

### 3.5 Ranking ([`ranking.py:62`](backend/app/ranking.py#L62), [`:90`](backend/app/ranking.py#L90))
All components are in [0, 1]:

```
score = 0.40·magnitude + 0.20·persistence + 0.15·reliability + 0.15·relevance + 0.10·novelty
  magnitude   = min(|Δ| / threshold, 3) / 3         (combined: mean over its metrics)
  persistence = min(consecutive days beyond threshold, 7) / 7   (trend: same-side days)
  reliability = baseline coverage × 0.5 if not standardised / spike / target flagged
  relevance   = 1.0 if the target day itself crosses the threshold, else 0.5
  novelty     = 0.3 if the same (category, metrics, direction) was surfaced in the previous 3 days, else 1.0
data_quality: fixed 0.15
```
Ties break by score ↓, then category priority (combined > deviation > improving_trend > trend > data_quality), then metric order, then `rule_id` ↑. Selection is greedy down the sorted list: a candidate is `suppressed_redundant` if one of its metrics is already covered, and `below_limit` after three are selected. Zero selected is a valid result.

### 3.6 Confidence ([`evidence.py:130`](backend/app/evidence.py#L130))
- **low:** a data-quality insight, coverage < 0.6, a flagged or conflicting target value, or a spike.
- **high:** coverage ≥ 0.85, reliably standardised, persistence ≥ 2 days.
- **medium:** everything else.

## 4. Code walkthrough: how an insight is selected

`POST /users/{id}/insights/generate` → [`pipeline.generate_run`](backend/app/pipeline.py#L85) runs PRD §10 in order:

1. **Idempotency.** Return the existing non-stale run for (user, date, rule version) unless `force` is set ([`current_run`](backend/app/pipeline.py#L49)).
2. **Load and validate.** Readings from 89 days before the target through the day after it (the spike check looks at t+1) → [`build_observations`](backend/app/observations.py#L114).
3. **Baselines and deviations.** [`compare_to_baseline`](backend/app/baselines.py#L214) for each metric.
4. **Candidates.** [`generate_candidates`](backend/app/candidates.py#L312) runs deviation, trend, combined and data-quality rules. Every candidate carries its `rule_id`, magnitude ratios, persistence, qualifiers and limitations.
5. **Rank and select.** [`rank_candidates`](backend/app/ranking.py#L90), with novelty taken from insights surfaced in the previous 3 days ([`previously_surfaced`](backend/app/pipeline.py#L62)).
6. **Evidence.** [`build_evidence`](backend/app/evidence.py#L53) writes one record per metric with every PRD §8 field: observed value and unit, baseline value and method, window, valid count, absolute/percentage difference, standardised score, rule id and threshold, supporting dates and values, and flags.
7. **Explain** (§5), then **persist** the run (every candidate with its score breakdown and status, the provider, the fallback reason and the tool calls), the insights, and the evidence, which is stored apart from the explanation.

Every number the UI shows comes from these stored records. The frontend only formats them (`format.ts`).

## 5. Code walkthrough: grounding the LLM response

[`explanations.explain_insights`](backend/app/explanations.py#L454):

1. **Minimal payload** ([`build_payload`](backend/app/explanations.py#L243)): only the *selected* insights, each with its category, metrics, direction, interpretation, persistence, goal, qualifiers, limitations and evidence records. There's no user id, name or profile. A target-day note, if any, goes in a separate `untrusted_user_note` field.
2. **System prompt:** evidence is the only source of numbers; do not add, reorder or rescore; drop instead of guessing; verify with at least one tool; co-occurrence, not causation; no diagnosis, treatment or risk; notes are data, not instructions; return JSON only.
3. **Tool loop** ([`_converse`](backend/app/explanations.py#L442), [`ToolRunner`](backend/app/explanations.py#L412)). Gemini's function calls are executed in Python against **the current user's observations only**, with dates clamped to ≤ the target date and ≤ 90 days. There are at most 4 rounds. Unknown tools or bad arguments return `{"error": …}`. Every call is logged on the run.
   - `get_metric_history(metric, start, end)`: daily values and flags.
   - `calculate_personal_baseline(metric)`: the same `compute_baseline` the rules use.
   - `check_data_completeness(start, end)`: valid, missing and flagged days per metric.
4. **Validation** ([`validate_batch`](backend/app/explanations.py#L375), [`check_explanation`](backend/app/explanations.py#L341)):
   - Pydantic schema (`ExplanationBatch`), after stripping code fences.
   - `insight_id` must be one of the selected insights. New insights are rejected.
   - `evidence_ids` must be a non-empty subset of that insight's evidence.
   - **Numeric claims:** every number in every text field must match an allowed value within 1% (or 0.05). Allowed values are that insight's evidence numbers and date parts, its limitations and goal, numbers from tool results in this request, small day counts (0–7), and the window constants 14 and 28. **Note numbers are never allowed.**
   - **Wording:** diagnosis, treatment/medication/supplement, risk, and causal phrases ("caused by", "led to", …) are rejected. Explicit disclaimers ("not a diagnosis") are allowed.
5. **One correction retry** that names the exact problems and asks only for the failed insights. Explanations that already passed are kept.
6. **Fallback:** anything still failing gets [`fallback_explanation`](backend/app/evidence.py#L178), built only from evidence values. No key, an SDK error, a timeout or a quota error means fallback for everything not yet accepted, with `fallback_reason` = `no_api_key` / `provider_error` / `invalid_response` / `validation_failed`. Provider error messages are logged by type only and never returned to clients. Transient 429/5xx errors are retried by the SDK first (3 attempts).

The confidence label is attached afterwards by code, so the model cannot raise or lower it.

## 6. Acceptance-test results

All suites run without a Gemini key. Gemini is replaced by scripted fakes ([`tests/fakes.py`](backend/tests/fakes.py)).

| Suite | Count | Result |
|---|---|---|
| `backend/tests/unit` (simulation 21, observations 13, baselines 14, candidates 42, ranking 10, evidence 10, tools 5, explanations 27) | 142 | ✅ pass |
| `backend/tests/integration` (data API 18, analytics API 31) | 49 | ✅ pass |
| `frontend/src/**/*.test.ts(x)` (client 4, ui 4, contrast 9, components 49, data editor 16, App 18) | 100 | ✅ pass |
| `frontend/e2e` (Playwright, real backend + UI) | 10 | ✅ pass, repeated runs |

### PRD §15 checklist

| Criterion | Evidence (test) | ✓ |
|---|---|---|
| Fixed seeds reproduce observations | `test_same_seed_gives_identical_data`, `test_generate_replaces_data_and_is_reproducible` | ✅ |
| Target day excluded from its baseline | `test_target_day_is_excluded_from_its_own_baseline`, `test_deviation_evidence_matches_the_calculation` | ✅ |
| Missing values excluded | `test_missing_values_are_excluded` | ✅ |
| Insufficient history represented | `test_insufficient_history_is_explicit_and_invents_nothing`, `test_baselines_report_insufficient_history`, e2e "missing data shows insufficient history" | ✅ |
| Zero baselines don't divide | `test_zero_baseline_has_no_percentage_and_no_division_error`, `test_zero_baseline_never_fires_a_percent_rule` | ✅ |
| Zero MAD handled safely | `test_zero_mad_and_zero_std_give_no_score_without_dividing`, `test_zero_mad_falls_back_to_sd_score` | ✅ |
| Invalid units / out-of-range flagged | `test_invalid_unit_is_never_used_or_converted`, `test_out_of_range_values_are_flagged`, `test_user_d_observations_show_quality_flags` | ✅ |
| Stable data → no forced anomalies | `test_stable_scenario_forces_no_anomalies` (all 4 users), `test_stable_data_gives_an_empty_feed`, e2e "stable data shows an empty feed" | ✅ |
| Each scenario → expected candidate | `test_each_scenario_produces_its_expected_candidate`, `test_missing_data_scenario_produces_a_missing_data_warning` | ✅ |
| Ranking deterministic | `test_ranking_is_deterministic_and_independent_of_input_order`, `test_ties_break_by_category_priority_then_metric_then_rule_id` | ✅ |
| Duplicates suppressed | `test_redundant_candidates_for_the_same_metric_are_suppressed`, `test_no_metric_appears_in_two_selected_insights` | ✅ |
| Top-3 enforced | `test_top_three_limit_is_enforced` | ✅ |
| Selected insights reference valid evidence | `test_every_selected_insight_in_every_scenario_has_valid_evidence`, `test_generate_in_fallback_mode_returns_evidence_backed_insights` | ✅ |
| Combined insights cover all metrics | `test_combined_sleep_and_rhr_references_both_metrics`, `test_combined_evidence_covers_every_metric` | ✅ |
| Provider mocked | `tests/fakes.py`; no test reads `backend/.env` | ✅ |
| Invalid JSON → validation + fallback | `test_invalid_json_twice_falls_back`, `test_invalid_json_then_valid_retry_is_accepted` | ✅ |
| Unsupported numbers rejected | `test_unsupported_number_is_rejected_and_falls_back`, `test_same_number_without_the_tool_call_is_rejected` | ✅ |
| LLM failure doesn't break the pipeline | `test_provider_failure_falls_back_for_everything`, `test_provider_error_never_reaches_the_client` | ✅ |
| Every displayed insight has evidence ids | `test_generate_in_fallback_mode_returns_evidence_backed_insights` | ✅ |
| Works without a Gemini key | `test_no_api_key_uses_fallback_without_calling_anything`, the whole e2e suite | ✅ |
| All endpoints: valid + invalid inputs | `test_*_invalid_inputs` for observations, generate, notes, baselines, insights, feedback, corrections | ✅ |
| Frontend values match the backend | Vitest `shows exactly the backend values`; e2e "metric values equal to the API", "insights match the API feed and their evidence" | ✅ |
| Empty and error states render | Vitest `shows the empty state…`, `shows API errors with a retry`, `shows an error state when the API is down` | ✅ |
| Scenario selection refreshes data | Vitest `applying a scenario regenerates data…`; e2e "scenario selection regenerates data" | ✅ |
| Evidence panels show backend evidence | Vitest `'Why am I seeing this?' reveals the backend evidence`; e2e evidence check | ✅ |

### Part B checklist

| Requirement | Where | ✓ |
|---|---|---|
| ≥ 21 days for ≥ 2 users; value, unit, available flag, quality marker | 4 users × 120 days; `readings` table (D5) | ✅ |
| Profile with an activity goal and a sleep target | `users.activity_goal_steps`, `sleep_target_hours` | ✅ |
| Rolling baselines, day-over-day / week-over-week in code | `compare_to_baseline`; `test_day_over_day_and_week_over_week` | ✅ |
| Improving trend, notable deviation, missing-data warning | `trend_candidate`, `deviation_candidate`, `data_quality_candidate`; `test_steps_rising_towards_goal_is_improving` | ✅ |
| Stated minimum before a trend; no incompatible units | ≥ 4 recent + ≥ 14 baseline days (`test_trend_windows_and_minimums`); units never converted | ✅ |
| LLM + the three tools | `GeminiChat` + `tools.py`; `test_tool_results_ground_new_numbers_and_are_logged`; live run §7 | ✅ |
| No invented values, percentages or correlations | numeric claim check + forbidden-wording check; `test_unsafe_wording_is_rejected` | ✅ |
| Each insight names its metric, dates, numbers and comparison | evidence record + `what_changed` | ✅ |
| ≤ 3 ranked insights; headline, explanation, evidence, confidence | feed endpoint + `InsightCard` | ✅ |
| "Why am I seeing this?" shows the data and the rule | `EvidencePanel`; Vitest + e2e | ✅ |
| Dismiss / irrelevant, retained | `test_feedback_hides_the_insight_and_is_kept`; e2e dismiss | ✅ |
| Correction recomputes; outdated insight not shown | `test_correction_recomputes_and_removes_the_outdated_insight`, `test_correction_marks_later_affected_runs_stale`, batch editor `test_batch_saves_all_edits_marks_stale_and_does_not_regenerate`, `test_recalculating_an_outdated_day_returns_the_new_run`; e2e correction + "editing the table marks insights outdated" | ✅ |
| Gaps, a one-day spike, conflicting values | User D; `test_spike_is_qualified_and_conflict_gives_a_warning` | ✅ |
| Suppress or qualify low-coverage or inconsistent evidence | confidence rules; conflicts → warning; spike qualified | ✅ |
| Consistent dates and timezones | user-local dates, `today` from the backend; `test_local_today_uses_the_users_timezone` | ✅ |
| Informational only; no diagnosis, treatment or risk | prompt + validator + templates | ✅ |
| Untrusted note that tries to fabricate an insight | `test_injection_note_creates_no_insight_and_no_numbers` (unit + API); e2e injection test; live run | ✅ |
| ≥ 4 test cases: calculations, missing data, corrections, unsupported claims | all four covered (see the PRD table above) | ✅ |

### PRD definition of done
1. Documented start commands ✅ (README) · 2. Four distinct users ✅ · 3. ≥ 90 days ✅ (120) · 4. Reproducible baselines ✅ · 5. Candidates and ranking independent of the LLM ✅ · 6. Traceable evidence ✅ · 7. Gemini works when configured ✅ (§7) · 8. Fallback without Gemini ✅ · 9. Dashboard shows live backend data ✅ · 10. Automated tests pass ✅ · 11. README covers architecture, algorithms, configuration, limitations and scenarios ✅

## 6b. Dashboard and data editor

The UI is a light, production-style dashboard built to `design.md` with shadcn/ui primitives (D35–D37): a sidebar with a mobile drawer, a top bar, metric cards with sparklines and goal progress, a trends section, a prominent insight feed with an evidence drawer, and a correction dialog. It's accessible: AA-contrast tokens, icons with text for status, Radix focus management for dialogs and drawers, keyboard navigation in the editor, and no motion under `prefers-reduced-motion`. Goal-ring progress is computed by the backend (D31). The **Edit data** tab lets a reviewer change any of the last 28 days. Saving is all or nothing (`/corrections/batch`, D29) and marks every affected run stale; the feed then answers `insights_outdated` (D30) and offers **Recalculate insights**, so an outdated insight is never shown (Part B §5).

## 7. Live Gemini verification

With a real key (`gemini-3.5-flash`), User D (`lower_hrv`, including the injection note) produced:

- tool call `check_data_completeness(start=2026-06-24, end=2026-06-30)`;
- explanation: *"Your 7-day median heart rate variability (HRV) was 41.8 ms, which is lower than your 28-day personal baseline of 49.9 ms."* Every number matches the evidence; it passed validation and was stored with `explanation_provider: gemini`;
- no "40%" anywhere and no extra insight: the injection note was ignored.

User B (`reduced_sleep`) via the UI: three Gemini-explained insights, each with its numbers traceable to the evidence and context worded as co-occurrence. Two other live runs hit `503 UNAVAILABLE` from Google. They fell back cleanly to templates (`fallback_reason: provider_error`) with nothing leaked. That's why the transport retry was added.

## 8. Limitations and future work

- **Synthetic, illustrative.** Thresholds are not clinically validated. Real wearable data would need device-specific quality handling, and calibration of thresholds against real variability.
- **Simple statistics by design.** Medians and MAD, with no seasonality or change-point models. The trend rule is a window comparison, not a significance test. Novelty only looks back 3 days.
- **The claim check is numeric, not semantic.** It stops invented numbers and banned wording, but a vague or slightly off sentence with allowed numbers would pass. A next step would be per-sentence attribution to specific evidence fields.
- **LLM latency and availability.** 15–35 s per generation, with occasional 503s. A production version would generate in the background and show the template immediately.
- **The demo doesn't show combined insights,** because each scenario changes one metric. They're covered by tests; a two-metric scenario would make them visible.
- **Single-user local app.** One SQLite file with no authentication. Not suitable for real health data.
