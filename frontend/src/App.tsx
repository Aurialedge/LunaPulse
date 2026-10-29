import { useState } from "react";
import { Toaster } from "sonner";
import { api } from "./api/client";
import type {
  Health,
  Metric,
  MetricBaseline,
  Scenario,
  User,
} from "./api/types";
import { CorrectionDialog } from "./components/CorrectionDialog";
import { DataEditor, type Edits } from "./components/DataEditor";
import { DataQualityStatus } from "./components/DataQualityStatus";
import { InsightFeed } from "./components/InsightFeed";
import { AppLayout } from "./components/layout/AppLayout";
import type { NavTarget, View } from "./components/layout/Sidebar";
import { TopBar, type DataStatus } from "./components/layout/TopBar";
import { MetricCard, MetricCardSkeleton } from "./components/MetricCard";
import { NotesPanel } from "./components/NotesPanel";
import { ErrorState, LoadingState } from "./components/StateViews";
import { TrendChart, TrendChartSkeleton } from "./components/TrendChart";
import { formatDate } from "./format";
import { useAsync } from "./hooks/useAsync";

const PAGES: Record<
  View,
  { title: string; heading: string; description: string }
> = {
  overview: {
    title: "Overview",
    heading: "Your daily insights",
    description:
      "Understand what changed in your wearable data, with the evidence behind every insight.",
  },
  trends: {
    title: "Trends",
    heading: "Trends",
    description:
      "Each metric over the last 7 or 28 days, against your personal baseline.",
  },
  insights: {
    title: "Insights",
    heading: "Insights",
    description:
      "The most notable changes for the selected day, with the evidence behind each one, and your notes.",
  },
  edit: { title: "Edit data", heading: "Edit data", description: "" },
};

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
  const [view, setView] = useState<View>("overview");

  const user =
    users.data?.find((u) => u.user_id === userId) ?? users.data?.[0] ?? null;
  const selectedDate = date ?? (user ? defaultDate(user) : null);

  function navigate(target: NavTarget) {
    setView(target);
    window.scrollTo?.({ top: 0 });
  }

  if (!user || !selectedDate || !scenarios.data) {
    return (
      <AppLayout view={view} onNavigate={navigate} health={health.data}>
        {(users.loading || scenarios.loading) &&
          !users.error &&
          !scenarios.error && <LoadingState label="Loading synthetic users…" />}
        {users.error && (
          <ErrorState error={users.error} onRetry={users.reload} />
        )}
        {scenarios.error && (
          <ErrorState error={scenarios.error} onRetry={scenarios.reload} />
        )}
      </AppLayout>
    );
  }

  return (
    <Workspace
      key={user.user_id}
      health={health.data}
      users={users.data!}
      user={user}
      date={selectedDate}
      scenarios={scenarios.data}
      view={view}
      onNavigate={navigate}
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
  );
}

interface WorkspaceProps {
  health: Health | null;
  users: User[];
  user: User;
  date: string;
  scenarios: Scenario[];
  view: View;
  onNavigate: (target: NavTarget) => void;
  onUserChange: (userId: string) => void;
  onDateChange: (date: string) => void;
  onDataRegenerated: () => void;
}

