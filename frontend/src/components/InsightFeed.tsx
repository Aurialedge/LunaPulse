import { RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../api/client";
import type { FeedbackAction, Feed } from "../api/types";
import { formatDateTime } from "../format";
import { useAsync } from "../hooks/useAsync";
import { ProviderBadge } from "./Header";
import { InsightCard } from "./InsightCard";
import { EmptyState, ErrorState, LoadingState } from "./StateViews";

interface Props {
  userId: string;
  date: string;
  version: number; // bumped by the page when data changes (scenario, correction)
}

/** Up to three ranked insights for the selected day, with generate / regenerate. */
export function InsightFeed({ userId, date, version }: Props) {
  const [showHidden, setShowHidden] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const { data: feed, loading, error, reload } = useAsync(
    () => api.feed(userId, date, showHidden),
    [userId, date, version, showHidden, refresh],
  );
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<ApiError | null>(null);
  const notGenerated = error?.code === "insights_not_generated";

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
    reload();
  }

  return (
    <section aria-labelledby="feed-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="feed-title" className="text-lg font-semibold">Top insights for {date}</h2>
          {feed && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <ProviderBadge provider={feed.provider} reason={feed.fallback_reason} />
              Generated {formatDateTime(feed.generated_at)} · rules {feed.rule_version}
            </p>
          )}
        </div>
        <button type="button" className="btn-primary" disabled={generating || loading} onClick={() => generate(Boolean(feed))}>
          {feed ? <RefreshCw className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {generating ? "Generating…" : feed ? "Regenerate insights" : "Generate insights"}
        </button>
      </div>

      {generating && <LoadingState label="Calculating evidence and writing explanations (Gemini can take up to 30 seconds)…" />}
      {generateError && <ErrorState error={generateError} />}

      {!generating && loading && <LoadingState label="Loading insights…" />}
      {!generating && !loading && notGenerated && (
        <EmptyState title="No insights generated for this day yet">
          Press <strong>Generate insights</strong> to run the analysis for {date}.
        </EmptyState>
      )}
      {!generating && !loading && error && !notGenerated && <ErrorState error={error} onRetry={reload} />}

      {!generating && !loading && feed && (
        <>
          {feed.insights.length === 0 && (
            <EmptyState title={feed.hidden_count ? "All insights for this day are hidden" : "Nothing notable for this day"}>
              {feed.hidden_count
                ? "You dismissed or flagged every insight."
                : "Your data stayed within your usual range, so no insight is forced."}
            </EmptyState>
          )}
          {feed.insights.map((insight) => (
            <InsightCard key={insight.insight_id} insight={insight} onFeedback={sendFeedback} />
          ))}
          {(feed.hidden_count > 0 || showHidden) && (
            <button type="button" className="btn-secondary self-start" onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? "Hide dismissed insights" : `Show ${feed.hidden_count} hidden insight(s)`}
            </button>
          )}
          <CandidateSummary feed={feed} />
        </>
      )}
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
    <details className="card text-sm">
      <summary className="cursor-pointer font-medium">All {feed.candidates.length} candidates considered</summary>
      <ul className="mt-2 flex flex-col gap-1">
        {feed.candidates.map((c) => (
          <li key={c.candidate_id} className="flex flex-wrap gap-x-2 text-slate-600">
            <span className="font-mono text-xs text-slate-800">{c.candidate_id}</span>
            <span className="tabular-nums">score {c.score}</span>
            <span>{STATUS_TEXT[c.status] ?? c.status}</span>
            {c.drop_reason && <span className="italic">({c.drop_reason})</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
