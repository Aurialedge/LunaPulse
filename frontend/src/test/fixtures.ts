import type {
  BaselinesResponse,
  EvidenceRecord,
  Feed,
  Health,
  Insight,
  MetricBaseline,
  ObservationsResponse,
  Scenario,
  User,
} from "../api/types";

export const health: Health = { status: "ok", db: "ok", llm_mode: "fallback", rule_version: "v1" };

export const userA: User = {
  user_id: "user_a",
  display_name: "User A",
  profile_description: "Consistently active.",
  activity_goal_steps: 10000,
  sleep_target_hours: 7.5,
  timezone: "America/New_York",
  today: "2026-06-30",
  scenario: "reduced_sleep",
  seed: 42,
  data_start: "2026-03-03",
  data_end: "2026-06-30",
};

export const userB: User = { ...userA, user_id: "user_b", display_name: "User B", profile_description: "Irregular." };

export const scenarios: Scenario[] = [
  { name: "stable_baseline", description: "No anomaly.", affected_metrics: ["steps"], days_affected: 7 },
  { name: "reduced_sleep", description: "Shorter sleep.", affected_metrics: ["sleep_hours"], days_affected: 5 },
];

function baseline(overrides: Partial<MetricBaseline>): MetricBaseline {
  return {
    metric: "steps",
    label: "Steps",
    unit: "steps",
    observed_value: 10658,
    target_flags: [],
    status: "ok",
    valid_observation_count: 28,
    window_days: 28,
    window_start: "2026-06-02",
    window_end: "2026-06-29",
    mean: 10400.5,
    median: 10405,
    std: 900.12,
    mad: 400,
    latest_value: 10500,
    latest_date: "2026-06-29",
    absolute_difference: 253,
    percentage_difference: 2.4,
    standardized_score: 0.43,
    score_method: "robust_z",
    direction: "above",
    interpretation: "more activity than usual",
    day_over_day: 120,
    week_over_week: -40.5,
    goal_value: null,
    goal_progress_percent: null,
    ...overrides,
  };
}

export const baselines: BaselinesResponse = {
  user_id: "user_a",
  date: "2026-06-30",
  metrics: [
    baseline({ goal_value: 10000, goal_progress_percent: 100 }),
    baseline({
      metric: "sleep_hours", label: "Sleep", unit: "hours", observed_value: 5.17, median: 6.59,
      goal_value: 7.5, goal_progress_percent: 68.9,
      absolute_difference: -1.42, percentage_difference: -21.5, direction: "below", interpretation: "shorter sleep duration",
    }),
    baseline({
      metric: "resting_heart_rate_bpm", label: "Resting heart rate", unit: "bpm", observed_value: 63, median: 65,
      absolute_difference: -2, percentage_difference: -3.1, direction: "below", interpretation: "lower relative to the user's history",
      target_flags: ["quality_marker:resting_heart_rate_bpm"],
    }),
    baseline({
      metric: "hrv_ms", label: "HRV", unit: "ms", observed_value: 42.2, status: "insufficient", valid_observation_count: 12,
      mean: null, median: null, std: null, mad: null, absolute_difference: null, percentage_difference: null,
      standardized_score: null, score_method: null, direction: "none", interpretation: "not enough history for a personal baseline",
    }),
  ],
};

export const observations: ObservationsResponse = {
  user_id: "user_a",
  start: "2026-06-03",
  end: "2026-06-30",
  observations: Array.from({ length: 28 }, (_, i) => ({
    user_id: "user_a",
    date: `2026-06-${String(i + 3).padStart(2, "0")}`,
    steps: i === 27 ? 10658 : i === 20 ? null : 10000 + i * 10,
    sleep_hours: 7.5,
    resting_heart_rate_bpm: 56,
    hrv_ms: 68,
    data_quality_flags: i === 20 ? ["missing:steps"] : [],
  })),
};

export const insight: Insight = {
  insight_id: "ins_1",
  run_id: "run_1",
  user_id: "user_a",
  target_date: "2026-06-30",
  rank: 1,
  category: "deviation",
  metrics: ["sleep_hours"],
  direction: "below",
  rule_id: "deviation.sleep_hours.v1",
  score: 0.6697,
  score_components: { magnitude: 0.4733, persistence: 0.4286, reliability: 0.9643, relevance: 1, novelty: 1 },
  confidence_label: "high",
  explanation: {
    insight_id: "ins_1",
    title: "Sleep: shorter sleep duration",
    summary: "Sleep was 5.17 hours on 2026-06-30, compared with your usual 6.59 hours.",
    what_changed: "That is 1.42 hours below the personal baseline (21.5%).",
    why_it_matters: "Selected because the change crossed the rule threshold.",
    evidence_ids: ["ins_1-ev1"],
    possible_context: "Everyday factors can change sleep; not a diagnosis.",
    limitations: ["Sleep: 27 of 28 baseline days had valid data."],
    suggested_reflection: "Does anything about this day stand out to you?",
  },
  explanation_provider: "fallback",
  evidence_ids: ["ins_1-ev1"],
  feedback: null,
  is_stale: false,
};

export const feed: Feed = {
  run_id: "run_1",
  user_id: "user_a",
  target_date: "2026-06-30",
  rule_version: "v1",
  generated_at: "2026-06-30T12:00:00Z",
  provider: "fallback",
  fallback_reason: "no_api_key",
  insights: [insight],
  hidden_count: 0,
  candidates: [
    { candidate_id: "deviation:sleep_hours", category: "deviation", metrics: ["sleep_hours"], direction: "below",
      rule_id: "deviation.sleep_hours.v1", score: 0.6697, status: "selected", rank: 1, insight_id: "ins_1", drop_reason: null },
    { candidate_id: "trend:sleep_hours", category: "trend", metrics: ["sleep_hours"], direction: "below",
      rule_id: "trend.sleep_hours.v1", score: 0.6, status: "suppressed_redundant", rank: null, insight_id: null, drop_reason: null },
  ],
};

export const evidence: EvidenceRecord[] = [
  {
    evidence_id: "ins_1-ev1",
    insight_id: "ins_1",
    user_id: "user_a",
    metric: "sleep_hours",
    target_date: "2026-06-30",
    comparison: "target_day_vs_baseline",
    observed_value: 5.17,
    observed_unit: "hours",
    baseline_value: 6.59,
    baseline_method: "median of valid days 2026-06-02 to 2026-06-29 (target day excluded)",
    baseline_window_start: "2026-06-02",
    baseline_window_end: "2026-06-29",
    valid_observation_count: 27,
    absolute_difference: -1.42,
    percentage_difference: -21.5,
    standardized_score: -1.88,
    score_method: "robust_z",
    direction: "below",
    rule_id: "deviation.sleep_hours.v1",
    rule_threshold: "|change| >= 1 hour from the baseline median",
    supporting_observation_dates: ["2026-06-29", "2026-06-30"],
    supporting_observation_values: [4.31, 5.17],
    data_quality_flags: [],
  },
];
