import type { Insight } from "../api/types";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EvidencePanel } from "./EvidencePanel";

/** "Why am I seeing this?" as a side drawer: the evidence behind one insight, without leaving the dashboard. */
export function EvidenceDrawer({ insight, onClose }: { insight: Insight | null; onClose: () => void }) {
  return (
    <Sheet open={insight !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right">
        {insight && (
          <>
            <SheetHeader>
              <p className="text-xs font-medium text-muted-foreground">Why am I seeing this?</p>
              <SheetTitle>{insight.explanation.title}</SheetTitle>
              <SheetDescription>
                The data and the rule behind this insight, exactly as the backend calculated them.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <EvidencePanel insight={insight} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
