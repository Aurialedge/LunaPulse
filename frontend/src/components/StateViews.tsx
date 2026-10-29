import { AlertTriangle, Inbox, Loader2, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import type { ApiError } from "../api/client";
import { Button } from "@/components/ui/button";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 rounded-lg border border-negative/25 bg-negative/5 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden />
      <div className="flex-1">
        <p className="font-medium">Something went wrong</p>
        <p className="text-muted-foreground">{error.message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden /> Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center text-sm">
      <span className="grid size-10 place-items-center rounded-full bg-secondary" aria-hidden>
        <Inbox className="size-5 text-muted-foreground" />
      </span>
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-muted-foreground">{children}</div>}
    </div>
  );
}
