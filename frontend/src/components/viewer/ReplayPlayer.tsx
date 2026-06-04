"use client";

/**
 * ReplayPlayer — replay surface that mirrors the server's discriminated
 * union response. Server is authoritative for state and expiry.
 *
 *  available + banner_flag=false → <video> only
 *  available + banner_flag=true  → <video> + <ExpiryBanner variant="warning"/>
 *  expired (410)                 → <ExpiryBanner variant="expired"/>, no player
 *  processing (409)              → processing placeholder
 *  missing (404)                 → missing placeholder
 */

import { useReplay } from "@/hooks/viewer/useReplay";
import { ExpiryBanner } from "./ExpiryBanner";

export type ReplayPlayerProps = {
  shortlink: string;
  token: string;
  className?: string;
};

export function ReplayPlayer({
  shortlink,
  token,
  className,
}: ReplayPlayerProps) {
  const { data, loading, error } = useReplay(shortlink, token);

  if (loading) {
    return (
      <div
        data-testid="replay-loading"
        className={`status-badge status-badge--neutral px-3 py-2 text-xs ${className ?? ""}`}
      >
        Loading replay…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        data-testid="replay-error"
        className={`status-badge status-badge--danger px-3 py-2 text-xs ${className ?? ""}`}
      >
        Replay unavailable.
      </div>
    );
  }

  if (data.state === "expired") {
    return (
      <div data-testid="replay-expired" className={className}>
        <ExpiryBanner expiresAt={data.expires_at} variant="expired" />
      </div>
    );
  }

  if (data.state === "processing") {
    return (
      <div
        data-testid="replay-processing"
        className={`status-badge status-badge--warning px-3 py-2 text-xs ${className ?? ""}`}
      >
        Replay is still processing. Check back shortly.
      </div>
    );
  }

  if (data.state === "missing") {
    return (
      <div
        data-testid="replay-missing"
        className={`status-badge status-badge--neutral px-3 py-2 text-xs ${className ?? ""}`}
      >
        No replay is available for this stream.
      </div>
    );
  }

  // available
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      {data.banner_flag ? (
        <ExpiryBanner expiresAt={data.expires_at} variant="warning" />
      ) : null}
      <video
        data-testid="replay-video"
        src={data.playback_url}
        controls
        playsInline
        preload="metadata"
        className="w-full rounded-lg bg-surface-scrim-strong"
      />
    </div>
  );
}

export default ReplayPlayer;
