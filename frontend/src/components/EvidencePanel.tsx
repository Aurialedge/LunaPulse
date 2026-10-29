import { api } from "../api/client";
import type { EvidenceRecord, Insight } from "../api/types";
import { useAsync } from "../hooks/useAsync";
import { describeFlag, formatDate, formatPercent, formatSigned, formatValue, METRIC_INFO } from "../format";
import { ErrorState, LoadingState } from "./StateViews";

/** What each confidence label means. The label itself is computed by the backend (D9); this only explains it. */
const CONFIDENCE_TEXT = {
  high: "High confidence: good baseline coverage, a reliable standardised score, the change persisted for at least 2 days, and no data-quality flags on the day.",
  medium: "Medium confidence: the change is supported, but coverage, persistence or standardisation is weaker than for a high-confidence insight.",
  low: "Low confidence: thin coverage, a flagged or conflicting value, a possible one-day measurement artefact, or a data-quality warning.",
} as const;

/** "Why am I seeing this?": the stored evidence records, the rule and the ranking score, straight from the API. */
export function EvidencePanel({ insight }: { insight: Insight }) {
  const evidence = useAsync(() => api.evidence(insight.insight_id), [insight.insight_id]);

  return (
    <div className="flex flex-col gap-6 text-sm" data-testid="evidence-panel">
      {evidence.loading && <LoadingState label="Loading evidence…" />}
      {evidence.error && <ErrorState error={evidence.error} onRetry={evidence.reload} />}
      {evidence.data?.map((record) => <EvidenceRecordView key={record.evidence_id} record={record} />)}

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-background p-4">
        <h3 className="text-sm font-semibold">Why it was ranked #{insight.rank}</h3>
        <p className="text-muted-foreground">
          Score {insight.score} ={" "}
          {Object.entries(insight.score_components)
            .map(([name, value]) => `${name} ${value}`)
            .join(" · ") || "fixed score for data-quality warnings"}
        </p>
        <p className="text-muted-foreground">{CONFIDENCE_TEXT[insight.confidence_label]}</p>
        <p className="text-xs text-muted-foreground">
          Rule {insight.rule_id} · run {insight.run_id} · computed in code, not by the language model.
        </p>
      </section>
    </div>
  );
}

function EvidenceRecordView({ record: r }: { record: EvidenceRecord }) {
  const label = METRIC_INFO[r.metric].label;
  const recent = r.comparison === "recent_7_day_median_vs_baseline";
  const rows: [string, string][] = [
    ["Metric", label],
    [
      recent ? "Period" : "Target date",
      recent && r.supporting_observation_dates.length
        ? `${formatDate(r.supporting_observation_dates[0])} – ${formatDate(r.target_date)}`
        : formatDate(r.target_date),
    ],
    [recent ? "Recent 7-day median" : "This day's value", formatValue(r.metric, r.observed_value)],
    ["Personal baseline", formatValue(r.metric, r.baseline_value)],
    ["Difference", `${formatSigned(r.metric, r.absolute_difference)} ${formatPercent(r.percentage_difference)}`],
    [
      "Standardized score",
      recent
        ? "not used for 7-day trends"
        : r.standardized_score === null
          ? "not reliable (too little variation)"
          : `${r.standardized_score} (${r.score_method})`,
    ],
    ["Baseline window", `${r.baseline_window_start} to ${r.baseline_window_end} · ${r.valid_observation_count} valid days`],
    ["Method", r.baseline_method],
    ["Rule", `${r.rule_id}: ${r.rule_threshold}`],
  ];
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">
        {label} evidence <span className="font-normal text-muted-foreground">({r.evidence_id})</span>
      </h3>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left">
          <caption className="sr-only">{label} evidence</caption>
          <tbody>
            {rows.map(([name, value]) => (
              <tr key={name} className="border-b border-border align-top last:border-0">
                <th scope="row" className="w-40 bg-background px-3 py-2 font-normal text-muted-foreground">{name}</th>
                <td className="px-3 py-2 tabular-nums">{value}</td>
              </tr>
            ))}
            {r.data_quality_flags.length > 0 && (
              <tr className="align-top">
                <th scope="row" className="bg-background px-3 py-2 font-normal text-muted-foreground">Data-quality notes</th>
                <td className="px-3 py-2 text-warning-foreground">{r.data_quality_flags.map(describeFlag).join(", ")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">Historical observations used</p>
        <SupportingBars record={r} />
        <ul className="flex flex-wrap gap-1">
          {r.supporting_observation_dates.map((d, i) => (
            <li key={d} className="rounded-md border border-border px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
              {d.slice(5)}: {formatValue(r.metric, r.supporting_observation_values[i])}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const BAR_W = 28;
const BAR_GAP = 8;
const CHART_H = 72;

/** Bars of the observations the backend lists as evidence; the target day is highlighted. Drawing only. */
function SupportingBars({ record: r }: { record: EvidenceRecord }) {
  const values = r.supporting_observation_values;
  if (!values.length) return null;
  const high = Math.max(...values, r.baseline_value ?? 0);
  const width = values.length * (BAR_W + BAR_GAP);
  const h = (v: number) => (high > 0 ? Math.max(2, (v / high) * (CHART_H - 4)) : 2);
  const { accent } = METRIC_INFO[r.metric];

  return (
    <svg role="img" aria-label="Supporting observations" viewBox={`0 0 ${width} ${CHART_H + 16}`} className="h-24 w-full max-w-md">
      {values.map((v, i) => {
        const day = r.supporting_observation_dates[i];
        const target = day === r.target_date;
        const x = i * (BAR_W + BAR_GAP);
        return (
          <g key={day}>
            <rect
              data-date={day}
              data-target={target}
              x={x}
              y={CHART_H - h(v)}
              width={BAR_W}
              height={h(v)}
              rx="3"
              fill={accent}
              opacity={target ? 1 : 0.35}
            />
            <text x={x + BAR_W / 2} y={CHART_H + 12} textAnchor="middle" className="fill-muted-foreground text-[9px]">
              {day.slice(8)}
            </text>
          </g>
        );
      })}
      {r.baseline_value !== null && high > 0 && (
        <line
          x1="0"
          x2={width}
          y1={CHART_H - h(r.baseline_value)}
          y2={CHART_H - h(r.baseline_value)}
          stroke="var(--color-baseline)"
          strokeDasharray="4 3"
        />
      )}
    </svg>
  );
}
