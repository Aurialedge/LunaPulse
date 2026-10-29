import { Activity, FlaskConical } from "lucide-react";
import type { Health } from "../api/types";

export function Header({ health }: { health: Health | null }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-blue-700 text-white">
            <Activity className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">PulseLens</h1>
            <p className="text-sm text-slate-600">Your wearable data, explained with evidence.</p>
          </div>
        </div>
        {health && (
          <span className="chip bg-slate-100 text-slate-700" title="Which explanation service the backend will use">
            Explanations: {health.llm_mode === "gemini" ? "Gemini (validated)" : "Template fallback (no API key)"}
          </span>
        )}
      </div>
      <div className="bg-amber-50 text-amber-900">
        <p className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-2 text-xs sm:text-sm">
          <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
          Research demo prototype. All data is synthetic, not real measurements. Nothing here is a diagnosis or
          medical advice.
        </p>
      </div>
    </header>
  );
}

const PROVIDER_TEXT: Record<string, { label: string; style: string }> = {
  gemini: { label: "Explained by Gemini", style: "bg-violet-100 text-violet-800" },
  fallback: { label: "Template explanation", style: "bg-slate-100 text-slate-700" },
  mixed: { label: "Gemini + template", style: "bg-violet-50 text-violet-800" },
  none: { label: "No insights to explain", style: "bg-slate-100 text-slate-600" },
};

const FALLBACK_REASON: Record<string, string> = {
  no_api_key: "no Gemini API key is configured",
  provider_error: "Gemini was unavailable",
  invalid_response: "Gemini's answer was not valid JSON",
  validation_failed: "Gemini's answer failed the evidence check",
};

export function ProviderBadge({ provider, reason }: { provider: string; reason: string | null }) {
  const info = PROVIDER_TEXT[provider] ?? PROVIDER_TEXT.none;
  const why = reason ? FALLBACK_REASON[reason] ?? reason : null;
  return (
    <span className={`chip ${info.style}`} title={why ? `Template used because ${why}.` : undefined}>
      {info.label}
      {why && <span className="font-normal">· {why}</span>}
    </span>
  );
}
