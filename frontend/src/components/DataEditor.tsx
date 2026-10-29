import { RotateCcw, Save, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api } from "../api/client";
import { METRICS, type Metric, type Observation } from "../api/types";
import { describeFlag, formatValue, METRIC_INFO } from "../format";

/** Unsaved edits, keyed `${date}|${metric}`, holding the raw text the user typed. */
export type Edits = Record<string, string>;

interface Props {
  observations: Observation[]; // the 28 days ending at the selected date
  dataStart: string; // first day the user has data for; earlier days are not editable
  edits: Edits;
  onEditsChange: (edits: Edits) => void;
  onSaved: () => void;
  userId: string;
  busy?: boolean; // insights are being recalculated: saving now would race with it
}

const key = (date: string, metric: Metric) => `${date}|${metric}`;

/** Parsing what the user typed is input handling, not statistics: the backend validates the range. */
function parseInput(text: string): number | null {
  const value = Number(text.trim());
  return text.trim() === "" || !Number.isFinite(value) ? null : value;
}

/** The data editor (D29): change any value, save them all at once, then recalculate from the dashboard. */
export function DataEditor({ observations, dataStart, edits, onEditsChange, onSaved, userId, busy = false }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [focusCell, setFocusCell] = useState<string | null>(null); // a cell button to focus after closing its input

  const rows = observations.filter((o) => o.date >= dataStart).reverse(); // newest first
  // Keyboard order: left to right, then the next (older) row
  const order = rows.flatMap((o) => METRICS.map((m) => key(o.date, m)));

  useEffect(() => {
    if (focusCell === null) return;
    const [date, metric] = focusCell.split("|");
    tableRef.current?.querySelector<HTMLButtonElement>(`[data-testid="cell-${date}-${metric}"] button`)?.focus();
    setFocusCell(null);
  }, [focusCell]);
  const changes = Object.keys(edits);
  const invalid = changes.some((k) => parseInput(edits[k]) === null);

  function original(date: string, metric: Metric): number | null {
    return observations.find((o) => o.date === date)?.[metric] ?? null;
  }

  function open(date: string, metric: Metric) {
    const k = key(date, metric);
    setActive(k);
    setDraft(edits[k] ?? String(original(date, metric) ?? ""));
  }

  function commit(date: string, metric: Metric) {
    const k = key(date, metric);
    const next = { ...edits };
    if (parseInput(draft) !== null && parseInput(draft) === original(date, metric)) delete next[k]; // back to original
    else if (draft.trim() === "" && original(date, metric) === null) delete next[k]; // still empty
    else next[k] = draft;
    onEditsChange(next);
    setActive(null);
  }

  /** Enter / Tab save the cell and open the next one (Shift+Tab: the previous one); Escape cancels. */
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, date: string, metric: Metric) {
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      commit(date, metric);
      const next = order[order.indexOf(key(date, metric)) + (event.key === "Tab" && event.shiftKey ? -1 : 1)];
      if (next) {
        const [nextDate, nextMetric] = next.split("|") as [string, Metric];
        open(nextDate, nextMetric);
      } else {
        setFocusCell(key(date, metric));
      }
    } else if (event.key === "Escape") {
      setActive(null);
      setFocusCell(key(date, metric));
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.correctBatch(
        userId,
        changes.map((k) => {
          const [date, metric] = k.split("|") as [string, Metric];
          return { date, metric, value: parseInput(edits[k]) as number };
        }),
      );
      onEditsChange({});
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">Edit data</h2>
        <p className="text-sm text-ink-soft">
          Click any value to change it. Changes are checked against plausible ranges and saved together; the
          affected insights then need recalculating. A value can be changed or filled in, not cleared.
        </p>
      </div>

      <div ref={tableRef} className="max-h-[60vh] overflow-auto rounded-xl border border-line">
        <table className="w-full min-w-[520px] text-left text-sm">
          <caption className="sr-only">Daily values, newest first</caption>
          <thead className="sticky top-0 z-10 bg-surface-raised text-xs text-ink-muted">
            <tr>
              <th className="whitespace-nowrap px-3 py-2">Date</th>
              {METRICS.map((m) => (
                <th key={m} className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: METRIC_INFO[m].accent }} aria-hidden />
                    {METRIC_INFO[m].label} ({METRIC_INFO[m].unit})
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.date} className="border-t border-line">
                <th scope="row" className="whitespace-nowrap px-3 py-1.5 font-normal tabular-nums text-ink-soft">{o.date}</th>
                {METRICS.map((m) => {
                  const k = key(o.date, m);
                  const changed = k in edits;
                  const flags = o.data_quality_flags.filter((f) => f.endsWith(`:${m}`));
                  const flag = flags.find((f) => !f.startsWith("corrected:"))?.split(":")[0] ?? (flags.length ? "corrected" : undefined);
                  const bad = changed && parseInput(edits[k]) === null;
                  const flagId = `flag-${o.date}-${m}`;
                  const errorId = `error-${o.date}-${m}`;
                  const describedBy = [flags.length ? flagId : "", bad ? errorId : ""].filter(Boolean).join(" ") || undefined;
                  const tint = changed
                    ? "bg-violet-500/20 shadow-[inset_0_0_0_1px_rgb(167_139_250/0.7),0_0_14px_rgb(139_92_246/0.35)]"
                    : flag === "corrected"
                      ? "bg-teal-400/10"
                      : flag
                        ? "bg-amber-400/10"
                        : "";
                  return (
                    <td
                      key={m}
                      data-testid={`cell-${o.date}-${m}`}
                      data-changed={changed}
                      data-flag={flag}
                      title={flags.map(describeFlag).join(", ") || undefined}
                      className={`px-1.5 py-1 tabular-nums transition ${tint}`}
                    >
                      {active === k ? (
                        <input
                          autoFocus
                          inputMode="decimal"
                          aria-label={`${METRIC_INFO[m].label} on ${o.date}`}
                          className="input w-full px-2 py-1"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => onKeyDown(e, o.date, m)}
                          onBlur={() => commit(o.date, m)}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => open(o.date, m)}
                          aria-label={`Edit ${METRIC_INFO[m].label} on ${o.date}`}
                          aria-describedby={describedBy}
                          className="flex w-full items-center gap-1 rounded-lg px-1.5 py-1 text-left hover:bg-glass-strong focus-visible:outline-2 focus-visible:outline-brand-soft"
                        >
                          {changed ? edits[k] || "—" : formatValue(m, o[m])}
                          {flag && flag !== "corrected" && !changed && (
                            <TriangleAlert className="size-3 shrink-0 text-warn" aria-hidden />
                          )}
                        </button>
                      )}
                      {flags.length > 0 && (
                        <span id={flagId} className="sr-only">{flags.map(describeFlag).join(", ")}</span>
                      )}
                      {bad && <span id={errorId} className="block px-1.5 text-[11px] text-rose-300">Enter a number</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {changes.length > 0 && (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-400/40 bg-surface-raised px-4 py-3 shadow-[0_0_30px_rgb(139_92_246/0.35)]">
          <p className="text-sm font-medium">
            {changes.length} unsaved change{changes.length === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => onEditsChange({})} disabled={saving}>
              <RotateCcw className="size-4" aria-hidden /> Discard
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={saving || invalid || busy}>
              <Save className="size-4" aria-hidden /> {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
          {busy && (
            <p className="w-full text-sm text-ink-soft">Wait for the insight recalculation to finish before saving.</p>
          )}
          {invalid && !busy && <p className="w-full text-sm text-rose-300">Fix the cells marked "Enter a number" to save.</p>}
          {error && <p role="alert" className="w-full text-sm text-rose-300">{error}</p>}
        </div>
      )}
    </div>
  );
}
