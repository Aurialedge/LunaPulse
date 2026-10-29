import { AlertTriangle, Inbox, Loader2, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import type { ApiError } from "../api/client";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 py-6 text-sm text-ink-soft">
      <Loader2 className="size-4 animate-spin text-brand-soft" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-300" aria-hidden />
      <div className="flex-1">
        <p className="font-medium text-rose-100">Something went wrong</p>
        <p className="text-rose-200">{error.message}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary">
          <RotateCw className="size-4" aria-hidden /> Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-glass p-6 text-center text-sm">
      <Inbox className="size-6 text-ink-muted" aria-hidden />
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="text-ink-soft">{children}</div>}
    </div>
  );
}
