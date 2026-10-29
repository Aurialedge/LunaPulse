import { CircleAlert, CircleCheck, Database, Loader2, RefreshCw, Shuffle } from "lucide-react";
import { useState } from "react";
import type { Scenario, User } from "../../api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type DataStatus = "loading" | "loaded" | "unavailable";

const STATUS = {
  loading: { label: "Loading…", Icon: Loader2, className: "text-muted-foreground [&_svg]:animate-spin" },
  loaded: { label: "Data loaded", Icon: CircleCheck, className: "text-positive" },
  unavailable: { label: "Data unavailable", Icon: CircleAlert, className: "text-negative" },
} as const;

interface Props {
  title: string;
  users: User[];
  user: User;
  date: string;
  scenarios: Scenario[];
  status: DataStatus;
  onUserChange: (userId: string) => void;
  onDateChange: (date: string) => void;
  onRefresh: () => void;
  onApplyScenario: (scenario: string) => Promise<void>;
}

/** Page title plus the controls that pick what the whole page shows. */
export function TopBar({ title, users, user, date, scenarios, status, onUserChange, onDateChange, onRefresh, onApplyScenario }: Props) {
  const maxDate = user.today < user.data_end ? user.today : user.data_end;
  const { label, Icon, className } = STATUS[status];

  return (
    <div className="flex flex-col gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/70 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <p className="truncate text-sm text-muted-foreground">
          LunaPulse <span aria-hidden>/</span> <span className="font-medium text-foreground">{title}</span>
        </p>
        <span role="status" aria-live="polite" className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${className}`}>
          <Icon className="size-3.5" aria-hidden />
          {label}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:flex-none">
          Synthetic user
          <select
            className="input w-full min-w-0 sm:w-56"
            value={user.user_id}
            onChange={(e) => onUserChange(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.display_name} · {u.profile_description}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Date
          <input
            type="date"
            className="input"
            value={date}
            min={user.data_start}
            max={maxDate}
            onChange={(e) => e.target.value && onDateChange(e.target.value)}
          />
        </label>
        <Button variant="outline" onClick={onRefresh} disabled={status === "loading"}>
          <RefreshCw aria-hidden />
          Refresh
        </Button>
        <DemoDataDialog user={user} scenarios={scenarios} onApply={onApplyScenario} />
      </div>
    </div>
  );
}

function DemoDataDialog({ user, scenarios, onApply }: { user: User; scenarios: Scenario[]; onApply: (scenario: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState(user.scenario);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const description = scenarios.find((s) => s.name === scenario)?.description;

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      await onApply(scenario);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply the scenario.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Database aria-hidden />
          Demo data
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Demo data</DialogTitle>
          <DialogDescription>
            Regenerate {user.display_name}'s synthetic history (seed {user.seed}) with a scenario. Existing insights
            become outdated.
          </DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Demo scenario
          <select className="input w-full" value={scenario} onChange={(e) => setScenario(e.target.value)}>
            {scenarios.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name.replaceAll("_", " ")}
                {s.name === user.scenario ? " (current)" : ""}
              </option>
            ))}
          </select>
        </label>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={apply} disabled={applying}>
            <Shuffle aria-hidden />
            {applying ? "Regenerating…" : "Regenerate data"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
