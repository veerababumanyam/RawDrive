"use client";

import { useSyncExternalStore } from "react";

import { Clock } from "@/components/icons";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// Minute-cached time store. useSyncExternalStore requires getSnapshot to return
// a stable value between renders, so we only recompute when the minute rolls
// over (the interval below notifies subscribers each minute). Reading the clock
// here — not in the component body — keeps the render pure and lint-clean.
let cachedMinute = -1;
let cachedNow = 0;
function getTimeSnapshot(): number {
  const minute = Math.floor(Date.now() / MINUTE_MS);
  if (minute !== cachedMinute) {
    cachedMinute = minute;
    cachedNow = Date.now();
  }
  return cachedNow;
}
// Server renders 0 → banner is null in SSR HTML; useSyncExternalStore then
// commits the real client time without a hydration mismatch warning.
const getServerTimeSnapshot = () => 0;
function subscribeTime(onChange: () => void) {
  const timer = window.setInterval(onChange, MINUTE_MS);
  return () => window.clearInterval(timer);
}

interface GalleryExpiryBannerProps {
  /** ISO timestamp of the gallery's expiry, or null/undefined for no expiry. */
  expiresAt?: string | null;
  /** Only show the banner once the gallery is within this many days of expiry. */
  thresholdDays?: number;
}

/**
 * Client-facing countdown shown near the top of a public gallery when access is
 * about to end. Creates urgency to download in time. Once the gallery is past
 * its expiry the public page renders the dedicated "Gallery Has Expired" state
 * (see app/g/[slug]/page.tsx), so this banner only covers the run-up window.
 */
export function GalleryExpiryBanner({
  expiresAt,
  thresholdDays = 14,
}: GalleryExpiryBannerProps) {
  const now = useSyncExternalStore(
    subscribeTime,
    getTimeSnapshot,
    getServerTimeSnapshot,
  );

  if (now === 0 || !expiresAt) return null;

  const expMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expMs)) return null;

  const msLeft = expMs - now;
  if (msLeft <= 0) return null; // expired → handled by the page-level expired view
  const daysLeft = Math.ceil(msLeft / DAY_MS);
  if (daysLeft > thresholdDays) return null;

  const dateLabel = new Date(expiresAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      role="status"
      className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 text-sm text-text-secondary"
    >
      <span className="inline-flex items-center gap-2 rounded-full border border-border-default bg-surface-sunken px-3 py-1.5">
        <Clock aria-hidden="true" className="h-4 w-4 text-text-tertiary" />
        <span>
          Available until{" "}
          <span className="font-semibold text-text-primary">{dateLabel}</span>
          {" · "}
          <span className="font-semibold text-text-primary">
            {daysLeft} day{daysLeft === 1 ? "" : "s"} left
          </span>
        </span>
      </span>
    </div>
  );
}
