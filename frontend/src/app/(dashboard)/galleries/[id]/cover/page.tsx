"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { getStoredAccessToken } from "@/lib/auth";
import { getGallery, listGalleryAssets, updateGalleryCover, type Gallery } from "@/lib/api/galleries";
import { getAsset, type Asset } from "@/lib/api/assets";
import { getAssetPreviewUrl } from "@/lib/dashboard-ui";
import { GalleryWorkspaceNav } from "@/components/gallery/gallery-workspace-nav";

type AspectRatio = "16:9" | "4:3" | "1:1";
type CoverTemplate = "none" | "full_bleed" | "split_screen" | "minimal_white" | "classic_film" | "festive";

interface CoverState {
  assetId: string | null;
  focalPoint: { x: number; y: number };
  aspectRatio: AspectRatio;
  template: CoverTemplate;
}

// Pan gesture state — kept in a ref so the move/up handlers read the
// drag origin without re-binding on every focal-point update.
interface PanOrigin {
  startX: number;
  startY: number;
  startFocalX: number;
  startFocalY: number;
}

export default function CoverPhotoPage() {
  const params = useParams();
  const galleryId = params.id as string;
  const containerRef = useRef<HTMLDivElement>(null);
  const panOriginRef = useRef<PanOrigin | null>(null);

  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [realAssets, setRealAssets] = useState<Asset[]>([]);
  const [state, setState] = useState<CoverState>({
    assetId: null,
    focalPoint: { x: 50, y: 50 },
    aspectRatio: "16:9",
    template: "full_bleed",
  });
  const [isPanning, setIsPanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  // Fetch gallery and its assets on mount
  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        const [g, galleryAssets] = await Promise.all([
          getGallery(token, galleryId),
          listGalleryAssets(token, galleryId),
        ]);
        if (cancelled) return;
        setGallery(g);

        const hydrated = await Promise.all(
          galleryAssets.map(async (entry) => {
            try { return await getAsset(token, entry.asset_id); }
            catch { return null; }
          })
        );
        if (cancelled) return;
        const assets = hydrated.filter((a): a is Asset => a !== null);
        setRealAssets(assets);
        const initialAssetId = g.cover_asset_id || assets[0]?.id || null;
        const coverStyle = g.settings?.cover_style as { focal_point?: { x?: number; y?: number }; aspect_ratio?: AspectRatio } | undefined;
        setState((s) => ({
          ...s,
          assetId: initialAssetId,
          focalPoint: {
            x: coverStyle?.focal_point?.x ?? s.focalPoint.x,
            y: coverStyle?.focal_point?.y ?? s.focalPoint.y,
          },
          aspectRatio: coverStyle?.aspect_ratio ?? s.aspectRatio,
          template: (g.cover_template as CoverTemplate) || s.template,
        }));
      } catch (err) {
        console.error("Failed to load cover page data:", err);
      }
    })();

    return () => { cancelled = true; };
  }, [galleryId]);

  const token = getStoredAccessToken();
  const selectedAsset = realAssets.find((a) => a.id === state.assetId);
  const selectedPreviewUrl = selectedAsset ? getAssetPreviewUrl(selectedAsset, token) : "";

  const aspectRatioMap: Record<AspectRatio, string> = {
    "16:9": "16/9",
    "4:3": "4/3",
    "1:1": "1/1",
  };

  // Pan gesture: drag the image inside the frame, the focal point follows
  // in the inverse direction so the visible window appears to pan with the
  // user's finger/cursor. Pointer Events unify mouse, touch, and pen input
  // in one handler set (no separate touchmove listeners needed). The
  // pointer is captured on down so the gesture continues even if the
  // cursor exits the container — releases on up/cancel.
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    panOriginRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startFocalX: state.focalPoint.x,
      startFocalY: state.focalPoint.y,
    };
    setIsPanning(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore — some pen drivers throw */ }
    e.preventDefault();
  }, [state.focalPoint.x, state.focalPoint.y]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!panOriginRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - panOriginRef.current.startX;
    const dy = e.clientY - panOriginRef.current.startY;
    // Inverted: dragging right pans the focal-point left, so the image
    // visibly moves with the cursor.
    const newFocalX = Math.max(0, Math.min(100, panOriginRef.current.startFocalX - (dx / rect.width) * 100));
    const newFocalY = Math.max(0, Math.min(100, panOriginRef.current.startFocalY - (dy / rect.height) * 100));
    setState((s) => ({ ...s, focalPoint: { x: Math.round(newFocalX), y: Math.round(newFocalY) } }));
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!panOriginRef.current) return;
    panOriginRef.current = null;
    setIsPanning(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch { /* ignore */ }
  }, []);

  const handleSave = async () => {
    const token = getStoredAccessToken();
    if (!token) {
      setSaveError("Your session expired. Please log in again.");
      return;
    }
    if (!state.assetId) {
      setSaveError("Select a gallery photo before saving the cover.");
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveMessage("");
    try {
      await updateGalleryCover(token, galleryId, {
        asset_id: state.assetId,
        focal_point: state.focalPoint,
        aspect_ratio: state.aspectRatio,
        template: state.template,
      });
      setGallery((g) => g ? { ...g, cover_asset_id: state.assetId || undefined, cover_template: state.template } : g);
      setSaveMessage("Cover saved.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save cover.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      {/* Workspace nav sits ABOVE the page header so the section dropdown
          is the very first thing visible on mobile (matches /galleries/[id]
          and the AI/Settings sub-pages). */}
      <div className="px-4 pt-3 sm:px-6 sm:pt-4 lg:px-8">
        <GalleryWorkspaceNav galleryId={galleryId} />
      </div>

      {/* Header — stacks title/actions on mobile so neither truncates;
          flips back to a single row at sm+ where there's room for both
          sides. Padding scales from px-4 (mobile) to px-8 (desktop) so
          the band aligns with the rest of the dashboard's gutter rhythm. */}
      <header className="mt-3 flex flex-col gap-3 border-b border-white/5 px-4 py-3 sm:mt-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4 lg:px-8">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold font-headline sm:text-xl">Cover Photo</h1>
          <p className="truncate text-xs text-on-surface-variant">{gallery?.title || "Loading…"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => setState((s) => ({ ...s, focalPoint: { x: 50, y: 50 } }))}
            className="min-h-[40px] flex-1 rounded-xl border border-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/5 sm:flex-none"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !state.assetId}
            className="min-h-[40px] flex-1 rounded-xl bg-gradient-to-r from-primary to-primary-container px-5 py-2 text-sm font-medium text-on-primary transition-opacity disabled:opacity-50 sm:flex-none sm:px-6"
          >
            {saving ? "Saving..." : "Save Cover"}
          </button>
        </div>
      </header>

      {/* Single-column layout: cover editor on top, asset thumbnail grid
          below. The page now flows naturally — no fixed viewport height,
          no side-by-side split. This gives the cover image (the page's
          primary subject) the full content width and pushes the picker
          down to a secondary visual rank. Cover Preview / Public Preview
          / Version History sections were removed — those are either
          available on the Design Studio (cover style preview) or the
          gallery detail page (open client preview), and version history
          had no backing API. */}
      <div className="flex flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-8">
        {/* Cover image with focal point — full-width and tall so it
            dominates the page. Click anywhere on the image to drop the
            focal-point crosshair. */}
        <section className="space-y-3">
          <div
            ref={containerRef}
            onPointerDown={selectedPreviewUrl ? handlePointerDown : undefined}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`relative w-full select-none rounded-2xl bg-surface-container border border-white/10 overflow-hidden flex items-center justify-center ${selectedPreviewUrl ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-default"}`}
            style={{ aspectRatio: aspectRatioMap[state.aspectRatio], maxHeight: "min(70vh, 720px)", touchAction: "none" }}
            role={selectedPreviewUrl ? "slider" : undefined}
            aria-label={selectedPreviewUrl ? `Cover image position — drag to adjust (${state.focalPoint.x}%, ${state.focalPoint.y}%)` : undefined}
            aria-valuemin={selectedPreviewUrl ? 0 : undefined}
            aria-valuemax={selectedPreviewUrl ? 100 : undefined}
            aria-valuenow={selectedPreviewUrl ? state.focalPoint.x : undefined}
          >
            {selectedPreviewUrl ? (
              <img
                src={selectedPreviewUrl}
                alt={selectedAsset?.filename || "Cover preview"}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ objectPosition: `${state.focalPoint.x}% ${state.focalPoint.y}%` }}
                draggable={false}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-surface-container to-surface-container-high" />
            )}
            <p className="relative text-sm text-on-surface-variant z-10">
              {!selectedPreviewUrl && (state.assetId ? "Loading preview…" : "Select an asset below to choose a cover")}
            </p>

            {/* Pan-hint pill — fades out while the user is actively
                dragging so it doesn't clutter the gesture. */}
            {selectedPreviewUrl && !isPanning && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-sm">
                Drag to reposition
              </div>
            )}
          </div>

          {/* Inline save status — replaces the messages that used to live
              inside the right-side aside's "Select Cover" header. Stays
              near the Save Cover action so the feedback is colocated
              with the trigger. */}
          {(saveMessage || saveError) && (
            <div className="text-xs" role="status" aria-live="polite">
              {saveMessage && <p className="text-success">{saveMessage}</p>}
              {saveError && <p className="text-danger">{saveError}</p>}
            </div>
          )}
        </section>

        {/* Asset thumbnail grid — full-width, denser column count on
            larger viewports since we now have the whole main area to
            work with. Thumbs are square; tap-targets scale with viewport. */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Select cover photo</h3>
            <p className="text-xs text-on-surface-variant">
              {realAssets.length} {realAssets.length === 1 ? "photo" : "photos"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6 lg:grid-cols-8">
            {realAssets.map((a) => {
              const thumbUrl = getAssetPreviewUrl(a, token);
              return (
                <button
                  key={a.id}
                  onClick={() => setState((s) => ({ ...s, assetId: a.id }))}
                  className={`aspect-square overflow-hidden rounded-lg transition-all ${state.assetId === a.id ? "ring-2 ring-primary" : "ring-1 ring-white/10 hover:ring-white/20"}`}
                  aria-label={`Select ${a.filename} as cover`}
                  aria-pressed={state.assetId === a.id}
                >
                  {thumbUrl ? (
                    <img src={thumbUrl} alt={a.filename} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="h-full w-full bg-surface-container-high" />
                  )}
                </button>
              );
            })}
          </div>
          {realAssets.length === 0 && (
            <p className="mt-3 text-xs text-on-surface-variant">
              Upload photos to the gallery to choose a cover.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
