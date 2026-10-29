import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../api/client";
import type { Observation } from "../api/types";
import { observations } from "../test/fixtures";
import { DataEditor, type Edits } from "./DataEditor";

const ROWS = observations.observations; // 2026-06-03 … 2026-06-30; steps missing on 2026-06-23
const saved = { user_id: "user_a", saved: 2, stale_run_count: 1, dates: ["2026-06-29", "2026-06-30"] };

/** DataEditor is controlled: the page owns the edits. This harness plays the page. */
function Harness({ rows = ROWS, dataStart = "2026-03-03", onSaved = vi.fn(), busy = false }: { rows?: Observation[]; dataStart?: string; onSaved?: () => void; busy?: boolean }) {
  const [edits, setEdits] = useState<Edits>({});
  return <DataEditor observations={rows} dataStart={dataStart} edits={edits} onEditsChange={setEdits} onSaved={onSaved} userId="user_a" busy={busy} />;
}

async function editCell(date: string, metric: string, text: string) {
  await userEvent.click(screen.getByTestId(`cell-${date}-${metric}`).querySelector("button")!);
  const input = screen.getByRole("textbox");
  await userEvent.clear(input);
  await userEvent.type(input, `${text}{Enter}`);
}

describe("DataEditor", () => {
  it("renders one row per observation with flagged cells marked", () => {
    render(<Harness />);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(29); // header + 28 days
    const missing = screen.getByTestId("cell-2026-06-23-steps");
    expect(missing).toHaveAttribute("data-flag", "missing");
    expect(missing).toHaveTextContent("—");
  });

  it("editing a cell marks it changed and shows the unsaved bar", async () => {
    render(<Harness />);
    await editCell("2026-06-30", "sleep_hours", "7.2");
    expect(screen.getByTestId("cell-2026-06-30-sleep_hours")).toHaveAttribute("data-changed", "true");
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
  });

  it("reverting a cell to its original value clears the change", async () => {
    render(<Harness />);
    await editCell("2026-06-30", "sleep_hours", "7.2");
    await editCell("2026-06-30", "sleep_hours", "7.5");
    expect(screen.getByTestId("cell-2026-06-30-sleep_hours")).toHaveAttribute("data-changed", "false");
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument();
  });

  it("invalid cell input blocks save", async () => {
    render(<Harness />);
    await editCell("2026-06-30", "sleep_hours", "abc");
    expect(screen.getByTestId("cell-2026-06-30-sleep_hours")).toHaveTextContent("Enter a number");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("save sends every change in one request and reports success", async () => {
    const correct = vi.spyOn(api, "correctBatch").mockResolvedValue(saved);
    const onSaved = vi.fn();
    render(<Harness onSaved={onSaved} />);
    await editCell("2026-06-30", "sleep_hours", "6.6");
    await editCell("2026-06-29", "steps", "12000");
    expect(screen.getByText("2 unsaved changes")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(correct).toHaveBeenCalledTimes(1);
    expect(correct.mock.calls[0][0]).toBe("user_a");
    expect(correct.mock.calls[0][1]).toEqual(expect.arrayContaining([
      { date: "2026-06-30", metric: "sleep_hours", value: 6.6 },
      { date: "2026-06-29", metric: "steps", value: 12000 },
    ]));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument();
  });

  it("save button is disabled while saving", async () => {
    let finish: (value: typeof saved) => void = () => {};
    const correct = vi.spyOn(api, "correctBatch").mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<Harness />);
    await editCell("2026-06-30", "sleep_hours", "6.6");
    const button = screen.getByRole("button", { name: "Save changes" });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(correct).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();
    finish(saved);
  });

  it("backend errors are shown in the bar", async () => {
    vi.spyOn(api, "correctBatch").mockRejectedValue(
      new ApiError(422, "invalid_value", "2026-06-30: Sleep must be between 0 and 24 hours."),
    );
    render(<Harness />);
    await editCell("2026-06-30", "sleep_hours", "6.6");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sleep must be between 0 and 24 hours.");
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
  });

  it("discard clears all edits", async () => {
    render(<Harness />);
    await editCell("2026-06-30", "sleep_hours", "6.6");
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument();
    expect(screen.getByTestId("cell-2026-06-30-sleep_hours")).toHaveAttribute("data-changed", "false");
  });

  it("escape cancels a cell edit", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByTestId("cell-2026-06-30-sleep_hours").querySelector("button")!);
    await userEvent.type(screen.getByRole("textbox"), "9{Escape}");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument();
  });

  it("days before the data start are not shown", () => {
    render(<Harness dataStart="2026-06-08" />);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(24); // header + 23 days
    expect(screen.queryByTestId("cell-2026-06-07-steps")).not.toBeInTheDocument();
  });

  // --- keyboard (review #2) ---

  it("enter saves the cell and moves to the next one", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Steps on 2026-06-30" }));
    await userEvent.type(screen.getByRole("textbox"), "{Control>}a{/Control}9000{Enter}");
    expect(screen.getByRole("textbox", { name: "Sleep on 2026-06-30" })).toHaveFocus();
    expect(screen.getByTestId("cell-2026-06-30-steps")).toHaveAttribute("data-changed", "true");
  });

  it("tab moves to the next row at the end of a row, shift+tab moves back", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Edit HRV on 2026-06-30" }));
    await userEvent.tab();
    expect(screen.getByRole("textbox", { name: "Steps on 2026-06-29" })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("textbox", { name: "HRV on 2026-06-30" })).toHaveFocus();
  });

  it("escape returns focus to the cell", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Sleep on 2026-06-30" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Edit Sleep on 2026-06-30" })).toHaveFocus();
  });

  // --- accessibility of flags and errors (review #5) ---

  it("flagged cells describe their flag, not just a colour", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Edit Steps on 2026-06-23" })).toHaveAccessibleDescription("Steps: Missing");
  });

  it("an invalid value's error is linked to its cell", async () => {
    render(<Harness />);
    await editCell("2026-06-30", "sleep_hours", "abc");
    expect(screen.getByRole("button", { name: "Edit Sleep on 2026-06-30" })).toHaveAccessibleDescription(/Enter a number/);
  });

  // --- no save while insights are being recalculated (review #1) ---

  it("save is disabled while insights are being recalculated", async () => {
    render(<Harness busy />);
    await editCell("2026-06-30", "sleep_hours", "6.6");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByText(/Wait for the insight recalculation to finish/)).toBeInTheDocument();
  });
});
