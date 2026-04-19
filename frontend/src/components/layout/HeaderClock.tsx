"use client";

import { useEffect, useState } from "react";

/**
 * HeaderClock — Issue #1 (RawDrive_NewUniqueIssues.xlsx).
 *
 * Renders the current local time in the dashboard header. The clock is
 * intentionally hidden on the smallest screens (md:inline-flex) so the
 * search field and quick-nav keep their share of the limited header
 * width on phones. On md+ it sits between the theme toggle and the
 * notifications bell.
 *
 * SSR-safety: the time is computed in useEffect after mount, never
 * during the initial server render, so React 19's hydration check
 * never sees a server-vs-client mismatch on the time string. The
 * placeholder dash keeps the header height stable until the first
 * tick lands.
 *
 * Locale: en-IN matches the rest of the dashboard (see /crm/calendar
 * page header). The format is HH:MM 24-hour to avoid AM/PM ambiguity
 * in a long-day photographer workflow; the tooltip carries the full
 * weekday + date so a user who hovers gets the absolute context.
 */
export function HeaderClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // The set-state-in-effect pattern is intentional here: rendering
    // `new Date()` during the synchronous render path would create an
    // SSR / client hydration mismatch in Next 15 because the server
    // and client clocks differ. Deferring the first read into the
    // mount-time effect guarantees both passes render the placeholder,
    // then the client takes over and sets the real time.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    // Tick every 30 seconds — finer than every minute so the clock
    // never feels stale, coarser than every second so we do not
    // burn an idle render budget for a passive widget.
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const timeLabel = now
    ? now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })
    : "—:—";
  const titleLabel = now
    ? now.toLocaleString("en-IN", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "Loading current time";

  return (
    <time
      // dateTime is empty until first mount so screen readers do not
      // announce a placeholder timestamp; once now is set the value
      // reflects the actual instant for assistive tech.
      dateTime={now ? now.toISOString() : undefined}
      title={titleLabel}
      aria-label={titleLabel}
      className="hidden md:inline-flex h-10 items-center justify-center rounded-full bg-surface-container-high px-3 text-sm font-semibold tabular-nums text-text-secondary transition-colors hover:text-text-primary"
    >
      {timeLabel}
    </time>
  );
}
