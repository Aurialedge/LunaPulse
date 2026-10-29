// The only module that calls fetch. Components use these typed functions.
import type {
  BaselinesResponse,
  CorrectionResponse,
  EvidenceRecord,
  Feed,
  FeedbackAction,
  FeedbackResponse,
  GenerateSimulationResponse,
  Health,
  Metric,
  Note,
  ObservationsResponse,
  Scenario,
  User,
} from "./types";

const BASE = "/api/v1";

/** A backend error: `{"error": {"code", "message"}}`, or a network failure (code "network_error"). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(BASE + path, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new ApiError(0, "network_error", "Could not reach the PulseLens API. Is the backend running?");
  }
  if (!response.ok) {
    let code = "http_error";
    let message = `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // not JSON: keep the generic message
    }
    throw new ApiError(response.status, code, message);
  }
  return response.json() as Promise<T>;
}

function query(params: Record<string, string | boolean | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string | boolean][];
  return entries.length ? "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : "";
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const api = {
  health: () => request<Health>("/health"),
  users: () => request<User[]>("/users"),
  scenarios: () => request<Scenario[]>("/simulation/scenarios"),
  generateSimulation: (userId: string, scenario: string) =>
    request<GenerateSimulationResponse>("/simulation/generate", post({ user_id: userId, scenario })),
  observations: (userId: string, end: string) =>
    request<ObservationsResponse>(`/users/${userId}/observations${query({ end })}`),
  baselines: (userId: string, date: string) =>
    request<BaselinesResponse>(`/users/${userId}/baselines${query({ date })}`),
  feed: (userId: string, date: string, includeHidden = false) =>
    request<Feed>(`/users/${userId}/insights${query({ date, include_hidden: includeHidden || undefined })}`),
  generateInsights: (userId: string, date: string, force: boolean) =>
    request<Feed>(`/users/${userId}/insights/generate`, post({ date, force })),
  evidence: (insightId: string) => request<EvidenceRecord[]>(`/insights/${insightId}/evidence`),
  feedback: (insightId: string, action: FeedbackAction) =>
    request<FeedbackResponse>(`/insights/${insightId}/feedback`, post({ action })),
  notes: (userId: string, date: string) => request<Note[]>(`/users/${userId}/notes${query({ date })}`),
  addNote: (userId: string, date: string, text: string) =>
    request<Note>(`/users/${userId}/notes`, post({ date, text })),
  correct: (userId: string, date: string, metric: Metric, value: number) =>
    request<CorrectionResponse>(`/users/${userId}/corrections`, post({ date, metric, value })),
};
