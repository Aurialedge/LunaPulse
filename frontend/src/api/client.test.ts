import { describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./client";

function respond(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

describe("api client", () => {
  it("returns parsed JSON and builds query strings", async () => {
    const fetchMock = respond(200, { user_id: "user_a", date: "2026-06-30", metrics: [] });
    const result = await api.baselines("user_a", "2026-06-30");
    expect(result.date).toBe("2026-06-30");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/users/user_a/baselines?date=2026-06-30", expect.anything());
  });

  it("sends JSON bodies for POST", async () => {
    const fetchMock = respond(200, {});
    await api.generateInsights("user_a", "2026-06-30", true);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ date: "2026-06-30", force: true });
  });

  it("turns the backend error shape into an ApiError", async () => {
    respond(404, { error: { code: "insights_not_generated", message: "No current insights." } });
    const error = await api.feed("user_a", "2026-06-30").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: "insights_not_generated", message: "No current insights." });
  });

  it("reports network failures clearly", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await api.users().catch((e) => e);
    expect(error).toMatchObject({ code: "network_error" });
  });
});
