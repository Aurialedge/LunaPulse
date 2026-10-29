import { Activity, ArrowDownRight, ArrowUpRight, Footprints, HeartPulse, Minus, Moon, Pencil } from "lucide-react";
import { useState, type CSSProperties, type FormEvent } from "react";
import type { Metric, MetricBaseline } from "../api/types";
import { describeFlag, formatPercent, formatSigned, formatValue, METRIC_INFO } from "../format";

const ICONS: Record<Metric, typeof Activity> = {
  steps: Footprints,
  sleep_hours: Moon,
  resting_heart_rate_bpm: HeartPulse,
  hrv_ms: Activity,
};

const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Progress towards the user's own goal. `percent` comes from the backend (goal_progress_percent). */
function GoalRing({ percent, accent, label }: { percent: number; accent: string; label: string }) {
  const offset = RING_CIRCUMFERENCE * (1 - percent / 100);
  return (
    <svg viewBox="0 0 64 64" className="size-16 shrink-0" role="img" aria-label={label}>
      <circle cx="32" cy="32" r={RING_RADIUS} fill="none" stroke="var(--color-glass-strong)" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={RING_RADIUS}
        fill="none"
        stroke={accent}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={offset}
        transform="rotate(-90 32 32)"
        className="lp-ring"
        style={{ "--ring-c": RING_CIRCUMFERENCE, filter: `drop-shadow(0 0 4px ${accent})` } as CSSProperties}
      />
      <text x="32" y="36" textAnchor="middle" className="fill-ink text-[12px] font-semibold">
        {Math.round(percent)}%
      </text>
    </svg>
  );
}

interface Props {
  baseline: MetricBaseline;
  onCorrect: (value: number) => Promise<void>;
  highlighted?: boolean; // a current insight is about this metric
}

/** Today's value vs. the personal baseline. Every number comes from the baselines endpoint. */
export function MetricCard({ baseline: b, onCorrect, highlighted = false }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `metric-${b.metric}`;
  const { accent } = METRIC_INFO[b.metric];
  const Icon = ICONS[b.metric];
  const Arrow = b.direction === "above" ? ArrowUpRight : b.direction === "below" ? ArrowDownRight : Minus;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(draft);
    if (draft.trim() === "" || Number.isNaN(value)) {
      setError("Enter a number.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCorrect(value);
      setEditing(false);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the correction.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article
      className="card lp-enter flex flex-col gap-3 transition"
      aria-labelledby={id}
      data-testid={id}
      data-highlighted={highlighted}
      style={highlighted ? { borderColor: accent, boxShadow: `0 0 24px -6px ${accent}` } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={id} className="eyebrow flex items-center gap-1.5 text-ink-soft">
          <Icon className="size-4" style={{ color: accent }} aria-hidden />
          {b.label}
        </h3>
        <button
          type="button"
          className="rounded-lg p-1 text-ink-muted hover:bg-glass-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-soft"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          aria-label={`Correct ${b.label} value`}
        >
          <Pencil className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums tracking-tight" data-testid={`${id}-value`}>
            {formatValue(b.metric, b.observed_value)}
          </p>
          {b.goal_value !== null && (
            <p className="text-xs text-ink-muted">goal {formatValue(b.metric, b.goal_value)}</p>
          )}
        </div>
        {b.goal_progress_percent !== null ? (
          <GoalRing percent={b.goal_progress_percent} accent={accent} label={`${b.goal_progress_percent}% of goal`} />
        ) : (
          <span
            className="grid size-12 shrink-0 place-items-center rounded-full border border-line"
            style={{ color: accent, boxShadow: `0 0 18px -4px ${accent}` }}
            aria-hidden
          >
            <Icon className="size-5" />
          </span>
        )}
      </div>

      {b.status === "insufficient" ? (
        <p className="text-sm text-amber-200" data-testid={`${id}-insufficient`}>
          Not enough history for a baseline: {b.valid_observation_count} of {b.window_days} days valid.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-soft">
            Baseline <span className="font-semibold text-ink tabular-nums" data-testid={`${id}-baseline`}>{formatValue(b.metric, b.median)}</span>{" "}
            <span className="text-ink-muted">(median, {b.valid_observation_count} of {b.window_days} days)</span>
          </p>
          {b.absolute_difference !== null ? (
            <div className="text-sm">
              <p className="flex flex-wrap items-center gap-x-2" data-testid={`${id}-difference`}>
                <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold tabular-nums">
                  <Arrow className="size-4 shrink-0" style={{ color: accent }} aria-hidden />
                  {formatSigned(b.metric, b.absolute_difference)}
                </span>
                <span className="whitespace-nowrap tabular-nums text-ink-muted">{formatPercent(b.percentage_difference)}</span>
                <span className="sr-only">compared with the baseline</span>
              </p>
              <p className="text-ink-muted">{b.interpretation}</p>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">{b.interpretation}</p>
          )}
        </>
      )}

      {b.target_flags.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label={`${b.label} data-quality flags`}>
          {b.target_flags.map((flag) => (
            <li
              key={flag}
              className={`chip ${flag.startsWith("corrected:") ? "bg-teal-400/15 text-teal-200" : "bg-amber-400/15 text-amber-200"}`}
            >
              {describeFlag(flag)}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-ink-soft">
            Corrected value ({b.unit})
            <input
              className="input"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-describedby={error ? `${id}-error` : undefined}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save correction"}</button>
          {error && <p id={`${id}-error`} role="alert" className="w-full text-xs text-rose-300">{error}</p>}
        </form>
      )}
    </article>
  );
}
