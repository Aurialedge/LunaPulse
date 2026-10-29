import { api } from "../api/client";
import type { EvidenceRecord, Insight } from "../api/types";
import { useAsync } from "../hooks/useAsync";
import { describeFlag, formatPercent, formatSigned, formatValue, METRIC_INFO } from "../format";
import { ErrorState, LoadingState } from "./StateViews";

/** "Why am I seeing this?": the stored evidence records, the rule, and the ranking score — straight from the API. */
export function EvidencePanel({ insight }: { insight: Insight }) {
  const evidence = useAsync(() => api.evidence(insight.insight_id), [insight.insight_id]);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface/70 p-3 text-sm" data-testid="evidence-panel">
      {evidence.loading && <LoadingState label="Loading evidence…" />}
      {evidence.error && <ErrorState error={evidence.error} onRetry={evidence.reload} />}
      {evidence.data?.map((record) => <EvidenceTable key={record.evidence_id} record={record} />)}
      <div>
        <p className="eyebrow text-violet-200">Why it was ranked #{insight.rank}</p>
        <p className="text-ink-soft">
          Score {insight.score} ={" "}
          {Object.entries(insight.score_components)
            .map(([name, value]) => `${name} ${value}`)
            .join(" · ") || "fixed score for data-quality warnings"}
        </p>
        <p className="text-xs text-ink-muted">Rule {insight.rule_id} · computed in code, not by the language model.</p>
      </div>
    </div>
  );
}

function EvidenceTable({ record: r }: { record: EvidenceRecord }) {
  const label = METRIC_INFO[r.metric].label;
  const recent = r.comparison === "recent_7_day_median_vs_baseline";
  const rows: [string, string][] = [
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
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <caption className="pb-1 text-left font-medium">
          {label} evidence <span className="font-normal text-ink-muted">({r.evidence_id})</span>
        </caption>
        <tbody>
          {rows.map(([name, value]) => (
            <tr key={name} className="border-t border-line align-top">
              <th scope="row" className="w-44 py-1 pr-3 font-normal text-ink-muted">{name}</th>
              <td className="py-1 tabular-nums">{value}</td>
            </tr>
          ))}
          <tr className="border-t border-line align-top">
            <th scope="row" className="py-1 pr-3 font-normal text-ink-muted">Supporting days</th>
            <td className="py-1">
              <ul className="flex flex-wrap gap-1">
                {r.supporting_observation_dates.map((d, i) => (
                  <li key={d} className="chip border border-line bg-glass tabular-nums text-ink-soft">
                    {d.slice(5)}: {formatValue(r.metric, r.supporting_observation_values[i])}
                  </li>
                ))}
              </ul>
            </td>
          </tr>
          {r.data_quality_flags.length > 0 && (
            <tr className="border-t border-line align-top">
              <th scope="row" className="py-1 pr-3 font-normal text-ink-muted">Limitations</th>
              <td className="py-1 text-amber-200">{r.data_quality_flags.map(describeFlag).join(", ")}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
