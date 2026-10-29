import { LayoutDashboard, Table2 } from "lucide-react";
import { useState } from "react";
import { api } from "./api/client";
import type { Metric, Scenario, User } from "./api/types";
import { Controls } from "./components/Controls";
import { DataEditor, type Edits } from "./components/DataEditor";
import { DataQualityStatus } from "./components/DataQualityStatus";
import { Header } from "./components/Header";
import { InsightFeed } from "./components/InsightFeed";
import { MetricCard } from "./components/MetricCard";
import { NotesPanel } from "./components/NotesPanel";
import { ErrorState, LoadingState } from "./components/StateViews";
import { TrendChart } from "./components/TrendChart";
import { useAsync } from "./hooks/useAsync";

/** The user's latest day with data, never after their local today (both dates come from the backend). */
function defaultDate(user: User): string {
  return user.today < user.data_end ? user.today : user.data_end;
}

export default function App() {
  const health = useAsync(() => api.health(), []);
  const users = useAsync(() => api.users(), []);
  const scenarios = useAsync(() => api.scenarios(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");

  const user = users.data?.find((u) => u.user_id === userId) ?? users.data?.[0] ?? null;
  const selectedDate = date ?? (user ? defaultDate(user) : null);

  return (
    <div className="min-h-screen pb-10">
      <Header health={health.data} />
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        {users.loading && !users.data && <LoadingState label="Loading synthetic users…" />}
        {users.error && <ErrorState error={users.error} onRetry={users.reload} />}
        {scenarios.error && <ErrorState error={scenarios.error} onRetry={scenarios.reload} />}
        {user && selectedDate && scenarios.data && (
          <Dashboard
            key={user.user_id}
            users={users.data!}
            user={user}
            date={selectedDate}
            scenarios={scenarios.data}
            tab={tab}
            onTabChange={setTab}
            onUserChange={(id) => {
              setUserId(id);
              setDate(null);
            }}
            onDateChange={setDate}
            onDataRegenerated={() => {
              setDate(null);
              users.reload();
            }}
          />
        )}
      </main>
    </div>
  );
}

type Tab = "dashboard" | "edit";

const TABS: { id: Tab; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "edit", label: "Edit data", Icon: Table2 },
];

function TabBar({ tab, onTabChange }: { tab: Tab; onTabChange: (tab: Tab) => void }) {
  return (
    <div role="tablist" aria-label="Views" className="flex gap-1 border-t border-line pt-3">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`tab-${id}`}
          aria-selected={tab === id}
          aria-controls={`panel-${id}`}
          onClick={() => onTabChange(id)}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-brand-soft ${
            tab === id
              ? "bg-violet-500/20 text-violet-100 shadow-[0_0_16px_rgb(139_92_246/0.35)]"
              : "text-ink-soft hover:bg-glass-strong hover:text-ink"
          }`}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

interface DashboardProps {
  users: User[];
  user: User;
  date: string;
  scenarios: Scenario[];
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onUserChange: (userId: string) => void;
  onDateChange: (date: string) => void;
  onDataRegenerated: () => void;
}

function Dashboard({ users, user, date, scenarios, tab, onTabChange, onUserChange, onDateChange, onDataRegenerated }: DashboardProps) {
  // Bumped whenever this user's data changes, so every panel re-fetches from the backend.
  const [version, setVersion] = useState(0);
  const [insightMetrics, setInsightMetrics] = useState<Metric[]>([]);
  // Unsaved data-editor changes. They live here so they survive switching tabs.
  const [edits, setEdits] = useState<Edits>({});
  const [generating, setGenerating] = useState(false);
  const baselines = useAsync(() => api.baselines(user.user_id, date), [user.user_id, date, version, user.data_end]);
  const observations = useAsync(() => api.observations(user.user_id, date), [user.user_id, date, version, user.data_end]);

  /** True when it's fine to throw away unsaved edits (none, or the user confirms). */
  function mayDiscardEdits(): boolean {
    const count = Object.keys(edits).length;
    if (count === 0) return true;
    const ok = window.confirm(`You have ${count} unsaved change${count === 1 ? "" : "s"} in the data editor. Discard them?`);
    if (ok) setEdits({});
    return ok;
  }

  async function applyScenario(scenario: string) {
    if (!mayDiscardEdits()) return;
    await api.generateSimulation(user.user_id, scenario);
    setVersion((v) => v + 1);
    onDataRegenerated();
  }

  async function correct(metric: Metric, value: number) {
    await api.correct(user.user_id, date, metric, value);
    setVersion((v) => v + 1);
  }

  return (
    <>
      <Controls
        users={users}
        scenarios={scenarios}
        user={user}
        date={date}
        onUserChange={(id) => mayDiscardEdits() && onUserChange(id)}
        onDateChange={(d) => mayDiscardEdits() && onDateChange(d)}
        onApplyScenario={applyScenario}
      >
        <TabBar tab={tab} onTabChange={onTabChange} />
      </Controls>

      {/* Both panels stay mounted (only hidden), so a running recalculation and unsaved edits survive tab switches. */}
      <section id="panel-edit" role="tabpanel" aria-labelledby="tab-edit" className="card" hidden={tab !== "edit"}>
        {observations.error && <ErrorState error={observations.error} onRetry={observations.reload} />}
        {observations.loading && !observations.data && <LoadingState label="Loading data…" />}
        {observations.data && (
          <DataEditor
            observations={observations.data.observations}
            dataStart={user.data_start}
            edits={edits}
            onEditsChange={setEdits}
            onSaved={() => setVersion((v) => v + 1)}
            userId={user.user_id}
            busy={generating}
          />
        )}
      </section>

      <div id="panel-dashboard" role="tabpanel" aria-labelledby="tab-dashboard" className="flex flex-col gap-4" hidden={tab !== "dashboard"}>
        {baselines.loading && !baselines.data && <LoadingState label="Calculating baselines…" />}
        {baselines.error && <ErrorState error={baselines.error} onRetry={baselines.reload} />}
        {baselines.data && (
          <>
            <DataQualityStatus metrics={baselines.data.metrics} date={baselines.data.date} />
            <section aria-label="Metrics for the selected day" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {baselines.data.metrics.map((b) => (
                <MetricCard
                  key={b.metric}
                  baseline={b}
                  onCorrect={(value) => correct(b.metric, value)}
                  highlighted={insightMetrics.includes(b.metric)}
                />
              ))}
            </section>
          </>
        )}

        {observations.error && <ErrorState error={observations.error} onRetry={observations.reload} />}
        {observations.data && baselines.data && (
          <TrendChart observations={observations.data.observations} baselines={baselines.data.metrics} />
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <InsightFeed
              userId={user.user_id}
              date={date}
              version={version}
              onInsightMetrics={setInsightMetrics}
              onGeneratingChange={setGenerating}
            />
          </div>
          <NotesPanel userId={user.user_id} date={date} version={version} />
        </div>
      </div>
    </>
  );
}
