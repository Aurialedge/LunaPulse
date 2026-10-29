// Mirrors backend/app/schemas.py. Every value shown in the UI comes from these responses.

export type Metric = "steps" | "sleep_hours" | "resting_heart_rate_bpm" | "hrv_ms";
export const METRICS: Metric[] = ["steps", "sleep_hours", "resting_heart_rate_bpm", "hrv_ms"];

export interface Health {
  status: string;
  db: string;
  llm_mode: "gemini" | "fallback";
  rule_version: string;
}

export interface User {
  user_id: string;
  display_name: string;
  profile_description: string;
  activity_goal_steps: number;
  sleep_target_hours: number;
  timezone: string;
  today: string;
  scenario: string;
  seed: number;
  data_start: string;
  data_end: string;
}

export interface Observation {
  user_id: string;
  date: string;
  steps: number | null;
  sleep_hours: number | null;
  resting_heart_rate_bpm: number | null;
  hrv_ms: number | null;
  data_quality_flags: string[];
}

export interface ObservationsResponse {
  user_id: string;
  start: string;
  end: string;
  observations: Observation[];
}

export interface Scenario {
  name: string;
  description: string;
  affected_metrics: Metric[];
  days_affected: number;
}

export interface GenerateSimulationResponse {
  user_id: string;
  scenario: string;
  seed: number;
  days: number;
  start_date: string;
  end_date: string;
  reading_count: number;
  note_count: number;
}

export interface Note {
  id: number;
  user_id: string;
  date: string;
  text: string;
  created_at: string;
}

export interface MetricBaseline {
  metric: Metric;
  label: string;
  unit: string;
  observed_value: number | null;
  target_flags: string[];
  status: "ok" | "insufficient";
  valid_observation_count: number;
  window_days: number;
  window_start: string;
  window_end: string;
  mean: number | null;
  median: number | null;
  std: number | null;
  mad: number | null;
  latest_value: number | null;
  latest_date: string | null;
  absolute_difference: number | null;
  percentage_difference: number | null;
  standardized_score: number | null;
  score_method: "robust_z" | "z" | null;
  direction: "above" | "below" | "none";
  interpretation: string;
  day_over_day: number | null;
  week_over_week: number | null;
  goal_value: number | null; // steps and sleep only
  goal_progress_percent: number | null; // computed by the backend, capped at 100
}

export interface BaselinesResponse {
  user_id: string;
  date: string;
  metrics: MetricBaseline[];
}

export interface Explanation {
  insight_id: string;
  title: string;
  summary: string;
  what_changed: string;
  why_it_matters: string;
  evidence_ids: string[];
  possible_context: string;
  limitations: string[];
  suggested_reflection: string;
}

export type Confidence = "high" | "medium" | "low";
export type FeedbackAction = "dismissed" | "irrelevant";

export interface Insight {
  insight_id: string;
  run_id: string;
  user_id: string;
  target_date: string;
  rank: number;
  category: "deviation" | "trend" | "improving_trend" | "combined" | "data_quality";
  metrics: Metric[];
  direction: string;
  rule_id: string;
  score: number;
  score_components: Record<string, number>;
  confidence_label: Confidence;
  explanation: Explanation;
  explanation_provider: "gemini" | "fallback";
  evidence_ids: string[];
  feedback: FeedbackAction | null;
  is_stale: boolean;
}

export interface Candidate {
  candidate_id: string;
  category: string;
  metrics: Metric[];
  direction: string;
  rule_id: string;
  score: number;
  status: "selected" | "suppressed_redundant" | "below_limit" | "dropped_by_llm";
  rank: number | null;
  insight_id: string | null;
  drop_reason: string | null;
}

export interface Feed {
  run_id: string;
  user_id: string;
  target_date: string;
  rule_version: string;
  generated_at: string;
  provider: "gemini" | "fallback" | "mixed" | "none";
  fallback_reason: string | null;
  insights: Insight[];
  hidden_count: number;
  candidates: Candidate[];
}

export interface EvidenceRecord {
  evidence_id: string;
  insight_id: string;
  user_id: string;
  metric: Metric;
  target_date: string;
  comparison: string;
  observed_value: number | null;
  observed_unit: string;
  baseline_value: number | null;
  baseline_method: string;
  baseline_window_start: string;
  baseline_window_end: string;
  valid_observation_count: number;
  absolute_difference: number | null;
  percentage_difference: number | null;
  standardized_score: number | null;
  score_method: string | null;
  direction: string;
  rule_id: string;
  rule_threshold: string;
  supporting_observation_dates: string[];
  supporting_observation_values: number[];
  data_quality_flags: string[];
}

export interface FeedbackResponse {
  id: number;
  insight_id: string;
  action: FeedbackAction;
  created_at: string;
}

export interface CorrectionResponse {
  user_id: string;
  date: string;
  metric: Metric;
  value: number;
  unit: string;
  stale_run_count: number;
  feed: Feed;
}
