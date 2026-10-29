import { AlertTriangle, Inbox, Loader2, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import type { ApiError } from "../api/client";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 py-6 text-sm text-slate-500">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-700" aria-hidden />
      <div className="flex-1">
        <p className="font-medium text-red-900">Something went wrong</p>
        <p className="text-red-800">{error.message}</p>
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
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm">
      <Inbox className="size-6 text-slate-400" aria-hidden />
      <p className="font-medium text-slate-700">{title}</p>
      {children && <div className="text-slate-500">{children}</div>}
    </div>
  );
}
