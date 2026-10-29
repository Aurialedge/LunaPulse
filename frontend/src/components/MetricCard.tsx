import { Activity, ArrowDownRight, ArrowUpRight, Check, Footprints, HeartPulse, Info, Minus, Moon, Pencil, TriangleAlert } from "lucide-react";
import type { Metric, MetricBaseline, Observation } from "../api/types";
import { describeFlag, formatPercent, formatSigned, formatValue, METRIC_INFO } from "../format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const ICONS: Record<Metric, typeof Activity> = {
  steps: Footprints,
  sleep_hours: Moon,
  resting_heart_rate_bpm: HeartPulse,
  hrv_ms: Activity,
};

const SPARK_W = 120;
const SPARK_H = 32;

/**
 * A tiny line of the real daily values. Missing days split the line instead of dropping to zero.
 * Placing points on the SVG is drawing, not statistics: every value comes from the observations response.
 */
function Sparkline({ metric, history }: { metric: Metric; history: Observation[] }) {
  const values = history.map((o) => o[metric]);
  const present = values.filter((v): v is number => v !== null);
  const low = Math.min(...present);
  const high = Math.max(...present);
  const x = (i: number) => (values.length > 1 ? (i / (values.length - 1)) * SPARK_W : SPARK_W / 2);
  const y = (v: number) => (high === low ? SPARK_H / 2 : SPARK_H - 2 - ((v - low) / (high - low)) * (SPARK_H - 4));

  const segments: string[][] = [[]];
  values.forEach((v, i) => {
    if (v === null) segments.push([]);
    else segments[segments.length - 1].push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  const lines = segments.filter((s) => s.length > 0);
  const last = values.length - 1;
  const { accent, label } = METRIC_INFO[metric];

  return (
    <svg
      role="img"
      aria-label={`${label} over the last ${values.length} days`}
      data-points={present.length}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className="h-8 w-full overflow-visible"
    >
      {lines.map((points, i) =>
        points.length === 1 ? (
          <circle key={i} cx={points[0].split(",")[0]} cy={points[0].split(",")[1]} r="1.5" fill={accent} />
        ) : (
          <polyline key={i} points={points.join(" ")} fill="none" stroke={accent} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        ),
      )}
      {values[last] !== null && values[last] !== undefined && (
        <circle cx={x(last)} cy={y(values[last] as number)} r="2.5" fill={accent} stroke="white" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

interface Props {
  baseline: MetricBaseline;
  onCorrect: () => void; // opens the correction dialog
  history?: Observation[]; // the 28-day observations response, for the sparkline
  highlighted?: boolean; // a current insight is about this metric (D33)
}

/** Today's value vs. the personal baseline. Every number comes from the backend. */
export function MetricCard({ baseline: b, onCorrect, history, highlighted = false }: Props) {
  const id = `metric-${b.metric}`;
  const { accent, label } = METRIC_INFO[b.metric];
  const Icon = ICONS[b.metric];
  const Arrow = b.direction === "above" ? ArrowUpRight : b.direction === "below" ? ArrowDownRight : Minus;

  return (
    <Card
      aria-labelledby={id}
      data-testid={id}
      data-highlighted={highlighted}
      className={cn("lp-enter flex flex-col gap-3 p-5 transition-shadow", highlighted && "border-primary/40 ring-1 ring-primary/20")}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={id} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="grid size-6 place-items-center rounded-md bg-secondary" aria-hidden>
            <Icon className="size-3.5" style={{ color: accent }} />
          </span>
          {b.label}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          onClick={onCorrect}
          aria-haspopup="dialog"
          aria-label={`Correct ${b.label} value`}
        >
          <Pencil aria-hidden />
        </Button>
      </div>

      <p data-testid={`${id}-value`} className={cn("tabular-nums tracking-tight", b.observed_value === null ? "text-base font-medium text-muted-foreground" : "text-[30px] leading-none font-semibold")}>
        {b.observed_value === null ? "No data recorded" : formatValue(b.metric, b.observed_value)}
      </p>

      {b.status === "insufficient" ? (
        <p className="flex items-start gap-1.5 text-[13px] text-muted-foreground" data-testid={`${id}-insufficient`}>
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-medium text-foreground">Insufficient history</span> for a personal baseline:{" "}
            {b.valid_observation_count} of {b.window_days} days valid.
          </span>
        </p>
      ) : (
        <div className="flex flex-col gap-1 text-[13px]">
          <p className="text-muted-foreground">
            Personal baseline{" "}
            <span className="font-medium text-foreground tabular-nums" data-testid={`${id}-baseline`}>{formatValue(b.metric, b.median)}</span>{" "}
            <span>(median, {b.valid_observation_count} of {b.window_days} days)</span>
          </p>
          {b.absolute_difference !== null ? (
            <>
              <p className="flex flex-wrap items-center gap-x-1.5" data-testid={`${id}-difference`}>
                <Arrow className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="font-medium whitespace-nowrap tabular-nums">{formatSigned(b.metric, b.absolute_difference)}</span>
                <span className="whitespace-nowrap text-muted-foreground tabular-nums">{formatPercent(b.percentage_difference)}</span>
                <span className="sr-only">compared with the baseline</span>
              </p>
              <p className="text-muted-foreground">{b.interpretation}</p>
            </>
          ) : (
            <p className="text-muted-foreground">{b.interpretation}</p>
          )}
        </div>
      )}

      {history && <Sparkline metric={b.metric} history={history} />}

      {b.goal_progress_percent !== null && b.goal_value !== null && (
        <div className="flex flex-col gap-1">
          <div
            role="progressbar"
            aria-label={`${label} goal progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={b.goal_progress_percent}
            className="h-1.5 overflow-hidden rounded-full bg-secondary"
          >
            <div className="h-full rounded-full" style={{ width: `${b.goal_progress_percent}%`, background: accent }} />
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {b.goal_progress_percent}% of {formatValue(b.metric, b.goal_value)} goal
          </p>
        </div>
      )}

      {b.target_flags.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label={`${b.label} data-quality flags`}>
          {b.target_flags.map((flag) => {
            const corrected = flag.startsWith("corrected:");
            return (
              <li key={flag}>
                <Badge variant={corrected ? "positive" : "warning"} className={corrected ? "" : "text-warning-foreground"}>
                  {corrected ? <Check aria-hidden /> : <TriangleAlert aria-hidden />}
                  {describeFlag(flag)}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}

    </Card>
  );
}

/** Placeholder with the card's shape while baselines load. */
export function MetricCardSkeleton() {
  return (
    <Card data-testid="metric-skeleton" className="flex flex-col gap-3 p-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-8 w-full" />
    </Card>
  );
}
