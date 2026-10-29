import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { MetricBaseline } from "../api/types";
import { formatDate, formatValue } from "../format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  metric: MetricBaseline | null; // null = closed
  date: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: number) => Promise<void>; // stores the correction; the backend recalculates (D18)
}

/**
 * Correct one measurement (design.md §11). The backend validates the value; the client only checks it's a number.
 * Success is shown only after the backend confirms.
 */
export function CorrectionDialog({ metric, date, onOpenChange, onSubmit }: Props) {
  return (
    <Dialog open={metric !== null} onOpenChange={onOpenChange}>
      {metric && <CorrectionForm key={`${metric.metric}-${date}`} metric={metric} date={date} onOpenChange={onOpenChange} onSubmit={onSubmit} />}
    </Dialog>
  );
}

function CorrectionForm({ metric, date, onOpenChange, onSubmit }: Props & { metric: MetricBaseline }) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = `correction-${metric.metric}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(value)) {
      setError("Enter a number.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(value);
      onOpenChange(false);
      toast.success("Correction saved — insights recalculated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the correction.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent locked={saving}>
      <form onSubmit={submit} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>Correct {metric.label}</DialogTitle>
          <DialogDescription>
            The corrected value replaces the device reading for this day. Baselines, charts and insights are recalculated.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background p-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Date</dt>
            <dd className="font-medium">{formatDate(date)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Current value</dt>
            <dd className="font-medium tabular-nums">{metric.observed_value === null ? "No data recorded" : formatValue(metric.metric, metric.observed_value)}</dd>
          </div>
        </dl>
        <div className="grid gap-1.5">
          <label htmlFor={inputId} className="text-sm font-medium">New value ({metric.unit})</label>
          <input
            id={inputId}
            className="input w-full"
            inputMode="decimal"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-describedby={error ? `${inputId}-error` : undefined}
            aria-invalid={error ? true : undefined}
          />
          {error && <p id={`${inputId}-error`} role="alert" className="text-sm text-negative">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save correction"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
