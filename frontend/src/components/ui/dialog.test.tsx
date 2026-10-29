import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

describe("Dialog", () => {
  it("renders open without React ref warnings", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("dialog", { name: "Title" })).toBeInTheDocument();
    expect(error.mock.calls.flat().join(" ")).not.toMatch(/cannot be given refs/);
  });
});
