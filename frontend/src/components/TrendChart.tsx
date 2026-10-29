import { Info, Table2 } from "lucide-react";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltipBox,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { METRICS, type Metric, type MetricBaseline, type Observation } from "../api/types";
import { describeFlag, formatValue, METRIC_INFO } from "../format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "./StateViews";

interface Props {
  observations: Observation[]; // the 28 days ending at the selected date
  baselines: MetricBaseline[];
  active?: boolean; // false while the overview is hidden: a 0x0 container can't be measured, so nothing is drawn
}

interface Point {
  date: string;
  value: number | null;
  flags: string[];
}

const RANGES = [7, 28] as const;
const TICK = { fontSize: 12, fill: "var(--color-muted-foreground)" };
const BASELINE_HELP =
  "Your personal baseline is calculated from your historical wearable data. Comparisons depend on the amount and quality of available data.";

/** Historical values for one metric against the personal baseline (design.md §7). Values come from the API. */
export function TrendChart({ observations, baselines, active = true }: Props) {
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
  const { label, accent, unit } = METRIC_INFO[metric];

  return (
    <Card aria-labelledby="trend-title" className="flex flex-col gap-4 p-5">
      <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <h2 id="trend-title" className="text-lg font-semibold tracking-tight">
              {label}, last {range} days
            </h2>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label="About personal baselines">
                    <Info aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{BASELINE_HELP}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TabsList aria-label="Metric">
              {METRICS.map((m) => (
                <TabsTrigger key={m} value={m}>
                  {METRIC_INFO[m].label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div role="group" aria-label="Range" className="inline-flex h-9 items-center rounded-lg bg-secondary p-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={r === range}
                  aria-label={`${r} days`}
                  onClick={() => setRange(r)}
                  className={`h-full rounded-md px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    r === range ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r}d
                </button>
              ))}
            </div>
          </div>
        </div>

        {METRICS.map((m) => (
          <TabsContent key={m} value={m} className="lp-fade-in">
            {m === metric &&
              (points.length === 0 ? (
                <EmptyState title="No observations in this range" />
              ) : !active ? (
                <div className="h-72 w-full" />
              ) : (
                <div className="h-72 w-full" aria-hidden={showTable}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={points} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
                      <CartesianGrid stroke="var(--color-grid)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d: string) => d.slice(5)}
                        tick={TICK}
                        tickLine={false}
                        axisLine={{ stroke: "var(--color-border)" }}
                        minTickGap={20}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tick={TICK}
                        tickLine={false}
                        axisLine={false}
                        width={60}
                        tickFormatter={(v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 })}
                        label={{ value: unit, angle: -90, position: "insideLeft", offset: 4, style: { fontSize: 12, fill: "var(--color-muted-foreground)" } }}
                      />
                      <ChartTooltipBox content={<ChartTooltip metric={metric} />} cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }} />
                      {median !== null && (
                        <ReferenceLine
                          y={median}
                          stroke="var(--color-baseline)"
                          strokeDasharray="5 4"
                          label={{ value: "Personal baseline", position: "insideTopRight", fontSize: 12, fill: "var(--color-muted-foreground)" }}
                        />
                      )}
                      <Line
                        type="linear"
                        dataKey="value"
                        stroke={accent}
                        strokeWidth={2}
                        connectNulls={false}
                        dot={{ r: 2.5, fill: accent, stroke: "var(--color-card)", strokeWidth: 1.5 }}
                        activeDot={{ r: 5, fill: accent, stroke: "var(--color-card)", strokeWidth: 2 }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
          </TabsContent>
        ))}
      </Tabs>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          {median !== null
            ? `Personal baseline: ${formatValue(metric, median)} (median of the ${baseline?.window_days} days before the selected date).`
            : "No baseline line: not enough valid history for this metric."}
          {missing > 0 && ` Gaps: ${missing} day(s) without a valid value.`}
        </p>
        <Button variant="outline" size="sm" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>
          <Table2 aria-hidden />
          {showTable ? "Hide table" : "Show as table"}
        </Button>
      </div>

      {showTable && (
        <div className="max-h-72 overflow-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{label} by date</caption>
            <thead className="sticky top-0 bg-secondary text-xs text-muted-foreground">
              <tr><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">{label}</th><th className="px-3 py-2 font-medium">Flags</th></tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date} className="border-t border-border">
                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{p.date}</td>
                  <td className="px-3 py-1.5 tabular-nums">{formatValue(metric, p.value)}</td>
                  <td className="px-3 py-1.5 text-warning-foreground">{p.flags.map(describeFlag).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ChartTooltip({ active, payload, metric }: TooltipProps<number, string> & { metric: Metric }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as Point;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground">{point.date}</p>
      <p className="text-sm font-semibold tabular-nums">{formatValue(metric, point.value)}</p>
      {point.flags.map((f) => <p key={f} className="text-warning-foreground">{describeFlag(f)}</p>)}
    </div>
  );
}

/** Chart-shaped placeholder while observations load. */
export function TrendChartSkeleton() {
  return (
    <Card data-testid="chart-skeleton" className="flex flex-col gap-4 p-5">
      <div className="flex justify-between gap-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-9 w-80 max-w-[50%]" />
      </div>
      <Skeleton className="h-72 w-full" />
    </Card>
  );
}
