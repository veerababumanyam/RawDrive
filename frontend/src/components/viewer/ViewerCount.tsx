"use client";

/**
 * ViewerCount — live viewer-count pill driven by useViewerCount.
 * Polls every 5s while the tab is visible. Renders only the
 * server-supplied `current` count; peak/unique are owner-only.
 */

import { useViewerCount } from "@/hooks/viewer/useViewerCount";

export type ViewerCountProps = {
  shortlink: string;
  token: string;
  pollMs?: number;
  className?: string;
};

export function ViewerCount({
  shortlink,
  token,
  pollMs,
  className,
}: ViewerCountProps) {
  const { current, loading, error } = useViewerCount({
    shortlink,
    token,
    pollMs,
  });

  const state = error ? "error" : loading ? "loading" : "ready";
  const display = current == null ? "—" : `${current.toLocaleString()}`;

  return (
    <div
      data-testid="viewer-count"
      data-state={state}
      className={`status-badge status-badge--neutral inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium ${className ?? ""}`}
      aria-live="polite"
      aria-label={
        state === "error"
          ? "Viewer count unavailable"
          : `${current ?? 0} viewers watching`
      }
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span data-testid="viewer-count-value">
        {state === "error" ? "—" : display}
      </span>
    </div>
  );
}

export default ViewerCount;
