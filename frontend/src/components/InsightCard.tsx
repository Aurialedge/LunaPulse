import { EyeOff, FileSearch, MoreHorizontal, Shield, ShieldAlert, ShieldCheck, ThumbsDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../api/client";
import type { EvidenceRecord, FeedbackAction, Insight } from "../api/types";
import { CATEGORY_TEXT, formatDate, formatPercent, formatSigned, formatValue, METRIC_INFO } from "../format";
import { useAsync } from "../hooks/useAsync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

/** Confidence comes from the backend (D9). Each label pairs an icon with the word, never colour alone. */
const CONFIDENCE = {
  high: { variant: "positive", Icon: ShieldCheck },
  medium: { variant: "secondary", Icon: Shield },
  low: { variant: "warning", Icon: ShieldAlert },
} as const;

const FEEDBACK_TOAST: Record<FeedbackAction, string> = {
  dismissed: "Insight dismissed",
  irrelevant: "Marked as not relevant",
};

interface Props {
  insight: Insight;
  onFeedback: (insightId: string, action: FeedbackAction) => Promise<void>;
  onOpenEvidence: (insight: Insight) => void; // opens the evidence drawer
  position?: number; // 1-based place in the visible feed
  total?: number;
}

export function InsightCard({ insight, onFeedback, onOpenEvidence, position, total }: Props) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const evidence = useAsync(() => api.evidence(insight.insight_id), [insight.insight_id]);
  const e = insight.explanation;
  const titleId = `insight-${insight.insight_id}`;
  const confidence = CONFIDENCE[insight.confidence_label];
  const accent = METRIC_INFO[insight.metrics[0]]?.accent ?? "var(--color-primary)";

  async function feedback(action: FeedbackAction) {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await onFeedback(insight.insight_id, action);
      toast.success(FEEDBACK_TOAST[action]); // only after the backend confirmed
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save feedback.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card role="article" aria-labelledby={titleId} data-testid="insight-card" className="lp-enter relative overflow-hidden p-5 pl-6">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} aria-hidden />

      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-muted-foreground">
            {position && total ? `Insight ${position} of ${total}` : `#${insight.rank}`} ·{" "}
            {CATEGORY_TEXT[insight.category] ?? insight.category}
          </span>
          <Badge variant="outline">{insight.metrics.map((m) => METRIC_INFO[m].label).join(" + ")}</Badge>
          <Badge
            variant={confidence.variant}
            title="Based on data coverage and reliability, not on the language model"
          >
            <confidence.Icon aria-hidden />
            {insight.confidence_label} confidence
          </Badge>
          <Badge variant="secondary">{insight.explanation_provider === "gemini" ? "Gemini" : "Template"}</Badge>
          {insight.feedback && <Badge variant="outline">Marked {insight.feedback}</Badge>}
        </div>
        {!insight.feedback && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-mt-1 -mr-2 size-8 text-muted-foreground" aria-label="Insight actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={sending} onSelect={() => feedback("dismissed")}>
                <EyeOff aria-hidden /> Dismiss
              </DropdownMenuItem>
              <DropdownMenuItem disabled={sending} onSelect={() => feedback("irrelevant")}>
                <ThumbsDown aria-hidden /> Not relevant
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <h3 id={titleId} className="mt-3 text-base font-semibold tracking-tight">{e.title}</h3>
      <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{e.summary}</p>

      <EvidenceSummary records={evidence.data} loading={evidence.loading} />

      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">What changed</dt>
          <dd className="mt-1">{e.what_changed}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Why it was selected</dt>
          <dd className="mt-1">{e.why_it_matters}</dd>
        </div>
        {e.possible_context && (
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Possible context (not a fact)</dt>
            <dd className="mt-1 text-muted-foreground">{e.possible_context}</dd>
          </div>
        )}
        {e.limitations.length > 0 && (
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Limitations</dt>
            <dd className="mt-1">
              <ul className="list-disc pl-4 text-muted-foreground">{e.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
            </dd>
          </div>
        )}
      </dl>
      {e.suggested_reflection && <p className="mt-3 text-sm text-muted-foreground italic">{e.suggested_reflection}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onOpenEvidence(insight)}>
          <FileSearch aria-hidden />
          Why am I seeing this?
        </Button>
        {error && <p role="alert" className="text-xs text-negative">{error}</p>}
      </div>
    </Card>
  );
}

/** Observed vs. comparison value per metric, straight from the evidence records. */
function EvidenceSummary({ records, loading }: { records: EvidenceRecord[] | null; loading: boolean }) {
  if (loading && !records) return <Skeleton className="mt-4 h-14 w-full" />;
  if (!records?.length) return null;
  return (
    <div data-testid="evidence-summary" className="mt-4 grid gap-2 rounded-lg border border-border bg-background p-3">
      {records.map((r) => {
        const trend = r.comparison === "recent_7_day_median_vs_baseline";
        const period = trend && r.supporting_observation_dates.length
          ? `${formatDate(r.supporting_observation_dates[0])} – ${formatDate(r.target_date)}`
          : formatDate(r.target_date);
        return (
          <dl key={r.evidence_id} className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">{trend ? `${METRIC_INFO[r.metric].label}, 7-day median` : METRIC_INFO[r.metric].label}</dt>
              <dd className="font-semibold tabular-nums">{formatValue(r.metric, r.observed_value)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Personal baseline</dt>
              <dd className="font-medium tabular-nums">{formatValue(r.metric, r.baseline_value)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Change</dt>
              <dd className="tabular-nums">
                {r.absolute_difference === null ? "—" : `${formatSigned(r.metric, r.absolute_difference)} ${formatPercent(r.percentage_difference)}`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{trend ? "Period" : "Date"}</dt>
              <dd>{period}</dd>
            </div>
          </dl>
        );
      })}
    </div>
  );
}

/** Insight-card-shaped placeholder while the feed loads. */
export function InsightCardSkeleton() {
  return (
    <Card data-testid="insight-skeleton" className="flex flex-col gap-3 p-5">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-14 w-full" />
    </Card>
  );
}
