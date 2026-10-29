import { useState } from "react";
import { api } from "./api/client";
import type { Metric, Scenario, User } from "./api/types";
import { Controls } from "./components/Controls";
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

  const user = users.data?.find((u) => u.user_id === userId) ?? users.data?.[0] ?? null;
  const selectedDate = date ?? (user ? defaultDate(user) : null);

  return (
    <div className="min-h-screen">
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

interface DashboardProps {
  users: User[];
  user: User;
  date: string;
  scenarios: Scenario[];
  onUserChange: (userId: string) => void;
  onDateChange: (date: string) => void;
  onDataRegenerated: () => void;
}

function Dashboard({ users, user, date, scenarios, onUserChange, onDateChange, onDataRegenerated }: DashboardProps) {
  // Bumped whenever this user's data changes, so every panel re-fetches from the backend.
  const [version, setVersion] = useState(0);
  const baselines = useAsync(() => api.baselines(user.user_id, date), [user.user_id, date, version, user.data_end]);
  const observations = useAsync(() => api.observations(user.user_id, date), [user.user_id, date, version, user.data_end]);

  async function applyScenario(scenario: string) {
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
        onUserChange={onUserChange}
        onDateChange={onDateChange}
        onApplyScenario={applyScenario}
      />

      {baselines.loading && !baselines.data && <LoadingState label="Calculating baselines…" />}
      {baselines.error && <ErrorState error={baselines.error} onRetry={baselines.reload} />}
      {baselines.data && (
        <>
          <DataQualityStatus metrics={baselines.data.metrics} date={baselines.data.date} />
          <section aria-label="Metrics for the selected day" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {baselines.data.metrics.map((b) => (
              <MetricCard key={b.metric} baseline={b} onCorrect={(value) => correct(b.metric, value)} />
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
          <InsightFeed userId={user.user_id} date={date} version={version} />
        </div>
        <NotesPanel userId={user.user_id} date={date} version={version} />
      </div>
    </>
  );
}
