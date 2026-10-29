import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { ErrorState, LoadingState } from "./StateViews";

const MAX_LENGTH = 500;

/** Free-text notes. They are treated as untrusted data by the backend, never as instructions (D15). */
export function NotesPanel({ userId, date, version }: { userId: string; date: string; version: number }) {
  const notes = useAsync(() => api.notes(userId, date), [userId, date, version]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.addNote(userId, date, text);
      setText("");
      notes.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card flex flex-col gap-3" aria-labelledby="notes-title">
      <div>
        <h2 id="notes-title" className="text-base font-semibold">Notes for {date}</h2>
        <p className="text-xs text-ink-muted">
          Notes may add context to explanations. They are treated as data, not instructions, and their numbers are
          never used as facts.
        </p>
      </div>
      {notes.loading && <LoadingState label="Loading notes…" />}
      {notes.error && <ErrorState error={notes.error} onRetry={notes.reload} />}
      {notes.data && notes.data.length === 0 && <p className="text-sm text-ink-muted">No notes for this day.</p>}
      {notes.data && notes.data.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {notes.data.map((n) => (
            <li key={n.id} className="rounded-xl border border-line bg-surface-raised px-3 py-2 text-ink-soft">{n.text}</li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor="note" className="text-sm font-medium">Add a note</label>
        <textarea
          id="note"
          className="input min-h-16"
          maxLength={MAX_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Long flight, late dinner"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-ink-muted">{text.length}/{MAX_LENGTH}</span>
          <button type="submit" className="btn-secondary" disabled={saving || !text.trim()}>
            {saving ? "Saving…" : "Save note"}
          </button>
        </div>
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      </form>
    </section>
  );
}
