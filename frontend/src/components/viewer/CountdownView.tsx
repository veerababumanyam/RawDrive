"use client";

/**
 * CountdownView — story 35-1 T3.
 *
 * Pre-live countdown sub-view shown when the stream state is `scheduled`.
 * Server is authoritative on transitions — this view is purely informational.
 */

import { useEffect, useState } from "react";

export interface CountdownViewProps {
  scheduledAt: string;
  brandName?: string;
  onElapsed?: () => void;
}

function diffParts(targetMs: number, nowMs: number) {
  const ms = Math.max(0, targetMs - nowMs);
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { ms, days, hours, minutes, seconds };
}

export function CountdownView({ scheduledAt, brandName, onElapsed }: CountdownViewProps) {
  const target = new Date(scheduledAt).getTime();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const parts = diffParts(target, now);

  useEffect(() => {
    if (parts.ms === 0 && onElapsed) onElapsed();
  }, [parts.ms, onElapsed]);

  return (
    <section
      data-testid="viewer-countdown"
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 rounded-2xl glass-card p-8 text-center"
      aria-label="Stream countdown"
    >
      {brandName && (
        <p className="text-sm font-medium text-text-secondary">{brandName}</p>
      )}
      <h1 className="text-2xl font-semibold text-text-primary">Stream starts in</h1>
      <div className="grid grid-cols-4 gap-3 text-text-primary">
        {[
          { v: parts.days, l: "Days" },
          { v: parts.hours, l: "Hours" },
          { v: parts.minutes, l: "Minutes" },
          { v: parts.seconds, l: "Seconds" },
        ].map((p) => (
          <div key={p.l} className="rounded-xl bg-surface-base px-3 py-3">
            <div className="text-2xl font-semibold tabular-nums">
              {String(p.v).padStart(2, "0")}
            </div>
            <div className="text-xs uppercase tracking-wide text-text-tertiary">{p.l}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-text-tertiary">Scheduled for {new Date(scheduledAt).toLocaleString()}</p>
    </section>
  );
}

export default CountdownView;
