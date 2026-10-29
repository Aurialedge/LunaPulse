import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
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
  const { label } = METRIC_INFO[metric];

  return (
    <section className="card flex flex-col gap-3" aria-labelledby="trend-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="trend-title" className="text-base font-semibold">
          {label}, last {range} days
        </h2>
        <div className="flex flex-wrap gap-2">
          <div role="group" aria-label="Metric" className="flex rounded-lg border border-slate-300 p-0.5">
            {METRICS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={m === metric}
                onClick={() => setMetric(m)}
                className={`rounded-md px-2 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-blue-700 ${
                  m === metric ? "bg-blue-700 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {METRIC_INFO[m].label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Range" className="flex rounded-lg border border-slate-300 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={r === range}
                onClick={() => setRange(r)}
                className={`rounded-md px-2 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-blue-700 ${
                  r === range ? "bg-blue-700 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
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
              <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--color-grid)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fontSize: 11, fill: "#52514e" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-grid)" }}
                  minTickGap={16}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 11, fill: "#52514e" }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 })}
                />
                <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ stroke: "#9a9893", strokeWidth: 1 }} />
                {median !== null && (
                  <ReferenceLine
                    y={median}
                    stroke="var(--color-baseline)"
                    strokeDasharray="4 4"
                    label={{ value: "Baseline median", position: "insideTopRight", fontSize: 11, fill: "#52514e" }}
                  />
                )}
                <Line
                  type="linear"
                  dataKey="value"
                  stroke="var(--color-series)"
                  strokeWidth={2}
                  connectNulls={false}
                  dot={{ r: 3, fill: "var(--color-series)", stroke: "#fff", strokeWidth: 2 }}
                  activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-500">
            {median !== null
              ? `Dashed line: personal baseline median (${formatValue(metric, median)}, the ${baseline?.window_days} days before the selected date).`
              : "No baseline line: not enough valid history for this metric."}
            {missing > 0 && ` Gaps: ${missing} day(s) without a valid value.`}
          </p>
          <button type="button" className="btn-secondary self-start" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>
            {showTable ? "Hide table" : "Show as table"}
          </button>
          {showTable && (
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{label} by date</caption>
                <thead className="sticky top-0 bg-white text-xs text-slate-500">
                  <tr><th className="py-1 pr-4">Date</th><th className="py-1 pr-4">{label}</th><th className="py-1">Flags</th></tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.date} className="border-t border-slate-100">
                      <td className="py-1 pr-4 tabular-nums">{p.date}</td>
                      <td className="py-1 pr-4 tabular-nums">{formatValue(metric, p.value)}</td>
                      <td className="py-1 text-slate-600">{p.flags.map(describeFlag).join(", ")}</td>
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
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{point.date}</p>
      <p className="tabular-nums">{formatValue(metric, point.value)}</p>
      {point.flags.map((f) => <p key={f} className="text-amber-800">{describeFlag(f)}</p>)}
    </div>
  );
}
