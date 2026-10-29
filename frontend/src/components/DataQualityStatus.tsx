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
    <section aria-label="Data quality" className={`card flex items-start gap-3 ${ok ? "" : "border-amber-300 bg-amber-50"}`}>
      <Icon className={`mt-0.5 size-5 shrink-0 ${ok ? "text-green-700" : "text-amber-700"}`} aria-hidden />
      <div className="text-sm">
        <p className="font-medium">
          {date}: {recorded} of {metrics.length} metrics recorded · {ok ? "data quality OK" : "data-quality issues"}
        </p>
        {!ok && (
          <ul className="mt-1 list-disc pl-5 text-amber-900">
            {issues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
