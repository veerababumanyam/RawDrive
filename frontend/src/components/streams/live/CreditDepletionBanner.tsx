"use client";

/**
 * CreditDepletionBanner — server-authoritative depletion warning.
 * Client renders only; it never advances phase on its own.
 * TODO: real-time — subscribe to depletion.* SSE events via useCreditDepletion.
 */

export type DepletionPhase = "ok" | "warn5" | "warn1" | "warn30" | "grace" | "ended";

export interface CreditDepletionBannerProps {
  phase: DepletionPhase;
  remainingSec: number;
}

const COPY: Record<Exclude<DepletionPhase, "ok" | "ended">, { label: string; tone: string }> = {
  warn5: {
    label: "Low balance: about 5 minutes of stream credit remaining. Recharge to avoid interruption.",
    tone: "border-feedback-warning/30 bg-feedback-warning/10 text-feedback-warning",
  },
  warn1: {
    label: "Low balance: about 1 minute of stream credit remaining. Recharge now.",
    tone: "border-feedback-warning/50 bg-feedback-warning/15 text-feedback-warning",
  },
  warn30: {
    label: "Critical: ~30 seconds of stream credit left. Stream will auto-end shortly.",
    tone: "border-feedback-error/40 bg-feedback-error/15 text-feedback-error",
  },
  grace: {
    label: "Credits depleted — 30-second grace window to recharge before auto-end.",
    tone: "border-feedback-error/60 bg-feedback-error/20 text-feedback-error",
  },
};

export function CreditDepletionBanner({ phase, remainingSec }: CreditDepletionBannerProps) {
  if (phase === "ok" || phase === "ended") return null;
  const entry = COPY[phase];
  if (!entry) return null;

  return (
    <div
      role="alert"
      data-testid="credit-depletion-banner"
      data-phase={phase}
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${entry.tone}`}
    >
      <span>{entry.label}</span>
      <span className="font-mono text-xs opacity-80">{Math.max(0, remainingSec)}s</span>
    </div>
  );
}
