"use client";

/**
 * ExpiryBanner — pure presentation. The decision to render this banner
 * is owned by the server (replay endpoint sets banner_flag=true in the
 * 48h pre-expiry window, or returns 410 on expiry). This component
 * never re-derives availability from `expiresAt`.
 *
 * Styling uses semantic feedback tokens only — no hardcoded colors.
 */

import { useMemo } from "react";

export type ExpiryBannerProps = {
  expiresAt: string;
  variant?: "warning" | "expired";
};

function formatRemaining(expiresAt: string): string {
  const target = new Date(expiresAt).getTime();
  if (Number.isNaN(target)) return "soon";
  const ms = target - Date.now();
  if (ms <= 0) return "now";
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 1) return "less than an hour";
  if (hours === 1) return "1 hour";
  if (hours < 48) return `${hours} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

export function ExpiryBanner({ expiresAt, variant = "warning" }: ExpiryBannerProps) {
  const remaining = useMemo(() => formatRemaining(expiresAt), [expiresAt]);

  const message =
    variant === "expired"
      ? "This replay has expired and is no longer available."
      : `This replay expires in ${remaining}.`;

  return (
    <div
      data-testid="expiry-banner"
      data-variant={variant}
      role="status"
      aria-live="polite"
      className={
        variant === "expired"
          ? "status-badge status-badge--danger w-full justify-center px-4 py-3 text-sm"
          : "status-badge status-badge--warning w-full justify-center px-4 py-3 text-sm"
      }
    >
      {message}
    </div>
  );
}

export default ExpiryBanner;
