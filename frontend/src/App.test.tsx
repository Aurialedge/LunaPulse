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

describe("App", () => {
  it("renders the branded dashboard from backend responses", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "LunaPulse" })).toBeInTheDocument();
    expect(screen.getByText("Your wearable data, explained with evidence.")).toBeInTheDocument();
    expect(screen.getByText(/All data is synthetic/)).toBeInTheDocument();

    const cards = await screen.findByRole("region", { name: "Metrics for the selected day" });
    expect(within(cards).getByTestId("metric-steps-value")).toHaveTextContent("10,658 steps");
    expect(within(cards).getByTestId("metric-sleep_hours-baseline")).toHaveTextContent("6.59 h");
    expect(await screen.findByText("Explanations: Template fallback (no API key)")).toBeInTheDocument();
    expect(await screen.findAllByTestId("insight-card")).toHaveLength(1);
    expect(api.baselines).toHaveBeenCalledWith("user_a", "2026-06-30");
    expect(api.feed).toHaveBeenCalledWith("user_a", "2026-06-30", false);
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

  it("applying a scenario regenerates data and refreshes every panel", async () => {
    const regenerate = vi.spyOn(api, "generateSimulation").mockResolvedValue({
      user_id: "user_a", scenario: "stable_baseline", seed: 42, days: 120, start_date: "", end_date: "",
      reading_count: 480, note_count: 0,
    });
    render(<App />);
    await screen.findByRole("region", { name: "Metrics for the selected day" });
    const before = vi.mocked(api.baselines).mock.calls.length;
    await userEvent.selectOptions(screen.getByLabelText("Demo scenario"), "stable_baseline");
    await userEvent.click(screen.getByRole("button", { name: "Regenerate data" }));
    expect(regenerate).toHaveBeenCalledWith("user_a", "stable_baseline");
    await waitFor(() => expect(vi.mocked(api.baselines).mock.calls.length).toBeGreaterThan(before));
    expect(api.users).toHaveBeenCalledTimes(2);
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

  it("tabs switch between dashboard and data editor", async () => {
    render(<App />);
    await screen.findByRole("region", { name: "Metrics for the selected day" });
    expect(screen.getByRole("tab", { name: "Dashboard" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "Edit data" }));
    expect(screen.getByRole("tab", { name: "Edit data" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("region", { name: "Metrics for the selected day" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit data" })).toBeInTheDocument();
  });

  it("shows an error state when the API is down", async () => {
    vi.spyOn(api, "users").mockRejectedValue(new ApiError(0, "network_error", "Could not reach the LunaPulse API."));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the LunaPulse API.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