/** Everything for one selected user. Keyed by user, so switching users starts clean. */
function Workspace({
  health,
  users,
  user,
  date,
  scenarios,
  view,
  onNavigate,
  onUserChange,
  onDateChange,
  onDataRegenerated,
}: WorkspaceProps) {
  // Bumped whenever this user's data changes (or on Refresh), so every panel re-fetches from the backend.
  const [version, setVersion] = useState(0);
  const [insightMetrics, setInsightMetrics] = useState<Metric[]>([]);
  // Unsaved data-editor changes. They live here so they survive switching views.
  const [edits, setEdits] = useState<Edits>({});
  const [generating, setGenerating] = useState(false);
  const [correcting, setCorrecting] = useState<MetricBaseline | null>(null); // metric open in the correction dialog
  const baselines = useAsync(
    () => api.baselines(user.user_id, date),
    [user.user_id, date, version, user.data_end],
  );
  const observations = useAsync(
    () => api.observations(user.user_id, date),
    [user.user_id, date, version, user.data_end],
  );

  const status: DataStatus =
    baselines.loading || observations.loading
      ? "loading"
      : baselines.error || observations.error
        ? "unavailable"
        : "loaded";

  /** True when it's fine to throw away unsaved edits (none, or the user confirms). */
  function mayDiscardEdits(): boolean {
    const count = Object.keys(edits).length;
    if (count === 0) return true;
    const ok = window.confirm(
      `You have ${count} unsaved change${count === 1 ? "" : "s"} in the data editor. Discard them?`,
    );
    if (ok) setEdits({});
    return ok;
  }

  async function applyScenario(scenario: string) {
    if (!mayDiscardEdits()) return;
    await api.generateSimulation(user.user_id, scenario);
    setVersion((v) => v + 1);
    onDataRegenerated();
  }

  // The date the shown values belong to (from the response), not a newly picked date that is still loading
  const valuesDate = baselines.data?.date ?? date;

  async function correct(metric: Metric, value: number) {
    await api.correct(user.user_id, valuesDate, metric, value);
    setVersion((v) => v + 1);
  }

  return (
    <AppLayout
      view={view}
      onNavigate={onNavigate}
      health={health}
      toaster={<Toaster position="bottom-right" closeButton />}
      topBar={
        <TopBar
          title={PAGES[view].title}
          users={users}
          user={user}
          date={date}
          scenarios={scenarios}
          status={status}
          onUserChange={(id) => mayDiscardEdits() && onUserChange(id)}
          onDateChange={(d) => mayDiscardEdits() && onDateChange(d)}
          onRefresh={() => setVersion((v) => v + 1)}
          onApplyScenario={applyScenario}
        />
      }
    >
      {/* Both views stay mounted (only hidden), so a running recalculation and unsaved edits survive switching. */}
      <section
        aria-label="Edit data"
        className="rounded-xl border border-border bg-card p-5 shadow-xs"
        hidden={view !== "edit"}
      >
        {observations.error && (
          <ErrorState
            error={observations.error}
            onRetry={observations.reload}
          />
        )}
        {observations.loading && !observations.data && (
          <LoadingState label="Loading data…" />
        )}
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

      {/* Overview shows every panel; Trends and Insights show one each. Panels stay mounted (only hidden). */}
      <div className="flex flex-col gap-6" hidden={view === "edit"}>
        <header className="flex flex-col gap-1.5">
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight lg:text-[30px]">
            {PAGES[view].heading}
          </h1>
          <p className="text-[15px] text-muted-foreground">
            {PAGES[view].description}
          </p>
          <p
            data-testid="user-context"
            className="text-[13px] text-muted-foreground"
          >
            <span className="font-medium text-foreground">
              {user.display_name}
            </span>{" "}
            · {user.profile_description} · Goals{" "}
            {user.activity_goal_steps.toLocaleString("en-US")} steps ·{" "}
            {user.sleep_target_hours} h sleep · {user.timezone} ·{" "}
            <span className="font-medium text-foreground">
              {formatDate(date)}
            </span>
          </p>
        </header>

        <div className="flex flex-col gap-6" hidden={view !== "overview"}>
          {baselines.loading && !baselines.data && (
            <section
              aria-label="Loading metrics"
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            >
              {[0, 1, 2, 3].map((i) => (
                <MetricCardSkeleton key={i} />
              ))}
            </section>
          )}
          {baselines.error && (
            <ErrorState error={baselines.error} onRetry={baselines.reload} />
          )}
          {baselines.data && (
            <>
              <section
                aria-label="Metrics for the selected day"
                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
              >
                {baselines.data.metrics.map((b) => (
                  <MetricCard
                    key={b.metric}
                    baseline={b}
                    onCorrect={() => setCorrecting(b)}
                    highlighted={insightMetrics.includes(b.metric)}
                    stale={baselines.loading}
                    history={observations.data?.observations}
                  />
                ))}
              </section>
              <DataQualityStatus
                metrics={baselines.data.metrics}
                date={baselines.data.date}
              />
            </>
          )}
        </div>

        <CorrectionDialog
          metric={correcting}
          date={valuesDate}
          onOpenChange={(open) => !open && setCorrecting(null)}
          onSubmit={(value) => correct(correcting!.metric, value)}
        />

        <div hidden={view === "insights"}>
          {observations.error && (
            <ErrorState
              error={observations.error}
              onRetry={observations.reload}
            />
          )}
          {(observations.loading || baselines.loading) &&
            !(observations.data && baselines.data) && <TrendChartSkeleton />}
          {observations.data && baselines.data && (
            <TrendChart
              observations={observations.data.observations}
              baselines={baselines.data.metrics}
              active={view === "overview" || view === "trends"}
            />
          )}
        </div>

        <div className="grid gap-6 xl:grid-cols-3" hidden={view === "trends"}>
          <div className="xl:col-span-2">
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
    </AppLayout>
  );
}
