import { Shuffle } from "lucide-react";
import { useState } from "react";
import type { Scenario, User } from "../api/types";

interface Props {
  users: User[];
  scenarios: Scenario[];
  user: User;
  date: string;
  onUserChange: (userId: string) => void;
  onDateChange: (date: string) => void;
  onApplyScenario: (scenario: string) => Promise<void>;
}

export function Controls({ users, scenarios, user, date, onUserChange, onDateChange, onApplyScenario }: Props) {
  const [scenario, setScenario] = useState(user.scenario);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxDate = user.today < user.data_end ? user.today : user.data_end;
  const description = scenarios.find((s) => s.name === scenario)?.description;

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      await onApplyScenario(scenario);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply the scenario.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <section aria-label="Data selection" className="card grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1.4fr]">
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor="user" className="text-sm font-medium">Synthetic user</label>
        <select id="user" className="input w-full min-w-0" value={user.user_id} onChange={(e) => onUserChange(e.target.value)}>
          {users.map((u) => (
            <option key={u.user_id} value={u.user_id}>
              {u.display_name}: {u.profile_description}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">
          Goals: {user.activity_goal_steps.toLocaleString("en-US")} steps · {user.sleep_target_hours} h sleep ·{" "}
          {user.timezone}
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor="date" className="text-sm font-medium">Date</label>
        <input
          id="date"
          type="date"
          className="input"
          value={date}
          min={user.data_start}
          max={maxDate}
          onChange={(e) => e.target.value && onDateChange(e.target.value)}
        />
        <p className="text-xs text-slate-500">User's today: {user.today}</p>
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor="scenario" className="text-sm font-medium">Demo scenario</label>
        <div className="flex flex-wrap gap-2">
          <select id="scenario" className="input min-w-0 flex-1" value={scenario} onChange={(e) => setScenario(e.target.value)}>
            {scenarios.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name.replaceAll("_", " ")}
                {s.name === user.scenario ? " (current)" : ""}
              </option>
            ))}
          </select>
          <button type="button" className="btn-secondary" onClick={apply} disabled={applying}>
            <Shuffle className="size-4" aria-hidden />
            {applying ? "Regenerating…" : "Regenerate data"}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          {description} Regenerates this user's data (seed {user.seed}) and marks old insights outdated.
        </p>
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      </div>
    </section>
  );
}
