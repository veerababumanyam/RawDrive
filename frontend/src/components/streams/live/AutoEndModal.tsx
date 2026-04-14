"use client";

/**
 * AutoEndModal — mounts only when depletion phase is in {grace, ended}.
 * User can confirm manual end; server-authoritative for actual termination.
 * TODO: real-time — auto-dismiss on depletion.recovered SSE event.
 */

import type { DepletionPhase } from "./CreditDepletionBanner";

export interface AutoEndModalProps {
  phase: DepletionPhase;
  graceEndsAt: Date | null;
  onConfirmEnd: () => void;
  onDismiss: () => void;
}

export function AutoEndModal({ phase, graceEndsAt, onConfirmEnd, onDismiss }: AutoEndModalProps) {
  if (phase !== "grace" && phase !== "ended") return null;

  const heading = phase === "ended" ? "Stream ended" : "Auto-end imminent";
  const body =
    phase === "ended"
      ? "Credits ran out and the stream has been ended automatically."
      : "Credits are exhausted. Recharge within the 30-second grace window, or end the stream now.";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      data-testid="auto-end-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/70 p-6 shadow-2xl">
        <h2 className="mb-2 text-lg font-semibold text-white">{heading}</h2>
        <p className="mb-4 text-sm text-white/80">{body}</p>
        {graceEndsAt && (
          <p className="mb-4 font-mono text-xs text-white/60">
            Grace ends: {graceEndsAt.toISOString()}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          {phase === "grace" && (
            <button
              type="button"
              onClick={onDismiss}
              data-testid="auto-end-dismiss"
              className="rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/10"
            >
              Dismiss
            </button>
          )}
          <button
            type="button"
            onClick={onConfirmEnd}
            data-testid="auto-end-confirm"
            className="rounded-md bg-feedback-error/80 px-3 py-2 text-sm font-medium text-white hover:bg-feedback-error"
          >
            {phase === "ended" ? "Close" : "End stream now"}
          </button>
        </div>
      </div>
    </div>
  );
}
