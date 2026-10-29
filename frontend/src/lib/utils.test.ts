import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("cn merges and de-duplicates Tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    const hidden = false;
    expect(cn("text-sm", hidden && "hidden", "font-medium")).toBe("text-sm font-medium");
  });
});
