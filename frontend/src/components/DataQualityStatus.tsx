import { CheckCircle2, Info } from "lucide-react";
import type { MetricBaseline } from "../api/types";
import { describeFlag } from "../format";
import { cn } from "@/lib/utils";

/** The day's data: which metrics were recorded, flagged, or lack history (all from the backend). Calm, not alarming. */
export function DataQualityStatus({ metrics, date }: { metrics: MetricBaseline[]; date: string }) {
  const recorded = metrics.filter((m) => m.observed_value !== null).length;
  const issues = [
    ...metrics.flatMap((m) => m.target_flags.filter((f) => !f.startsWith("corrected:")).map(describeFlag)),
    ...metrics.filter((m) => m.status === "insufficient").map((m) => describeFlag(`insufficient_baseline:${m.metric}`)),
  ];
  const ok = issues.length === 0;
  const Icon = ok ? CheckCircle2 : Info;

  return (
    <section
      aria-label="Data quality"
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        ok ? "border-border bg-card" : "border-warning/30 bg-warning/5",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", ok ? "text-positive" : "text-warning")} aria-hidden />
      <div>
        <p className="font-medium">
          {date}: {recorded} of {metrics.length} metrics recorded · {ok ? "data quality OK" : "data-quality issues"}
        </p>
        {!ok && (
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-warning-foreground">
            {issues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
