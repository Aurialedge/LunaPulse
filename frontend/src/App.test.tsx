import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { api, ApiError } from "./api/client";
import { baselines, evidence, feed, health, observations, scenarios, userA, userB } from "./test/fixtures";

beforeEach(() => {
  vi.spyOn(api, "health").mockResolvedValue(health);
  vi.spyOn(api, "users").mockResolvedValue([userA, userB]);
  vi.spyOn(api, "scenarios").mockResolvedValue(scenarios);
  vi.spyOn(api, "baselines").mockResolvedValue(baselines);
  vi.spyOn(api, "observations").mockResolvedValue(observations);
  vi.spyOn(api, "feed").mockResolvedValue(feed);
  vi.spyOn(api, "notes").mockResolvedValue([]);
  vi.spyOn(api, "evidence").mockResolvedValue(evidence);
});

const mainNav = () => screen.getByRole("navigation", { name: "Main" });

describe("App shell", () => {
  it("renders the app shell and the dashboard from backend responses", async () => {
    render(<App />);
    expect(within(mainNav()).getByText("LunaPulse")).toBeInTheDocument();
    expect(screen.getAllByText(/All data is synthetic/).length).toBeGreaterThan(0);

    const cards = await screen.findByRole("region", { name: "Metrics for the selected day" });
    expect(within(cards).getByTestId("metric-steps-value")).toHaveTextContent("10,658 steps");
    expect(within(cards).getByTestId("metric-sleep_hours-baseline")).toHaveTextContent("6.59 h");
    expect(await screen.findByText("Explanations: Template fallback (no API key)")).toBeInTheDocument();
    expect(await screen.findAllByTestId("insight-card")).toHaveLength(1);
    expect(api.baselines).toHaveBeenCalledWith("user_a", "2026-06-30");
    expect(api.feed).toHaveBeenCalledWith("user_a", "2026-06-30", false);
  });

  it("overview has the page heading and user context", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: "Your daily insights" })).toBeInTheDocument();
    expect(screen.getByText(/Understand what changed in your wearable data/)).toBeInTheDocument();
    expect(screen.getByTestId("user-context")).toHaveTextContent("User A");
    expect(screen.getByTestId("user-context")).toHaveTextContent("Goals 10,000 steps · 7.5 h sleep");
  });

  it("metric skeletons while loading", async () => {
    vi.spyOn(api, "baselines").mockReturnValue(new Promise(() => {}));
    render(<App />);
    expect(await screen.findAllByTestId("metric-skeleton")).toHaveLength(4);
  });

  it("sidebar switches between overview and the data editor", async () => {
    render(<App />);
    await screen.findByRole("region", { name: "Metrics for the selected day" });
    expect(within(mainNav()).getByRole("button", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(within(mainNav()).getByRole("button", { name: "Edit data" }));
    expect(within(mainNav()).getByRole("button", { name: "Edit data" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("region", { name: "Metrics for the selected day" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit data" })).toBeInTheDocument();
  });

  it("insights and trends links jump to their sections on the overview", async () => {
    render(<App />);
    await screen.findByRole("region", { name: "Metrics for the selected day" });
    await userEvent.click(within(mainNav()).getByRole("button", { name: "Edit data" }));
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    await userEvent.click(within(mainNav()).getByRole("button", { name: "Insights" }));
    expect(screen.getByRole("region", { name: "Metrics for the selected day" })).toBeInTheDocument();
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect(scroll.mock.contexts.at(-1)).toBe(document.getElementById("insights"));
  });

  it("mobile menu opens navigation and closes after choosing", async () => {
    render(<App />);
    await screen.findByRole("region", { name: "Metrics for the selected day" });
    await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const drawer = await screen.findByRole("dialog", { name: "Navigation" });
    await userEvent.click(within(drawer).getByRole("button", { name: "Edit data" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Edit data" })).toBeInTheDocument();
  });

  it("top bar shows the data status", async () => {
    render(<App />);
    expect(await screen.findByText("Data loaded")).toBeInTheDocument();
  });

  it("refresh re-fetches every panel", async () => {
    render(<App />);
    await screen.findByText("Data loaded");
    const counts = () => [api.baselines, api.observations, api.feed].map((f) => vi.mocked(f).mock.calls.length);
    const before = counts();
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => counts().forEach((n, i) => expect(n).toBeGreaterThan(before[i])));
  });

  it("switching user and date refetches for that selection", async () => {
    render(<App />);
    await screen.findByRole("region", { name: "Metrics for the selected day" });
    await userEvent.selectOptions(screen.getByLabelText("Synthetic user"), "user_b");
    await waitFor(() => expect(api.baselines).toHaveBeenCalledWith("user_b", "2026-06-30"));

    // jsdom does not emulate typing into <input type="date">, so set the value as the browser would
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-06-20" } });
    await waitFor(() => expect(api.baselines).toHaveBeenCalledWith("user_b", "2026-06-20"));
    expect(api.feed).toHaveBeenCalledWith("user_b", "2026-06-20", false);
  });

  it("demo data dialog regenerates the user's data and refreshes every panel", async () => {
    const regenerate = vi.spyOn(api, "generateSimulation").mockResolvedValue({
      user_id: "user_a", scenario: "stable_baseline", seed: 42, days: 120, start_date: "", end_date: "",
      reading_count: 480, note_count: 0,
    });
    render(<App />);
    await screen.findByRole("region", { name: "Metrics for the selected day" });
    const before = vi.mocked(api.baselines).mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Demo data" }));
    const dialog = await screen.findByRole("dialog", { name: "Demo data" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Demo scenario"), "stable_baseline");
    await userEvent.click(within(dialog).getByRole("button", { name: "Regenerate data" }));
    expect(regenerate).toHaveBeenCalledWith("user_a", "stable_baseline");
    await waitFor(() => expect(vi.mocked(api.baselines).mock.calls.length).toBeGreaterThan(before));
    expect(api.users).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Demo data" })).not.toBeInTheDocument());
  });

  it("a correction is sent for the selected day and the dashboard refreshes", async () => {
    const correct = vi.spyOn(api, "correct").mockResolvedValue({
      user_id: "user_a", date: "2026-06-30", metric: "sleep_hours", value: 6.6, unit: "hours", stale_run_count: 1, feed,
    });
    render(<App />);
    await screen.findByRole("region", { name: "Metrics for the selected day" });
    const feedCalls = vi.mocked(api.feed).mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Correct Sleep value" }));
    await userEvent.type(screen.getByLabelText(/Corrected value/), "6.6");
    await userEvent.click(screen.getByRole("button", { name: "Save correction" }));
    expect(correct).toHaveBeenCalledWith("user_a", "2026-06-30", "sleep_hours", 6.6);
    await waitFor(() => expect(vi.mocked(api.feed).mock.calls.length).toBeGreaterThan(feedCalls));
  });

  it("switching user with unsaved edits asks for confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);
    await screen.findByRole("region", { name: "Metrics for the selected day" });
    await userEvent.click(within(mainNav()).getByRole("button", { name: "Edit data" }));
    await userEvent.click(screen.getByTestId("cell-2026-06-30-sleep_hours").querySelector("button")!);
    await userEvent.type(screen.getByRole("textbox"), "{Control>}a{/Control}6.6{Enter}");
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Synthetic user"), "user_b");
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByLabelText("Synthetic user")).toHaveValue("user_a");
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();

    // edits survive switching views
    await userEvent.click(within(mainNav()).getByRole("button", { name: "Overview" }));
    await userEvent.click(within(mainNav()).getByRole("button", { name: "Edit data" }));
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
  }, 15_000);

  it("a running recalculation survives switching views and blocks saving edits", async () => {
    vi.spyOn(api, "feed").mockRejectedValue(new ApiError(404, "insights_not_generated", "No current insights."));
    vi.spyOn(api, "generateInsights").mockReturnValue(new Promise(() => {})); // still running
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Generate insights" }));
    expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled();

    await userEvent.click(within(mainNav()).getByRole("button", { name: "Edit data" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit Sleep on 2026-06-30" }));
    await userEvent.type(screen.getByRole("textbox"), "{Control>}a{/Control}6.6{Enter}");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

    await userEvent.click(within(mainNav()).getByRole("button", { name: "Overview" }));
    expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled();
  }, 15_000); // renders the whole page (chart + 112-cell table) several times in jsdom

  it("shows an error state when the API is down", async () => {
    vi.spyOn(api, "users").mockRejectedValue(new ApiError(0, "network_error", "Could not reach the LunaPulse API."));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the LunaPulse API.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
