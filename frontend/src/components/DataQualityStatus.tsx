import { CheckCircle2, TriangleAlert } from "lucide-react";
import type { MetricBaseline } from "../api/types";
import { describeFlag } from "../format";

/** Summary of the day's data: which metrics were recorded, flagged, or lack history (all from the backend). */
export function DataQualityStatus({ metrics, date }: { metrics: MetricBaseline[]; date: string }) {
  const recorded = metrics.filter((m) => m.observed_value !== null).length;
  const issues = [
    ...metrics.flatMap((m) => m.target_flags.filter((f) => !f.startsWith("corrected:")).map(describeFlag)),
    ...metrics.filter((m) => m.status === "insufficient").map((m) => describeFlag(`insufficient_baseline:${m.metric}`)),
  ];
  const ok = issues.length === 0;
  const Icon = ok ? CheckCircle2 : TriangleAlert;

  return (
    <section
      aria-label="Data quality"
      className={`card flex items-start gap-3 py-3 ${ok ? "" : "border-amber-400/30 bg-amber-400/10"}`}
    >
      <Icon className={`mt-0.5 size-5 shrink-0 ${ok ? "text-good" : "text-warn"}`} aria-hidden />
      <div className="text-sm">
        <p className="font-medium">
          {date}: {recorded} of {metrics.length} metrics recorded · {ok ? "data quality OK" : "data-quality issues"}
        </p>
        {!ok && (
          <ul className="mt-1 list-disc pl-5 text-amber-200">
            {issues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
