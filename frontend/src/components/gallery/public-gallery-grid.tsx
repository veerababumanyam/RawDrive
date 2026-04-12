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

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PublicAsset } from "@/lib/api/galleries";
import { MapView } from "./map-view";
import type { Asset } from "@/lib/api/assets";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { ChevronLeft, ChevronRight, XMark, ZoomIn, ZoomOut, CheckCircle, Download } from "@/components/icons";

interface Props {
  slug: string;
  assets: PublicAsset[];
  galleryType?: string;
  maxSelections?: number;
  downloadEnabled?: boolean;
}

type ViewMode = "grid" | "map";

export function PublicGalleryGrid({ slug, assets, galleryType, maxSelections = 0, downloadEnabled = true }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [faceFilterIds, setFaceFilterIds] = useState<Set<string> | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);

  // M19 F-009: Proofing selection state (BUG-GAL-014 fix)
  const isProofing = galleryType === "proofing";
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitName, setSubmitName] = useState("");
  const [submitEmail, setSubmitEmail] = useState("");
  const [submitNote, setSubmitNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const toggleSelection = useCallback((assetId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        if (maxSelections > 0 && next.size >= maxSelections) return prev;
        next.add(assetId);
      }
      return next;
    });
  }, [maxSelections]);

  const handleSubmitSelections = async () => {
    if (selectedIds.size === 0 || !submitEmail) return;
    setSubmitting(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      const res = await fetch(`${apiBase}/api/v1/public/galleries/${slug}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_ids: Array.from(selectedIds),
          client_name: submitName,
          client_email: submitEmail,
          note: submitNote,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setShowSubmit(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

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

  // Helper to change photo and reset zoom in one update
  const goToPhoto = (idx: number | null) => {
    setLightboxIdx(idx);
    setZoom(1);
  };

  // Keyboard handling for the lightbox
  useEffect(() => {
    if (lightboxIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case "Escape": setLightboxIdx(null); break;
        case "ArrowLeft": setLightboxIdx((i) => i !== null && i > 0 ? i - 1 : i); break;
        case "ArrowRight": setLightboxIdx((i) => i !== null && i < visibleAssets.length - 1 ? i + 1 : i); break;
        case "+": case "=": setZoom((z) => Math.min(z + 0.25, 3)); break;
        case "-": setZoom((z) => Math.max(z - 0.25, 0.5)); break;
        case "0": setZoom(1); break;
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [lightboxIdx, visibleAssets.length]);

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
            // Backend thumbnail worker emits keys thumb_lg / thumb_md
            // / thumb_sm (prefixed) — not the legacy lg/md/sm shape
            // some earlier code paths expected. Try both so pre-fix
            // gallery rows still render.
            const thumbUrl =
              asset.thumbnail_urls?.thumb_lg ||
              asset.thumbnail_urls?.thumb_md ||
              asset.thumbnail_urls?.thumb_sm ||
              asset.thumbnail_urls?.lg ||
              asset.thumbnail_urls?.md ||
              asset.thumbnail_urls?.sm;
            return (
              <div
                key={asset.id}
                id={`asset-${asset.id}`}
                className={`break-inside-avoid rounded-xl overflow-hidden bg-surface-sunken cursor-pointer transition-all hover:shadow-lg relative group ${
                  isProofing && selectedIds.has(asset.id)
                    ? "ring-3 ring-accent-primary shadow-lg"
                    : ""
                }`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (isProofing) {
                    toggleSelection(asset.id);
                  } else {
                    const idx = visibleAssets.findIndex((a) => a.id === asset.id);
                    if (idx >= 0) goToPhoto(idx);
                  }
                }}
                onDoubleClick={() => {
                  // In proofing mode, double-click still opens lightbox
                  if (isProofing) {
                    const idx = visibleAssets.findIndex((a) => a.id === asset.id);
                    if (idx >= 0) goToPhoto(idx);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (isProofing) {
                      toggleSelection(asset.id);
                    } else {
                      const idx = visibleAssets.findIndex((a) => a.id === asset.id);
                      if (idx >= 0) goToPhoto(idx);
                    }
                  }
                }}
              >
                {/* M19: Selection checkmark overlay */}
                {isProofing && selectedIds.has(asset.id) && (
                  <div className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-accent-primary flex items-center justify-center shadow-md">
                    <CheckCircle className="w-5 h-5 text-accent-primary-contrast" />
                  </div>
                )}
                {/* M19: Download button (visible on hover when downloads enabled) */}
                {downloadEnabled && !isProofing && (
                  <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <GlassIconButton
                      size="sm"
                      label="Download"
                      onClick={(e) => {
                        e.stopPropagation();
                        const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
                        window.open(`${apiBase}/api/v1/public/galleries/${slug}/assets/${asset.id}/download`, "_blank");
                      }}
                    >
                      <Download />
                    </GlassIconButton>
                  </div>
                )}
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

      {/* End-of-gallery indicator */}
      <div className="mt-12 text-center pb-8">
        <div className="inline-block h-px w-16 bg-border-subtle" />
        <p className="mt-3 text-xs text-text-tertiary">
          {visibleAssets.length} {visibleAssets.length === 1 ? "photo" : "photos"}
        </p>
      </div>

      {/* M19 F-009: Proofing selection floating bar */}
      {isProofing && selectedIds.size > 0 && !submitted && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-surface-elevated/95 backdrop-blur-xl border-t border-border-subtle px-4 py-3 shadow-lg">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">
              {selectedIds.size} {selectedIds.size === 1 ? "photo" : "photos"} selected
              {maxSelections > 0 && (
                <span className="text-text-tertiary"> of {maxSelections}</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 text-xs rounded-lg border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setShowSubmit(true)}
                className="px-4 py-1.5 text-sm font-medium rounded-lg bg-accent-primary text-accent-primary-contrast hover:opacity-90 transition-opacity"
              >
                Submit Selections
              </button>
            </div>
          </div>
        </div>
      )}

      {/* M19: Submission success message */}
      {submitted && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-green-600/95 backdrop-blur-xl px-4 py-3 shadow-lg">
          <div className="max-w-6xl mx-auto text-center">
            <p className="text-sm font-medium text-white">
              Your selections have been submitted! The photographer will review them shortly.
            </p>
          </div>
        </div>
      )}

      {/* M19: Submit selections dialog */}
      {showSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSubmit(false)}>
          <div className="bg-surface-elevated rounded-2xl shadow-xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-text-primary mb-1">Submit Your Selections</h3>
            <p className="text-sm text-text-secondary mb-4">
              {selectedIds.size} {selectedIds.size === 1 ? "photo" : "photos"} selected
            </p>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Your name"
                value={submitName}
                onChange={(e) => setSubmitName(e.target.value)}
                className="input-base w-full"
              />
              <input
                type="email"
                placeholder="Your email *"
                value={submitEmail}
                onChange={(e) => setSubmitEmail(e.target.value)}
                className="input-base w-full"
                required
              />
              <textarea
                placeholder="Message to photographer (optional)"
                value={submitNote}
                onChange={(e) => setSubmitNote(e.target.value)}
                rows={3}
                className="input-base w-full resize-none"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowSubmit(false)}
                className="flex-1 px-4 py-2 text-sm rounded-lg border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitSelections}
                disabled={!submitEmail || submitting}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-accent-primary text-accent-primary-contrast hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client-facing lightbox */}
      {lightboxIdx !== null && visibleAssets[lightboxIdx] && (() => {
        const photo = visibleAssets[lightboxIdx];
        const fullUrl =
          photo.thumbnail_urls?.display_webp ||
          photo.thumbnail_urls?.thumb_lg_webp ||
          photo.thumbnail_urls?.thumb_lg ||
          photo.thumbnail_urls?.lg ||
          Object.values(photo.thumbnail_urls || {})[0] ||
          "";
        return (
          <div
            className="fixed inset-0 z-50 flex flex-col bg-black/95"
            onClick={(e) => { if (e.target === e.currentTarget) setLightboxIdx(null); }}
            role="dialog"
            aria-modal="true"
            aria-label={`Photo: ${photo.filename}`}
          >
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0">
              <span className="text-sm text-white font-medium truncate max-w-[300px]">
                {photo.filename}
                {zoom !== 1 && <span className="ml-2 text-white/40 text-xs">{Math.round(zoom * 100)}%</span>}
              </span>
              <div className="flex items-center gap-1.5">
                <GlassIconButton size="sm" label="Zoom out" onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}><ZoomOut /></GlassIconButton>
                <GlassIconButton size="sm" label="Zoom in" onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}><ZoomIn /></GlassIconButton>
                <div className="w-px h-6 bg-white/10 mx-1" />
                <GlassIconButton size="sm" variant="ghost" label="Close" onClick={() => setLightboxIdx(null)}><XMark /></GlassIconButton>
              </div>
            </div>

            {/* Image */}
            <div className="relative flex flex-1 items-center justify-center overflow-auto">
              {lightboxIdx > 0 && (
                <GlassIconButton
                  size="lg"
                  label="Previous"
                  className="absolute left-4 z-10"
                  onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => i !== null && i > 0 ? i - 1 : i); }}
                >
                  <ChevronLeft />
                </GlassIconButton>
              )}

              {fullUrl ? (
                <img
                  src={fullUrl}
                  alt={photo.filename}
                  className="max-h-full max-w-full object-contain p-4 transition-transform duration-200"
                  style={{ transform: `scale(${zoom})` }}
                  draggable={false}
                />
              ) : (
                <p className="text-white/40 text-sm">Image unavailable</p>
              )}

              {lightboxIdx < visibleAssets.length - 1 && (
                <GlassIconButton
                  size="lg"
                  label="Next"
                  className="absolute right-4 z-10"
                  onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => i !== null && i < visibleAssets.length - 1 ? i + 1 : i); }}
                >
                  <ChevronRight />
                </GlassIconButton>
              )}
            </div>

            {/* Filmstrip — scrollable thumbnail strip for quick navigation */}
            {visibleAssets.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto scroll-smooth px-4 py-2 shrink-0" role="tablist" aria-label="Photo filmstrip">
                {visibleAssets.map((a, i) => {
                  const thumb = a.thumbnail_urls?.thumb_sm || a.thumbnail_urls?.sm || a.thumbnail_urls?.thumb_md || Object.values(a.thumbnail_urls || {})[0] || "";
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="tab"
                      aria-selected={i === lightboxIdx}
                      onClick={(e) => { e.stopPropagation(); goToPhoto(i); }}
                      className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                        i === lightboxIdx ? "border-white scale-105 shadow-lg" : "border-white/20 opacity-50 hover:opacity-100"
                      }`}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        <div className="h-full w-full bg-white/5" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Bottom hints */}
            <div className="px-4 pb-4 shrink-0">
              <div className="flex items-center justify-center gap-3 text-[10px] text-white/20 tracking-wide">
                <span>← → Navigate</span>
                <span>+/- Zoom</span>
                <span>Esc Close</span>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
