import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { badgeVariants } from "../components/ui/badge";

// WCAG AA for the colour pairs the UI actually uses (design.md §16). Tokens are read from index.css.
const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf-8"); // vitest runs from frontend/
const token = (name: string): string => {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`token --color-${name} not found`);
  return match[1];
};

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** `fg` at `alpha` over a white card, as Tailwind's `bg-x/10` renders it. */
const tint = (fg: string, alpha: number) =>
  "#" + rgb(fg).map((c) => Math.round(alpha * c + (1 - alpha) * 255).toString(16).padStart(2, "0")).join("");

describe("colour contrast (WCAG AA)", () => {
  it.each([
    ["body text on cards", "foreground", "card"],
    ["secondary text on cards", "muted-foreground", "card"],
    ["secondary text on the page", "muted-foreground", "background"],
    ["inactive tabs and table headers on grey surfaces", "muted-strong", "secondary"],
  ])("%s reach 4.5:1", (_, fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["accent badge / active nav", "primary-strong", "primary"],
    ["positive badge", "positive-strong", "positive"],
    ["warning badge", "warning-foreground", "warning"],
  ])("%s text reaches 4.5:1 on its 10%% tint", (_, fg, base) => {
    expect(contrast(token(fg), tint(token(base), 0.1))).toBeGreaterThanOrEqual(4.5);
  });

  it("input borders reach the 3:1 non-text minimum", () => {
    expect(contrast(token("input"), token("card"))).toBeGreaterThanOrEqual(3);
  });

  it("tinted badges use the strong text tokens", () => {
    expect(badgeVariants({ variant: "default" })).toContain("text-primary-strong");
    expect(badgeVariants({ variant: "positive" })).toContain("text-positive-strong");
    expect(badgeVariants({ variant: "warning" })).toContain("text-warning-foreground");
  });
});
