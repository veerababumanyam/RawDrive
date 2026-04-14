"use client";

/**
 * EndedView — story 35-1 T3.
 *
 * Terminal sub-view shown when the stream has ended and replay is either
 * pending, expired, or unavailable.
 */

export interface EndedViewProps {
  replayStatus?: "pending" | "ready" | "expired";
}

export function EndedView({ replayStatus = "pending" }: EndedViewProps) {
  const copy =
    replayStatus === "expired"
      ? "This stream has ended and the replay is no longer available."
      : replayStatus === "ready"
        ? "This stream has ended. Loading replay..."
        : "This stream has ended. A replay will be available shortly.";

  return (
    <section
      data-testid="viewer-ended"
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 rounded-2xl glass-card p-8 text-center"
      aria-label="Stream ended"
    >
      <h1 className="text-2xl font-semibold text-text-primary">Stream ended</h1>
      <p className="text-sm text-text-secondary">{copy}</p>
    </section>
  );
}

export default EndedView;
