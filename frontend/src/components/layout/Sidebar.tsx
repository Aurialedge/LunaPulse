import { LayoutDashboard, LineChart, Sparkles, Table2 } from "lucide-react";
import type { Health } from "../../api/types";
import { cn } from "@/lib/utils";

export type View = "overview" | "edit";
/** Where a navigation item goes: a view, or a section of the overview to scroll to. */
export type NavTarget = "overview" | "insights" | "trends" | "edit";

const ITEMS: { target: NavTarget; label: string; Icon: typeof LayoutDashboard }[] = [
  { target: "overview", label: "Overview", Icon: LayoutDashboard },
  { target: "insights", label: "Insights", Icon: Sparkles },
  { target: "trends", label: "Trends", Icon: LineChart },
  { target: "edit", label: "Edit data", Icon: Table2 },
];

/** Crescent moon with a pulse line: the LunaPulse mark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground", className)} aria-hidden>
      <svg viewBox="0 0 24 24" className="size-5">
        <path d="M15.5 3.5a8.5 8.5 0 1 0 5 15.3A7 7 0 0 1 15.5 3.5z" fill="rgb(255 255 255 / 0.28)" />
        <path d="M3 13h3.5l1.8-4 3 8 2-5.5 1.2 1.5H21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

interface Props {
  view: View;
  onNavigate: (target: NavTarget) => void;
  health: Health | null;
}

/** The navigation: a fixed sidebar on large screens and the body of the mobile drawer. */
export function Sidebar({ view, onNavigate, health }: Props) {
  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-6 px-3 py-5">
      <div className="flex items-center gap-2.5 px-2">
        <LogoMark />
        <div className="leading-tight">
          <p className="text-[15px] font-semibold tracking-tight">LunaPulse</p>
          <p className="text-xs text-muted-foreground">Wearable insights</p>
        </div>
      </div>

      <ul className="flex flex-col gap-0.5">
        {ITEMS.map(({ target, label, Icon }) => {
          const current = (target === "overview" && view === "overview") || (target === "edit" && view === "edit");
          return (
            <li key={target}>
              <button
                type="button"
                onClick={() => onNavigate(target)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  current ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {label}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto flex flex-col gap-2 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Informational insights tool</p>
        <p>Synthetic data only. Not a diagnosis or medical advice.</p>
        {health && (
          <p className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" aria-hidden />
            Explanations: {health.llm_mode === "gemini" ? "Gemini (validated)" : "Template fallback (no API key)"}
          </p>
        )}
      </div>
    </nav>
  );
}
