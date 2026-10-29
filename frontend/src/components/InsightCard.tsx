import { ChevronDown, ChevronUp, EyeOff, Shield, ShieldAlert, ShieldCheck, ThumbsDown } from "lucide-react";
import { useState } from "react";
import type { FeedbackAction, Insight } from "../api/types";
import { CATEGORY_TEXT, METRIC_INFO } from "../format";
import { EvidencePanel } from "./EvidencePanel";

/** Confidence comes from the backend (D9). Each label pairs an icon with the word, never colour alone. */
const CONFIDENCE = {
  high: { style: "bg-emerald-400/15 text-emerald-200 border-emerald-400/30", Icon: ShieldCheck },
  medium: { style: "bg-sky-400/15 text-sky-200 border-sky-400/30", Icon: Shield },
  low: { style: "bg-amber-400/15 text-amber-200 border-amber-400/30", Icon: ShieldAlert },
} as const;

interface Props {
  insight: Insight;
  onFeedback: (insightId: string, action: FeedbackAction) => Promise<void>;
  position?: number; // 1-based place in the visible feed
  total?: number;
}

export function InsightCard({ insight, onFeedback, position, total }: Props) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const e = insight.explanation;
  const titleId = `insight-${insight.insight_id}`;
  const confidence = CONFIDENCE[insight.confidence_label];
  const accent = METRIC_INFO[insight.metrics[0]]?.accent ?? "var(--color-brand)";

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
    <article
      className="lp-enter relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/[0.12] via-white/[0.03] to-sky-500/[0.06] p-4 shadow-[0_8px_30px_rgb(0_0_0/0.25)]"
      aria-labelledby={titleId}
      data-testid="insight-card"
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent, boxShadow: `0 0 16px ${accent}` }} aria-hidden />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="eyebrow text-violet-200">
          {position && total ? `Insight ${position} of ${total} · ` : `#${insight.rank} · `}
          {CATEGORY_TEXT[insight.category] ?? insight.category}
        </span>
        <span className="chip border border-line bg-glass text-ink-soft">
          {insight.metrics.map((m) => METRIC_INFO[m].label).join(" + ")}
        </span>
        <span
          className={`chip border ${confidence.style}`}
          title="Based on data coverage and reliability, not on the language model"
        >
          <confidence.Icon className="size-3.5" aria-hidden />
          {insight.confidence_label} confidence
        </span>
        <span className="chip border border-line text-ink-muted">
          {insight.explanation_provider === "gemini" ? "Gemini" : "Template"}
        </span>
        {insight.feedback && <span className="chip bg-glass-strong text-ink-soft">Marked {insight.feedback}</span>}
      </div>

      <div>
        <h3 id={titleId} className="text-base font-semibold text-ink">{e.title}</h3>
        <p className="mt-1 text-sm text-ink-soft">{e.summary}</p>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="eyebrow text-ink-muted">What changed</dt>
          <dd className="mt-0.5 text-ink">{e.what_changed}</dd>
        </div>
        <div>
          <dt className="eyebrow text-ink-muted">Why it was selected</dt>
          <dd className="mt-0.5 text-ink">{e.why_it_matters}</dd>
        </div>
        {e.possible_context && (
          <div>
            <dt className="eyebrow text-ink-muted">Possible context (not a fact)</dt>
            <dd className="mt-0.5 text-ink-soft">{e.possible_context}</dd>
          </div>
        )}
        {e.limitations.length > 0 && (
          <div>
            <dt className="eyebrow text-ink-muted">Limitations</dt>
            <dd className="mt-0.5">
              <ul className="list-disc pl-5 text-ink-soft">{e.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
            </dd>
          </div>
        )}
      </dl>
      {e.suggested_reflection && <p className="text-sm italic text-ink-muted">{e.suggested_reflection}</p>}

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
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      </div>
      {open && <EvidencePanel insight={insight} />}
    </article>
  );
}
