import { FlaskConical, Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Health } from "../../api/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { LogoMark, Sidebar, type NavTarget, type View } from "./Sidebar";

interface Props {
  view: View;
  onNavigate: (target: NavTarget) => void;
  health: Health | null;
  topBar?: ReactNode;
  children: ReactNode;
}

/** Sidebar on large screens; a compact header with a navigation drawer below that. */
export function AppLayout({ view, onNavigate, health, topBar, children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  function navigate(target: NavTarget) {
    setMenuOpen(false);
    onNavigate(target);
  }

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-border bg-card lg:block">
        <Sidebar view={view} onNavigate={navigate} health={health} />
      </aside>

      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-card px-4 py-2.5 lg:hidden">
        <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setMenuOpen(true)}>
          <Menu aria-hidden />
        </Button>
        <LogoMark className="size-7" />
        <span className="font-semibold tracking-tight">LunaPulse</span>
      </header>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" aria-describedby={undefined} className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Go to a section of LunaPulse</SheetDescription>
          <Sidebar view={view} onNavigate={navigate} health={health} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col">
        {topBar && <div className="lg:sticky lg:top-0 lg:z-20">{topBar}</div>}
        <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
          <p className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground">
            <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            Research demo. All data is synthetic, not real measurements. Nothing here is a diagnosis or medical advice.
          </p>
          {children}
        </main>
      </div>
    </div>
  );
}
