import { RefreshCw, Sparkles, TimerReset } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import type { FeedbackAction, Feed, Insight, Metric } from "../api/types";
import { formatDateTime } from "../format";
import { useAsync } from "../hooks/useAsync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { InsightCard, InsightCardSkeleton } from "./InsightCard";
import { EmptyState, ErrorState, LoadingState } from "./StateViews";

interface Props {
  userId: string;
  date: string;
  version: number; // bumped by the page when data changes (scenario, correction, data editor)
  onInsightMetrics?: (metrics: Metric[]) => void; // which metrics the visible insights are about
  onGeneratingChange?: (generating: boolean) => void; // lets the data editor wait for a running recalculation
}

/** Up to three ranked insights for the selected day, with generate / regenerate / recalculate. */
export function InsightFeed({ userId, date, version, onInsightMetrics, onGeneratingChange }: Props) {
  const [showHidden, setShowHidden] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const { data: feed, loading, error, reload } = useAsync(
    () => api.feed(userId, date, showHidden),
    [userId, date, version, showHidden, refresh],
  );
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<ApiError | null>(null);
  const notGenerated = error?.code === "insights_not_generated";
  // Keep showing the current feed while it reloads (e.g. after feedback), but never another day's or user's feed
  const current = feed && feed.target_date === date && feed.user_id === userId ? feed : null;
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The insight whose evidence drawer is open. Closed whenever the date or the data changes, so evidence from
  // another day or an outdated run is never shown (the workspace remounts on a user change).
  const [evidenceFor, setEvidenceFor] = useState<Insight | null>(null);
  useEffect(() => setEvidenceFor(null), [date, version]);
  const outdated = error?.code === "insights_outdated"; // the data changed after these insights were made (D30)

  useEffect(() => {
    onInsightMetrics?.([...new Set(feed?.insights.flatMap((i) => i.metrics) ?? [])]);
  }, [feed, onInsightMetrics]);

  useEffect(() => {
    onGeneratingChange?.(generating);
  }, [generating, onGeneratingChange]);

  async function generate(force: boolean) {
    setGenerating(true);
    setGenerateError(null);
    try {
      await api.generateInsights(userId, date, force);
      setShowHidden(false);
      setRefresh((r) => r + 1);
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err : new ApiError(0, "unknown_error", String(err)));
    } finally {
      setGenerating(false);
    }
  }

  async function sendFeedback(insightId: string, action: FeedbackAction) {
    await api.feedback(insightId, action);
    headingRef.current?.focus(); // the card (and its menu trigger) is about to disappear
    reload();
  }

  const buttonLabel = outdated ? "Recalculate insights" : current ? "Regenerate insights" : "Generate insights";
  const ButtonIcon = outdated ? TimerReset : current ? RefreshCw : Sparkles;
  const visibleCount = feed?.insights.length ?? 0;

  return (
    <section aria-labelledby="feed-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 id="feed-title" ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">Top insights for {date}</h2>
          {current && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <ProviderBadge provider={current.provider} reason={current.fallback_reason} />
              Generated {formatDateTime(current.generated_at)} · rules {current.rule_version} · ranked by the backend, at most 3
            </p>
          )}
        </div>
        <Button disabled={generating || loading} onClick={() => generate(Boolean(current))}>
          <ButtonIcon aria-hidden />
          {generating ? "Generating…" : buttonLabel}
        </Button>
      </div>

      {generating && <LoadingState label="Calculating evidence and writing explanations (Gemini can take up to 30 seconds)…" />}
      {generateError && <ErrorState error={generateError} />}

      {!generating && loading && !current && (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading insights">
          <InsightCardSkeleton />
          <InsightCardSkeleton />
        </div>
      )}
      {!generating && !loading && notGenerated && (
        <EmptyState title="No insights generated for this day yet">
          Press <strong>Generate insights</strong> to run the analysis for {date}.
        </EmptyState>
      )}
      {!generating && !loading && outdated && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm">
          <TimerReset className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="font-medium">Data changed since these insights were made</p>
            <p className="text-muted-foreground">
              The old insights for {date} are hidden because their data changed. Press <strong>Recalculate insights</strong>{" "}
              to analyse the current data.
            </p>
          </div>
        </div>
      )}
      {!generating && !loading && error && !notGenerated && !outdated && <ErrorState error={error} onRetry={reload} />}

      {!generating && current && (
        <>
          {visibleCount === 0 && (
            <EmptyState title={current.hidden_count ? "All insights for this day are hidden" : "No notable insights for this date"}>
              {current.hidden_count
                ? "You dismissed or flagged every insight."
                : "Your available data did not produce a sufficiently supported insight for this period."}
            </EmptyState>
          )}
          {current.insights.map((insight, index) => (
            <InsightCard
              key={insight.insight_id}
              insight={insight}
              position={index + 1}
              total={visibleCount}
              onFeedback={sendFeedback}
              onOpenEvidence={setEvidenceFor}
            />
          ))}
          {(current.hidden_count > 0 || showHidden) && (
            <Button variant="outline" size="sm" className="self-start" onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? "Hide dismissed insights" : `Show ${current.hidden_count} hidden insight(s)`}
            </Button>
          )}
          <CandidateSummary feed={current} />
        </>
      )}
      <EvidenceDrawer insight={evidenceFor} onClose={() => setEvidenceFor(null)} />
    </section>
  );
}

const STATUS_TEXT: Record<string, string> = {
  selected: "shown",
  suppressed_redundant: "not shown: same metric as a higher-ranked insight",
  below_limit: "not shown: top-3 limit",
  dropped_by_llm: "dropped: could not be grounded",
};

function CandidateSummary({ feed }: { feed: Feed }) {
  if (feed.candidates.length === 0) return null;
  return (
    <Card className="p-0 text-sm">
      <details className="group px-5 py-3">
      <summary className="cursor-pointer font-medium text-muted-foreground">All {feed.candidates.length} candidates considered</summary>
      <ul className="mt-2 flex flex-col gap-1">
        {feed.candidates.map((c) => (
          <li key={c.candidate_id} className="flex flex-wrap gap-x-2 text-muted-foreground">
            <span className="font-mono text-xs text-foreground">{c.candidate_id}</span>
            <span className="tabular-nums">score {c.score}</span>
            <span>{STATUS_TEXT[c.status] ?? c.status}</span>
            {c.drop_reason && <span className="italic">({c.drop_reason})</span>}
          </li>
        ))}
      </ul>
      </details>
    </Card>
  );
}

const PROVIDER_TEXT: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  gemini: { label: "Explained by Gemini", variant: "default" },
  fallback: { label: "Template explanation", variant: "secondary" },
  mixed: { label: "Gemini + template", variant: "default" },
  none: { label: "No insights to explain", variant: "outline" },
};

const FALLBACK_REASON: Record<string, string> = {
  no_api_key: "no Gemini API key is configured",
  provider_error: "Gemini was unavailable",
  invalid_response: "Gemini's answer was not valid JSON",
  validation_failed: "Gemini's answer failed the evidence check",
};

/** Which service wrote the explanations, and why the template was used (from the feed response). */
export function ProviderBadge({ provider, reason }: { provider: string; reason: string | null }) {
  const info = PROVIDER_TEXT[provider] ?? PROVIDER_TEXT.none;
  const why = reason ? FALLBACK_REASON[reason] ?? reason : null;
  return (
    <Badge variant={info.variant} title={why ? `Template used because ${why}.` : undefined}>
      {info.label}
      {why && <span className="font-normal">· {why}</span>}
    </Badge>
  );
}

