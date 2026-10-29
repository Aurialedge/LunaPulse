// Display formatting only. These functions never calculate statistics: they print numbers the backend sent.
import type { Metric } from "./api/types";

/** `accent` is the metric's colour token from index.css. */
export const METRIC_INFO: Record<Metric, { label: string; unit: string; accent: string }> = {
  steps: { label: "Steps", unit: "steps", accent: "var(--color-steps)" },
  sleep_hours: { label: "Sleep", unit: "h", accent: "var(--color-sleep)" },
  resting_heart_rate_bpm: { label: "Resting heart rate", unit: "bpm", accent: "var(--color-rhr)" },
  hrv_ms: { label: "HRV", unit: "ms", accent: "var(--color-hrv)" },
};

const number = (value: number, maxDigits: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: maxDigits });

export function formatValue(metric: Metric, value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const digits = metric === "steps" ? 0 : 2;
  return `${number(value, digits)} ${METRIC_INFO[metric].unit}`;
}

export function formatSigned(metric: Metric, value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${formatValue(metric, Math.abs(value))}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${number(Math.abs(value), 1)}%`;
}

const FLAG_TEXT: Record<string, string> = {
  missing: "Missing",
  invalid_unit: "Wrong unit (not used)",
  out_of_range: "Implausible value (not used)",
  conflicting_values: "Conflicting readings",
  quality_marker: "Low-quality reading",
  corrected: "Corrected by you",
  insufficient_baseline: "Too little history",
};

/** "missing:hrv_ms" -> "HRV: Missing" */
export function describeFlag(flag: string): string {
  const [kind, metric] = flag.split(":");
  const label = METRIC_INFO[metric as Metric]?.label;
  const text = FLAG_TEXT[kind] ?? kind.replaceAll("_", " ");
  return label ? `${label}: ${text}` : text;
}

export const CATEGORY_TEXT: Record<string, string> = {
  deviation: "Notable deviation",
  trend: "7-day trend",
  improving_trend: "Improving trend",
  combined: "Changed together",
  data_quality: "Missing-data warning",
};

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
