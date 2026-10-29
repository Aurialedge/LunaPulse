import { ChevronDown, ChevronUp, EyeOff, ThumbsDown } from "lucide-react";
import { useState } from "react";
import type { FeedbackAction, Insight } from "../api/types";
import { CATEGORY_TEXT, METRIC_INFO } from "../format";
import { EvidencePanel } from "./EvidencePanel";

const CONFIDENCE_STYLE: Record<string, string> = {
  high: "bg-green-100 text-green-800",
  medium: "bg-sky-100 text-sky-800",
  low: "bg-amber-100 text-amber-900",
};

interface Props {
  insight: Insight;
  onFeedback: (insightId: string, action: FeedbackAction) => Promise<void>;
}

export function InsightCard({ insight, onFeedback }: Props) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const e = insight.explanation;
  const titleId = `insight-${insight.insight_id}`;

  async function feedback(action: FeedbackAction) {
    setSending(true);
    setError(null);
    try {
      await onFeedback(insight.insight_id, action);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save feedback.");
      setSending(false);
    }
  }

  return (
    <article className="card flex flex-col gap-3" aria-labelledby={titleId} data-testid="insight-card">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="chip bg-blue-50 text-blue-800">#{insight.rank} · {CATEGORY_TEXT[insight.category] ?? insight.category}</span>
        <span className="chip bg-slate-100 text-slate-700">{insight.metrics.map((m) => METRIC_INFO[m].label).join(" + ")}</span>
        <span className={`chip ${CONFIDENCE_STYLE[insight.confidence_label]}`} title="Based on data coverage and reliability, not on the language model">
          {insight.confidence_label} confidence
        </span>
        <span className="chip bg-white text-slate-500 ring-1 ring-slate-200">
          {insight.explanation_provider === "gemini" ? "Gemini" : "Template"}
        </span>
        {insight.feedback && <span className="chip bg-slate-200 text-slate-700">Marked {insight.feedback}</span>}
      </div>

      <div>
        <h3 id={titleId} className="text-base font-semibold">{e.title}</h3>
        <p className="mt-1 text-sm text-slate-700">{e.summary}</p>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-slate-600">What changed</dt>
          <dd>{e.what_changed}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-600">Why it was selected</dt>
          <dd>{e.why_it_matters}</dd>
        </div>
        {e.possible_context && (
          <div>
            <dt className="font-medium text-slate-600">Possible context (not a fact)</dt>
            <dd className="text-slate-600">{e.possible_context}</dd>
          </div>
        )}
        {e.limitations.length > 0 && (
          <div>
            <dt className="font-medium text-slate-600">Limitations</dt>
            <dd>
              <ul className="list-disc pl-5 text-slate-600">{e.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
            </dd>
          </div>
        )}
      </dl>
      {e.suggested_reflection && <p className="text-sm italic text-slate-600">{e.suggested_reflection}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
          Why am I seeing this?
        </button>
        {!insight.feedback && (
          <>
            <button type="button" className="btn-secondary" disabled={sending} onClick={() => feedback("dismissed")}>
              <EyeOff className="size-4" aria-hidden /> Dismiss
            </button>
            <button type="button" className="btn-secondary" disabled={sending} onClick={() => feedback("irrelevant")}>
              <ThumbsDown className="size-4" aria-hidden /> Not relevant
            </button>
          </>
        )}
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      </div>
      {open && <EvidencePanel insight={insight} />}
    </article>
  );
}
