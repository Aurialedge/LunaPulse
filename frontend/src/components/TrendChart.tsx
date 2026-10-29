import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { METRICS, type Metric, type MetricBaseline, type Observation } from "../api/types";
import { describeFlag, formatValue, METRIC_INFO } from "../format";
import { EmptyState } from "./StateViews";

interface Props {
  observations: Observation[]; // the 28 days ending at the selected date
  baselines: MetricBaseline[];
}

interface Point {
  date: string;
  value: number | null;
  flags: string[];
}

const RANGES = [7, 28] as const;
const TICK = { fontSize: 11, fill: "var(--color-ink-muted)" };

function pillClass(active: boolean): string {
  return `rounded-lg px-2.5 py-1 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-brand-soft ${
    active ? "bg-violet-500/25 text-violet-100 shadow-[0_0_12px_rgb(139_92_246/0.35)]" : "text-ink-muted hover:text-ink"
  }`;
}

export function TrendChart({ observations, baselines }: Props) {
  const [metric, setMetric] = useState<Metric>("steps");
  const [range, setRange] = useState<(typeof RANGES)[number]>(28);
  const [showTable, setShowTable] = useState(false);

  const points: Point[] = observations.slice(-range).map((o) => ({
    date: o.date,
    value: o[metric],
    flags: o.data_quality_flags.filter((f) => f.endsWith(`:${metric}`)),
  }));
  const baseline = baselines.find((b) => b.metric === metric);
  const median = baseline?.status === "ok" ? baseline.median : null;
  const missing = points.filter((p) => p.value === null).length;
  const { label, accent } = METRIC_INFO[metric];

  return (
    <section className="card flex flex-col gap-3" aria-labelledby="trend-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="trend-title" className="text-base font-semibold">
          {label}, last {range} days
        </h2>
        <div className="flex flex-wrap gap-2">
          <div role="group" aria-label="Metric" className="flex rounded-xl border border-line bg-surface-raised p-0.5">
            {METRICS.map((m) => (
              <button key={m} type="button" aria-pressed={m === metric} onClick={() => setMetric(m)} className={pillClass(m === metric)}>
                {METRIC_INFO[m].label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Range" className="flex rounded-xl border border-line bg-surface-raised p-0.5">
            {RANGES.map((r) => (
              <button key={r} type="button" aria-pressed={r === range} onClick={() => setRange(r)} className={pillClass(r === range)}>
                {r} d
              </button>
            ))}
          </div>
        </div>
      </div>

      {points.length === 0 ? (
        <EmptyState title="No observations in this range" />
      ) : (
        <>
          <div className="h-64 w-full" aria-hidden={showTable}>
            <ResponsiveContainer width="100%" height="100%">
              {/* key restarts the draw-in animation whenever the metric or range changes */}
              <ComposedChart key={`${metric}-${range}`} data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`lp-fill-${metric}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={accent} stopOpacity={0} />
                  </linearGradient>
                  <filter id="lp-glow" x="-20%" y="-50%" width="140%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid stroke="var(--color-grid)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={TICK}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-grid)" }}
                  minTickGap={16}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={TICK}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 })}
                />
                <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ stroke: "var(--color-ink-muted)", strokeWidth: 1 }} />
                {median !== null && (
                  <ReferenceLine
                    y={median}
                    stroke="var(--color-baseline)"
                    strokeDasharray="4 4"
                    label={{ value: "Baseline median", position: "insideTopRight", fontSize: 11, fill: "var(--color-ink-muted)" }}
                  />
                )}
                <Area
                  type="linear"
                  dataKey="value"
                  stroke="none"
                  fill={`url(#lp-fill-${metric})`}
                  connectNulls={false}
                  isAnimationActive={false}
                  className="lp-fade"
                  activeDot={false}
                />
                <Line
                  type="linear"
                  dataKey="value"
                  stroke={accent}
                  strokeWidth={2.5}
                  connectNulls={false}
                  className="lp-draw"
                  filter="url(#lp-glow)"
                  dot={{ r: 3, fill: accent, stroke: "var(--color-surface)", strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: accent, stroke: "var(--color-surface)", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-ink-muted">
            {median !== null
              ? `Dashed line: personal baseline median (${formatValue(metric, median)}, the ${baseline?.window_days} days before the selected date).`
              : "No baseline line: not enough valid history for this metric."}
            {missing > 0 && ` Gaps: ${missing} day(s) without a valid value.`}
          </p>
          <button type="button" className="btn-secondary self-start" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>
            {showTable ? "Hide table" : "Show as table"}
          </button>
          {showTable && (
            <div className="max-h-64 overflow-auto rounded-xl border border-line">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{label} by date</caption>
                <thead className="sticky top-0 bg-surface-raised text-xs text-ink-muted">
                  <tr><th className="px-3 py-1.5">Date</th><th className="px-3 py-1.5">{label}</th><th className="px-3 py-1.5">Flags</th></tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.date} className="border-t border-line">
                      <td className="px-3 py-1 tabular-nums text-ink-soft">{p.date}</td>
                      <td className="px-3 py-1 tabular-nums">{formatValue(metric, p.value)}</td>
                      <td className="px-3 py-1 text-amber-200">{p.flags.map(describeFlag).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ChartTooltip({ active, payload, metric }: TooltipProps<number, string> & { metric: Metric }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as Point;
  return (
    <div className="rounded-xl border border-line bg-surface-raised/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="font-medium text-ink-soft">{point.date}</p>
      <p className="text-sm font-semibold tabular-nums" style={{ color: METRIC_INFO[metric].accent }}>
        {formatValue(metric, point.value)}
      </p>
      {point.flags.map((f) => <p key={f} className="text-amber-200">{describeFlag(f)}</p>)}
    </div>
  );
}
