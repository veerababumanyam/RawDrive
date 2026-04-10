"use client";

/**
 * PublicGalleryGrid — client-side masonry grid for the public gallery page.
 *
 * Replaces the server-rendered grid markup so that two interactive features
 * from the M13 deferred FR closure can actually change what the viewer sees:
 *
 *   - GAL-FR-099: Map view toggle (grid ↔ map) — MapView is mounted here
 *   - GAL-FR-107/108/109: FaceID result filter — listens for
 *     `rawdrive:face-filter` window events dispatched by FaceIDGate and
 *     reduces the rendered asset set to the matched IDs. When the user
 *     clicks "Browse all" in the fallback chip, a `rawdrive:face-filter-clear`
 *     event restores the full set.
 *
 * The grid intentionally keeps the CSS-columns masonry layout from the
 * server version so visual output is identical when no filter is active.
 * Server → client conversion is the minimum necessary to make the filter
 * real; nothing else about the gallery shell changes.
 */

import { useEffect, useMemo, useState } from "react";
import type { PublicAsset } from "@/lib/api/galleries";
import { MapView } from "./map-view";
import type { Asset } from "@/lib/api/assets";

interface Props {
  slug: string;
  assets: PublicAsset[];
}

type ViewMode = "grid" | "map";

export function PublicGalleryGrid({ slug, assets }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [faceFilterIds, setFaceFilterIds] = useState<Set<string> | null>(null);

  // Listen for face filter events dispatched by FaceIDGate (via
  // PublicGalleryEnhancements). The event carries the matched asset IDs;
  // we store them in a Set so the filtering below is O(1) per asset.
  useEffect(() => {
    function onFilter(e: Event) {
      const detail = (e as CustomEvent<{ assetIds: string[] }>).detail;
      if (!detail || !Array.isArray(detail.assetIds)) return;
      setFaceFilterIds(new Set(detail.assetIds));
    }
    function onFilterClear() {
      setFaceFilterIds(null);
    }
    window.addEventListener("rawdrive:face-filter", onFilter as EventListener);
    window.addEventListener("rawdrive:face-filter-clear", onFilterClear);
    return () => {
      window.removeEventListener("rawdrive:face-filter", onFilter as EventListener);
      window.removeEventListener("rawdrive:face-filter-clear", onFilterClear);
    };
  }, []);

  const visibleAssets = useMemo(() => {
    if (!faceFilterIds) return assets;
    return assets.filter((a) => faceFilterIds.has(a.id));
  }, [assets, faceFilterIds]);

  // Adapt PublicAsset → Asset shape for the MapView component. PublicAsset
  // doesn't carry EXIF GPS, so the map filters based on assets with
  // populated `gps_latitude`/`gps_longitude` — when nothing matches the map
  // shows its empty state, which is the correct fallback.
  const mapAssets: Asset[] = useMemo(
    () =>
      visibleAssets.map((a) => ({
        id: a.id,
        workspace_id: "",
        filename: a.filename,
        content_type: a.content_type,
        size_bytes: 0,
        storage_key: "",
        width: a.width,
        height: a.height,
        blurhash: a.blurhash,
        exif_data: {},
        thumbnail_urls: a.thumbnail_urls,
        status: "ready",
        created_at: "",
      })),
    [visibleAssets],
  );

  if (visibleAssets.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-text-secondary">
          {faceFilterIds ? "No matching photos." : "This gallery is empty."}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* View toggle — only surfaces when the gallery has more than one
          photo; solo-photo galleries don't benefit from a map. */}
      {assets.length > 1 && (
        <div className="mb-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            aria-pressed={viewMode === "grid"}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === "grid"
                ? "bg-accent-primary text-accent-primary-contrast"
                : "border border-border-subtle text-text-secondary hover:text-text-primary"
            }`}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setViewMode("map")}
            aria-pressed={viewMode === "map"}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === "map"
                ? "bg-accent-primary text-accent-primary-contrast"
                : "border border-border-subtle text-text-secondary hover:text-text-primary"
            }`}
          >
            Map
          </button>
        </div>
      )}

      {viewMode === "map" ? (
        <div className="h-[600px]" aria-label={`Map view for gallery ${slug}`}>
          <MapView
            assets={mapAssets}
            onSelect={(assetId) => {
              // Map selection — switch to grid view then scroll the target
              // asset into view. React batches state updates, so we must
              // defer the DOM lookup until after the grid commits. Double
              // rAF: first tick lands after React commit, second after
              // browser paint when the grid DOM is actually mounted.
              setViewMode("grid");
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  const el = document.getElementById(`asset-${assetId}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                });
              });
            }}
          />
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4" aria-label={`Grid view for gallery ${slug}`}>
          {visibleAssets.map((asset) => {
            const thumbUrl =
              asset.thumbnail_urls?.lg ||
              asset.thumbnail_urls?.md ||
              asset.thumbnail_urls?.sm;
            return (
              <div
                key={asset.id}
                id={`asset-${asset.id}`}
                className="break-inside-avoid rounded-xl overflow-hidden bg-surface-sunken"
              >
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={asset.filename}
                    width={asset.width || undefined}
                    height={asset.height || undefined}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-auto object-cover"
                  />
                ) : (
                  <div
                    className="w-full aspect-[4/3] bg-surface-sunken flex items-center justify-center"
                    role="img"
                    aria-label={asset.filename}
                  >
                    <span className="text-xs text-text-tertiary">Processing...</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
