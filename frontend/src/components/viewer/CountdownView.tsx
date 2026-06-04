"use client";

/**
 * CountdownView — story 35-1 T3.
 *
 * Pre-live countdown sub-view shown when the stream state is `scheduled`.
 * Server is authoritative on transitions — this view is purely informational.
 *
 * Hydration safety (DEF-1): the FIRST render (SSR + first client paint) must be
 * deterministic, so `now` is seeded from `scheduledAt` (diff = 0) and the locale
 * timestamp is withheld until the mounted gate opens. Only after mount do we tick
 * `Date.now()` and emit `toLocaleString()`, which differ between server and client.
 *
 * Invalid/missing schedule (DEF-2): when `scheduledAt` is empty or unparseable we
 * render a calm "Starting soon" pending state instead of a fabricated 00:00:00
 * countdown.
 */

import { useEffect, useState, useSyncExternalStore } from "react";

export interface CountdownViewProps {
  scheduledAt: string;
  brandName?: string;
  onElapsed?: () => void;
}

// Hydration-safe "is mounted" gate. `useSyncExternalStore` is the React 18+
// correct primitive — `getServerSnapshot` returns false (SSR), `getSnapshot`
// returns true (client). This avoids the `react-hooks/set-state-in-effect`
// lint rule that fires on the naive `useEffect(() => setMounted(true), [])`
// pattern, matching the convention in ThemeToggleButton.tsx.
const subscribeMounted = () => () => {};
const getMountedSnapshot = () => true;
const getMountedServerSnapshot = () => false;

function diffParts(targetMs: number, nowMs: number) {
  const ms = Math.max(0, targetMs - nowMs);
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { ms, days, hours, minutes, seconds };
}

export function CountdownView({
  scheduledAt,
  brandName,
  onElapsed,
}: CountdownViewProps) {
  const target = new Date(scheduledAt).getTime();
  const validTarget = !Number.isNaN(target);

  const mounted = useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getMountedServerSnapshot,
  );
  // Seed `now` so the pre-mount diff is deterministic (exactly 0). For an
  // invalid target we fall back to Date.now(), but that branch never reaches
  // the countdown render — it short-circuits to the pending state below.
  const [now, setNow] = useState<number>(() =>
    validTarget ? target : Date.now(),
  );

  useEffect(() => {
    if (!validTarget) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [validTarget]);

  const parts = diffParts(target, now);

  useEffect(() => {
    if (validTarget && parts.ms === 0 && onElapsed) onElapsed();
  }, [validTarget, parts.ms, onElapsed]);

  // Invalid / missing schedule — calm pending state, never a 00:00:00 countdown.
  if (!validTarget) {
    return (
      <section
        data-testid="viewer-countdown-pending"
        className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 rounded-2xl glass-card p-8 text-center"
        aria-label="Stream countdown"
      >
        {brandName && (
          <p className="text-sm font-medium text-text-secondary">{brandName}</p>
        )}
        <h1 className="text-2xl font-semibold text-text-primary">
          Starting soon
        </h1>
        <p className="text-sm text-text-secondary">
          This stream will begin shortly.
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid="viewer-countdown"
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 rounded-2xl glass-card p-8 text-center"
      aria-label="Stream countdown"
    >
      {brandName && (
        <p className="text-sm font-medium text-text-secondary">{brandName}</p>
      )}
      <h1 className="text-2xl font-semibold text-text-primary">
        Stream starts in
      </h1>
      <div className="grid grid-cols-4 gap-3 text-text-primary">
        {[
          { v: parts.days, l: "Days" },
          { v: parts.hours, l: "Hours" },
          { v: parts.minutes, l: "Minutes" },
          { v: parts.seconds, l: "Seconds" },
        ].map((p) => (
          <div key={p.l} className="rounded-xl bg-surface-base px-3 py-3">
            <div className="text-2xl font-semibold tabular-nums">
              {mounted ? String(p.v).padStart(2, "0") : "--"}
            </div>
            <div className="text-xs uppercase tracking-wide text-text-tertiary">
              {p.l}
            </div>
          </div>
        ))}
      </div>
      {mounted ? (
        <p className="text-xs text-text-tertiary">
          Scheduled for {new Date(scheduledAt).toLocaleString()}
        </p>
      ) : null}
    </section>
  );
}

export default CountdownView;
