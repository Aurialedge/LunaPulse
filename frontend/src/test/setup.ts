import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom has no layout, so every element measures 0x0 and Recharts' ResponsiveContainer would render no chart.
// Give elements a plausible size so chart markup can be tested.
HTMLElement.prototype.getBoundingClientRect = function () {
  return { x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 256, width: 800, height: 256, toJSON() {} } as DOMRect;
};

// Radix UI (dialogs, menus, tabs) uses pointer-capture and scrollIntoView, which jsdom lacks.
Element.prototype.scrollIntoView = function () {};
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = function () {};

