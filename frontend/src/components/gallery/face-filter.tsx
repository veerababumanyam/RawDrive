"use client";

/**
 * FaceFilter — dashboard gallery filter for M3 E8-S3 face clusters.
 *
 * Closes the UI side of the face smart-album resolver that landed in
 * commit fff6e4e. The backend was ready (GET /api/v1/ai/clusters and
 * GET /api/v1/ai/clusters/{id}/assets), but nothing in the dashboard
 * gallery view actually let a studio owner filter photos by face.
 *
 * Flow:
 *   1. On mount, fetch the list of face clusters for the current
 *      gallery via `getFaceClusters(token, galleryId)`. Each cluster is
 *      the output of the face detection worker clustering pipeline and
 *      carries a human-editable name (or "Unknown" when unnamed).
 *   2. Render a horizontally-scrolling chip strip of clusters. The
 *      strip is intentionally chip-based (not a grid) because a
 *      dashboard gallery view can have 20+ named people and vertical
 *      grid space is reserved for the photos themselves.
 *   3. When a chip is clicked, fetch the full asset-ID list for that
 *      cluster via `getClusterAssets(token, clusterId)` and dispatch a
 *      `rawdrive:face-filter` CustomEvent with the ID array. Any grid
 *      component listening for that event (see `PublicGalleryGrid` and
 *      the dashboard gallery grid) will reduce its rendered set to the
 *      matched assets.
 *   4. A "Clear" action dispatches `rawdrive:face-filter-clear` to
 *      restore the unfiltered view. We use events instead of props so
 *      FaceFilter can be dropped next to any grid without prop drilling
 *      — the same contract `PublicGalleryGrid` already consumes.
 *
 * Accessibility: chips render as real <button> elements with
 * `aria-pressed` reflecting the active cluster. Touch targets are 44px
 * (the RawDrive design system floor) via GlassIconButton sizing.
 * Keyboard users can Tab through the strip and Enter to select.
 *
 * Theme awareness: every color/spacing value flows through semantic
 * design tokens (surface-raised, border-default, text-primary, accent).
 * The component works in all three RawDrive themes without overrides.
 */

import { useEffect, useState } from "react";
import {
  getFaceClusters,
  getClusterAssets,
  type ClusterSummary,
} from "@/lib/api/ai";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { FaceCircle, XMark } from "@/components/icons";

interface FaceFilterProps {
  /** Authenticated access token; omit and the component renders nothing. */
  token: string;
  /** Scope the cluster list to a single gallery. Required in dashboard use. */
  galleryId?: string;
  /**
   * Optional callback fired whenever the active cluster changes.
   * Kept alongside the event dispatch so parents that want direct
   * control (e.g., for analytics) don't have to subscribe to window.
   */
  onClusterChange?: (clusterId: string | null) => void;
}

export function FaceFilter({ token, galleryId, onClusterChange }: FaceFilterProps) {
  const [clusters, setClusters] = useState<ClusterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load clusters on mount (and when gallery scope changes). Errors
  // populate the inline banner — we don't throw because the gallery
  // view should still work even if AI clustering hasn't run.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFaceClusters(token, galleryId)
      .then((rows) => {
        if (cancelled) return;
        setClusters(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load faces");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, galleryId]);

  const selectCluster = async (clusterId: string) => {
    // Toggling the active cluster clears the filter — the user clicked
    // the same chip again to mean "show everything".
    if (activeId === clusterId) {
      clearFilter();
      return;
    }

    setSelectingId(clusterId);
    setError(null);
    try {
      const { asset_ids } = await getClusterAssets(token, clusterId);
      setActiveId(clusterId);
      window.dispatchEvent(
        new CustomEvent("rawdrive:face-filter", {
          detail: { assetIds: asset_ids },
        }),
      );
      onClusterChange?.(clusterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cluster assets");
    } finally {
      setSelectingId(null);
    }
  };

  const clearFilter = () => {
    setActiveId(null);
    window.dispatchEvent(new Event("rawdrive:face-filter-clear"));
    onClusterChange?.(null);
  };

  // Empty states are intentional — when face detection hasn't produced
  // any clusters (new gallery, detection disabled, small sample), we
  // render nothing rather than a placeholder. The dashboard shell
  // already has other filters; a chatty empty state here is noise.
  if (loading && clusters.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2" aria-live="polite">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-border-default border-t-accent" />
        <span className="text-xs text-text-tertiary">Loading faces…</span>
      </div>
    );
  }

  if (!loading && clusters.length === 0 && !error) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="rounded-lg border border-feedback-error/40 bg-feedback-error/10 px-3 py-2 text-xs text-feedback-error">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span
          className="shrink-0 text-xs font-medium uppercase tracking-wide text-text-tertiary"
          id="face-filter-label"
        >
          Filter by face
        </span>

        {activeId && (
          <GlassIconButton
            size="sm"
            variant="ghost"
            label="Clear face filter"
            onClick={clearFilter}
          >
            <XMark />
          </GlassIconButton>
        )}
      </div>

      <div
        role="group"
        aria-labelledby="face-filter-label"
        className="flex gap-2 overflow-x-auto pb-2"
      >
        {clusters.map((c) => {
          const isActive = activeId === c.cluster_label;
          const isLoading = selectingId === c.cluster_label;
          const label = c.cluster_name || "Unknown";
          return (
            <button
              key={c.cluster_label}
              type="button"
              onClick={() => selectCluster(c.cluster_label)}
              aria-pressed={isActive}
              disabled={isLoading}
              className={[
                "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors",
                "min-h-[44px]", // WCAG touch target
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                isActive
                  ? "border-accent bg-accent text-accent-contrast"
                  : "border-border-default bg-surface-raised text-text-primary hover:bg-surface-sunken",
                isLoading ? "opacity-60 cursor-wait" : "",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-7 w-7 items-center justify-center rounded-full",
                  isActive ? "bg-accent-contrast/20" : "bg-surface-sunken",
                ].join(" ")}
                aria-hidden="true"
              >
                <FaceCircle width={18} height={18} />
              </span>
              <span className="font-medium">{label}</span>
              <span
                className={[
                  "text-xs tabular-nums",
                  isActive ? "text-accent-contrast/80" : "text-text-tertiary",
                ].join(" ")}
              >
                {c.asset_count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
