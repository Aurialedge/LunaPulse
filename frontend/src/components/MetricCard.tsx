import { ArrowDownRight, ArrowUpRight, Minus, Pencil } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { MetricBaseline } from "../api/types";
import { describeFlag, formatPercent, formatSigned, formatValue } from "../format";

interface Props {
  baseline: MetricBaseline;
  onCorrect: (value: number) => Promise<void>;
}

/** Today's value vs. the personal baseline. Every number comes from the baselines endpoint. */
export function MetricCard({ baseline: b, onCorrect }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `metric-${b.metric}`;

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
    <article className="card flex flex-col gap-2" aria-labelledby={id} data-testid={id}>
      <div className="flex items-start justify-between gap-2">
        <h3 id={id} className="text-sm font-medium text-slate-600">{b.label}</h3>
        <button
          type="button"
          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-blue-700"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          aria-label={`Correct ${b.label} value`}
        >
          <Pencil className="size-4" aria-hidden />
        </button>
      </div>

      <p className="text-2xl font-semibold tabular-nums" data-testid={`${id}-value`}>
        {formatValue(b.metric, b.observed_value)}
      </p>

      {b.status === "insufficient" ? (
        <p className="text-sm text-amber-800" data-testid={`${id}-insufficient`}>
          Not enough history for a baseline: {b.valid_observation_count} of {b.window_days} days valid.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Baseline <span className="font-medium tabular-nums" data-testid={`${id}-baseline`}>{formatValue(b.metric, b.median)}</span>{" "}
            <span className="text-slate-500">(median, {b.valid_observation_count} of {b.window_days} days)</span>
          </p>
          {b.absolute_difference !== null ? (
            <div className="text-sm">
              <p className="flex flex-wrap items-center gap-x-2" data-testid={`${id}-difference`}>
                <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium tabular-nums">
                  <Arrow className="size-4 shrink-0 text-slate-500" aria-hidden />
                  {formatSigned(b.metric, b.absolute_difference)}
                </span>
                <span className="whitespace-nowrap tabular-nums text-slate-500">{formatPercent(b.percentage_difference)}</span>
                <span className="sr-only">compared with the baseline</span>
              </p>
              <p className="text-slate-500">{b.interpretation}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{b.interpretation}</p>
          )}
        </>
      )}

      {b.target_flags.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label={`${b.label} data-quality flags`}>
          {b.target_flags.map((flag) => (
            <li key={flag} className="chip bg-amber-100 text-amber-900">{describeFlag(flag)}</li>
          ))}
        </ul>
      )}

      {editing && (
        <form onSubmit={submit} className="mt-1 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-2">
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
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
          {error && <p id={`${id}-error`} role="alert" className="w-full text-xs text-red-700">{error}</p>}
        </form>
      )}
    </article>
  );
}
