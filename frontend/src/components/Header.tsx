import { FlaskConical, Sparkles } from "lucide-react";
import type { Health } from "../api/types";

/** Crescent moon with a pulse line: the LunaPulse mark. */
function LogoMark() {
  return (
    <span className="relative grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-700 shadow-[0_0_24px_rgb(139_92_246/0.6)]">
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <path d="M15.5 3.5a8.5 8.5 0 1 0 5 15.3A7 7 0 0 1 15.5 3.5z" fill="rgb(255 255 255 / 0.25)" />
        <path d="M3 13h3.5l1.8-4 3 8 2-5.5 1.2 1.5H21" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function Header({ health }: { health: Health | null }) {
  return (
    <header>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <h1 className="text-xl font-bold tracking-tight">LunaPulse</h1>
            <p className="text-sm text-ink-soft">Your wearable data, explained with evidence.</p>
          </div>
        </div>
        {health && (
          <span
            className="chip border border-line bg-glass text-brand-soft"
            title="Which explanation service the backend will use"
          >
            <Sparkles className="size-3.5" aria-hidden />
            Explanations: {health.llm_mode === "gemini" ? "Gemini (validated)" : "Template fallback (no API key)"}
          </span>
        )}
      </div>
      <div className="mx-auto max-w-6xl px-4">
        <p className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200 sm:text-sm">
          <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
          Research demo prototype. All data is synthetic, not real measurements. Nothing here is a diagnosis or
          medical advice.
        </p>
      </div>
    </header>
  );
}

const PROVIDER_TEXT: Record<string, { label: string; style: string }> = {
  gemini: { label: "Explained by Gemini", style: "bg-violet-500/15 text-violet-200 border border-violet-400/30" },
  fallback: { label: "Template explanation", style: "bg-glass text-ink-soft border border-line" },
  mixed: { label: "Gemini + template", style: "bg-violet-500/10 text-violet-200 border border-violet-400/20" },
  none: { label: "No insights to explain", style: "bg-glass text-ink-muted border border-line" },
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
