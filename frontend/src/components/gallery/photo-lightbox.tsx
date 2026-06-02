"use client";

/**
 * PhotoLightbox — enhanced for M13 deferred FR closure (v0.0.29)
 *
 * Closes the following FRs in one place (all are viewer-surface features
 * that naturally live in the lightbox shell):
 *   - GAL-FR-088: Watermark overlays on viewer
 *   - GAL-FR-089: Face-detection bounding box overlays
 *   - GAL-FR-091: Scroll position restore on lightbox close
 *   - GAL-FR-092: Compare mode (side-by-side)
 *   - GAL-FR-093: Filmstrip in lightbox
 *   - GAL-FR-094: Burst expansion / top-pick display
 *   - GAL-FR-095: Video playback (poster, volume, speed, fullscreen)
 *   - GAL-FR-097: Touch gestures (pinch-zoom, swipe-next, swipe-up-close)
 *
 * Each feature is implemented in its own file to keep this shell focused on
 * orchestration. The lightbox reads `props.allAssets` so it can power the
 * filmstrip and compare mode; callers that don't need those features can
 * pass a single-item array.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@/lib/api/assets";
import type { Gallery } from "@/lib/api/galleries";
import { getStoredAccessToken } from "@/lib/auth";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import {
  ChevronLeft, ChevronRight, XMark, Download, Expand, Compress,
  ZoomIn, ZoomOut, InfoCircle, ChatBubble, CheckCircle, ThumbsUp, XCircle, Trash,
} from "@/components/icons";
import { WatermarkOverlay } from "./watermark-overlay";
import { FaceBoxesOverlay } from "./face-boxes-overlay";
import { VideoPlayer } from "./video-player";
import { Filmstrip } from "./filmstrip";
import { CompareMode } from "./compare-mode";
import { useTouchGestures } from "@/hooks/use-touch-gestures";
import { useScrollRestore } from "@/hooks/use-scroll-restore";
import { FILMSTRIP_VARIANTS, LIGHTBOX_VARIANTS, originalManifest, variantManifest, assetUsesClientMediaEncryption } from "@/lib/media-encryption/asset-media";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";
import { decryptBlobWithAvailableMediaKeys } from "@/lib/media-encryption/media-key-store";

interface PhotoLightboxProps {
  asset: Asset;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  isProofing?: boolean;
  onProofingAction?: (assetId: string, action: "select" | "approve" | "reject") => void;
  onComment?: (assetId: string, comment: string) => void;
  // M13 deferred-FR additions — all optional so existing callers still work.
  allAssets?: Asset[];     // powers filmstrip and compare mode (GAL-FR-093, 092)
  gallery?: Gallery;       // powers watermark overlay (GAL-FR-088)
  showFilmstrip?: boolean; // default true when allAssets provided
  onDeleteRequest?: (asset: Asset) => void;
  /** Jump to a specific asset by ID — enables random-access filmstrip nav.
   *  When omitted, the filmstrip only supports ±1 navigation via onPrev/onNext. */
  onJumpTo?: (assetId: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Build an absolute storage-proxy URL from any input the lightbox sees:
 * bare object keys (`derivatives/<id>/display_webp.webp`), `/storage/...`
 * paths, absolute http(s) URLs, data/blob URIs. Delegates to
 * `getStorageBackedUrl` so every consumer goes through the same path
 * constructor — bare keys get the `/storage/` prefix + API_BASE host
 * + JWT token; non-storage URLs pass through unchanged. Idempotent
 * with respect to a token query already on the URL.
 *
 * Bug history (2026-05-18): the previous implementation only added
 * the token to URLs that ALREADY contained `/storage/`, so bare keys
 * from `asset.thumbnail_urls.display_webp` (= `derivatives/...`) were
 * passed straight into `<img src>` and resolved as relative URLs
 * against the current page, yielding `localhost:3001/galleries/
 * derivatives/...` 404s instead of `localhost:8081/storage/
 * derivatives/...`.
 */
function authedStorageUrl(url: string | undefined | null, token: string | null): string {
  return getStorageBackedUrl(url, token);
}

function isVideo(a: Asset): boolean {
  return a.content_type?.startsWith("video/") ?? false;
}

function BurstSiblingThumb({
  sibling,
  activeId,
  token,
}: {
  sibling: Asset;
  activeId: string;
  token: string | null;
}) {
  const [useDisplayFallback, setUseDisplayFallback] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const variants = useDisplayFallback ? LIGHTBOX_VARIANTS : FILMSTRIP_VARIANTS;
  const media = useDecryptedAssetUrl(sibling, variants, token);

  const handleImageError = () => {
    if (!useDisplayFallback) {
      setImageFailed(false);
      setUseDisplayFallback(true);
      return;
    }
    setImageFailed(true);
  };

  return (
    <div
      className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 ${
        sibling.id === activeId ? "border-white" : "border-white/20"
      }`}
    >
      {media.loading ? (
        <div className="h-full w-full animate-pulse bg-white/5" />
      ) : media.src && !imageFailed ? (
        <img src={media.src} alt={sibling.filename} className="h-full w-full object-cover" onError={handleImageError} />
      ) : (
        <div className="h-full w-full bg-white/5" />
      )}
      {sibling.burst_is_top_pick && (
        <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent-primary" title="Top pick" />
      )}
    </div>
  );
}

export function PhotoLightbox({
  asset, onClose, onPrev, onNext, hasPrev, hasNext,
  isProofing = false, onProofingAction, onComment,
  allAssets, gallery, showFilmstrip, onDeleteRequest, onJumpTo,
}: PhotoLightboxProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [zoom, setZoom] = useState(1);
  const [showFaces, setShowFaces] = useState(false);              // GAL-FR-089
  const [compareMode, setCompareMode] = useState(false);          // GAL-FR-092
  const [burstExpanded, setBurstExpanded] = useState(false);      // GAL-FR-094
  const containerRef = useRef<HTMLDivElement>(null);

  // GAL-FR-091: save scroll position on mount, restore on unmount.
  const { save: saveScroll, restore: restoreScroll } = useScrollRestore();
  useEffect(() => {
    saveScroll();
    return () => restoreScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GAL-FR-097: touch gestures — swipe next/prev/close + pinch zoom.
  const touchHandlers = useTouchGestures({
    onSwipeLeft: () => {
      if (hasNext) onNext?.();
    },
    onSwipeRight: () => {
      if (hasPrev) onPrev?.();
    },
    onSwipeUp: () => onClose(),
    onPinch: (delta) => {
      setZoom((z) => {
        const next = z + delta / 200; // 200 px of spread = 1x zoom
        return Math.max(0.5, Math.min(3, next));
      });
    },
  });

  // GAL-FR-094: burst membership — if this asset has a burst_id, find
  // siblings in allAssets.
  const burstSiblings = useMemo(() => {
    if (!asset.burst_id || !allAssets) return [];
    return allAssets.filter((a) => a.burst_id === asset.burst_id);
  }, [asset.burst_id, allAssets]);
  const inBurst = burstSiblings.length > 1;

  // GAL-FR-092: compare mode pairs the current asset with the next one.
  const compareRight = useMemo(() => {
    if (!compareMode || !allAssets) return null;
    const idx = allAssets.findIndex((a) => a.id === asset.id);
    if (idx < 0 || idx >= allAssets.length - 1) return null;
    return allAssets[idx + 1];
  }, [compareMode, allAssets, asset.id]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    switch (e.key) {
      case "Escape":
        if (compareMode) setCompareMode(false);
        else if (isFullscreen) document.exitFullscreen?.();
        else onClose();
        break;
      case "ArrowLeft": if (hasPrev && onPrev) onPrev(); break;
      case "ArrowRight": if (hasNext && onNext) onNext(); break;
      case "f": case "F": toggleFullscreen(); break;
      case "i": case "I": setShowInfo(s => !s); break;
      case "c": case "C": setShowComments(s => !s); break;
      case "b": case "B": setShowFaces(s => !s); break; // "boxes"
      case "+": case "=": setZoom(z => Math.min(z + 0.25, 3)); break;
      case "-": setZoom(z => Math.max(z - 0.25, 0.5)); break;
      case "0": setZoom(1); break;
      case "1": if (isProofing) onProofingAction?.(asset.id, "select"); break;
      case "2": if (isProofing) onProofingAction?.(asset.id, "approve"); break;
      case "3": if (isProofing) onProofingAction?.(asset.id, "reject"); break;
    }
  }, [onClose, onPrev, onNext, hasPrev, hasNext, isFullscreen, compareMode, isProofing, asset.id, onProofingAction, toggleFullscreen]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handleKeyDown); document.body.style.overflow = ""; };
  }, [handleKeyDown]);

  useEffect(() => { setZoom(1); setBurstExpanded(false); }, [asset.id]);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const handleDownloadFormat = async (format: "original" | "webp" | "thumbnail") => {
    let url: string; let filename: string; let variant = "original";
    switch (format) {
      case "webp":
        variant = asset.thumbnail_urls?.display_webp ? "display_webp" : "thumb_lg_webp";
        url = asset.thumbnail_urls?.display_webp || asset.thumbnail_urls?.thumb_lg_webp || "";
        filename = asset.filename.replace(/\.[^.]+$/, ".webp");
        break;
      case "thumbnail":
        variant = "thumb_lg_webp";
        url = asset.thumbnail_urls?.thumb_lg_webp || "";
        filename = "thumb_" + asset.filename.replace(/\.[^.]+$/, ".webp");
        break;
      default:
        url = asset.download_url || asset.storage_key || "";
        filename = asset.filename;
    }
    if (!url) return;
    url = authedStorageUrl(url, token);
    if (assetUsesClientMediaEncryption(asset)) {
      const manifest = variant === "original" ? originalManifest(asset) : variantManifest(asset, variant);
      if (!manifest) return;
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) return;
      const plain = await decryptBlobWithAvailableMediaKeys(await res.blob(), manifest);
      const objectUrl = URL.createObjectURL(plain);
      const a = document.createElement("a"); a.href = objectUrl; a.download = filename; a.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      return;
    }
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  };

  const handleSubmitComment = () => {
    if (commentText.trim() && onComment) { onComment(asset.id, commentText.trim()); setCommentText(""); }
  };

  const handleDeleteRequest = () => {
    onDeleteRequest?.(asset);
  };

  // Token is read eagerly so every URL derived below uses the same
  // session credential. The token is in-memory (see lib/auth.ts) and
  // is refreshed by the ambient refresh hook, so we do not need to
  // watch for changes here.
  const token = getStoredAccessToken();
  const media = useDecryptedAssetUrl(asset, LIGHTBOX_VARIANTS, token);
  const exif = asset.exif_data || {};

  const filmstripVisible = (showFilmstrip ?? !!allAssets) && !compareMode && !!allAssets && allAssets.length > 1;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo: ${asset.filename}`}
      {...touchHandlers}
    >

      {/* ─── Top Toolbar ─── */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="flex min-w-0 items-center gap-3 text-white text-sm">
          {/* Tighter filename clamp on mobile so the Close button on the
              right stays inside the viewport. The default 200px ate
              ~half the iPhone width and pushed the trailing buttons
              (Fullscreen, divider, Close) off-screen — users had no
              visible exit. */}
          <span className="font-medium truncate max-w-[120px] sm:max-w-[400px]">{asset.filename}</span>
          {asset.width && asset.height && <span className="hidden sm:inline text-white/40 text-xs">{asset.width} x {asset.height}</span>}
          {zoom !== 1 && <span className="text-white/40 text-xs">{Math.round(zoom * 100)}%</span>}
          {asset.burst_is_top_pick && (
            <span className="hidden sm:inline rounded-full bg-accent-primary/20 border border-accent-primary/30 px-2 py-0.5 text-[10px] font-semibold text-accent-primary uppercase tracking-wider">
              Top pick
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Zoom buttons hidden on mobile — touch devices have native
              pinch-to-zoom and the buttons crowded out the Close exit. */}
          <GlassIconButton size="sm" label="Zoom out (-)" className="hidden sm:inline-flex" onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))}><ZoomOut /></GlassIconButton>
          <GlassIconButton size="sm" label="Zoom in (+)" className="hidden sm:inline-flex" onClick={() => setZoom(z => Math.min(z + 0.25, 3))}><ZoomIn /></GlassIconButton>
          <div className="hidden sm:block w-px h-6 bg-white/10 mx-1" />
          {asset.face_boxes && asset.face_boxes.length > 0 && (
            <GlassIconButton
              size="sm"
              label={showFaces ? "Hide faces (B)" : "Show faces (B)"}
              active={showFaces}
              onClick={() => setShowFaces(s => !s)}
            >
              {/* Square outline icon reused from CheckCircle as face marker */}
              <CheckCircle />
            </GlassIconButton>
          )}
          {allAssets && allAssets.length > 1 && hasNext && (
            <GlassIconButton
              size="sm"
              label={compareMode ? "Exit compare" : "Compare with next"}
              active={compareMode}
              onClick={() => setCompareMode(s => !s)}
            >
              {/* Reuses ChevronRight as "split" marker */}
              <ChevronRight />
            </GlassIconButton>
          )}
          <GlassIconButton size="sm" label="Comments (C)" active={showComments} onClick={() => setShowComments(s => !s)}><ChatBubble /></GlassIconButton>
          <GlassIconButton size="sm" label="Info (I)" active={showInfo} onClick={() => setShowInfo(s => !s)}><InfoCircle /></GlassIconButton>
          <GlassIconButton
            size="sm"
            label="Download original"
            onClick={() => void handleDownloadFormat("original")}
          >
            <Download />
          </GlassIconButton>
          {onDeleteRequest && (
            <GlassIconButton
              size="sm"
              variant="danger"
              label="Delete photo"
              className="bg-feedback-error text-white border-feedback-error shadow-elevation-1 ring-2 ring-feedback-error/30 hover:bg-feedback-error/90 hover:text-white hover:border-feedback-error focus-visible:ring-feedback-error"
              onClick={handleDeleteRequest}
            >
              <Trash />
            </GlassIconButton>
          )}
          {/* Fullscreen toggle hidden on mobile — phone browsers already
              render the image at viewport size and the button was crowding
              out the Close (X) exit. */}
          <GlassIconButton size="sm" label={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"} className="hidden sm:inline-flex" onClick={toggleFullscreen}>{isFullscreen ? <Compress /> : <Expand />}</GlassIconButton>
          <div className="hidden sm:block w-px h-6 bg-white/10 mx-1" />
          <GlassIconButton size="sm" variant="ghost" label="Close (Esc)" onClick={onClose}><XMark /></GlassIconButton>
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Image/video area */}
        <div className="relative flex flex-1 items-center justify-center overflow-auto">
          {compareMode && compareRight ? (
            // GAL-FR-092: compare mode takes over the main area.
            <CompareMode left={asset} right={compareRight} onExit={() => setCompareMode(false)} />
          ) : (
            <>
              {hasPrev && !compareMode && (
                <GlassIconButton
                  size="lg"
                  label="Previous (Left arrow)"
                  className="absolute left-4 z-10"
                  onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
                >
                  <ChevronLeft />
                </GlassIconButton>
              )}

              {isVideo(asset) ? (
                // GAL-FR-095: video playback with poster, controls, trim.
                <VideoPlayer
                  src={authedStorageUrl(asset.download_url || (asset.storage_key ? `/storage/${asset.storage_key}` : ""), token)}
                  poster={authedStorageUrl(asset.poster_url || asset.thumbnail_urls?.lg, token)}
                  showTrim={isProofing}
                  className="flex max-h-full max-w-full items-center justify-center p-4"
                />
              ) : (
                <div className="relative">
                  {media.loading ? (
                    <div className="flex min-h-[50vh] min-w-[50vw] items-center justify-center p-4 text-sm text-white/60">
                      Decrypting photo...
                    </div>
                  ) : media.src ? (
                    <img
                      src={media.src}
                      alt={asset.filename}
                      className="max-h-full max-w-full object-contain p-4 transition-transform duration-200"
                      style={{ transform: `scale(${zoom})` }}
                      draggable={false}
                    />
                  ) : (
                    <div className="flex min-h-[50vh] min-w-[50vw] items-center justify-center p-4 text-sm text-white/60">
                      {media.error || "Preview unavailable"}
                    </div>
                  )}
                  {/* GAL-FR-088 — watermark overlay */}
                  <WatermarkOverlay config={gallery?.watermark_config} />
                  {/* GAL-FR-089 — face bounding boxes */}
                  <FaceBoxesOverlay boxes={asset.face_boxes} visible={showFaces} />
                </div>
              )}

              {hasNext && !compareMode && (
                <GlassIconButton
                  size="lg"
                  label="Next (Right arrow)"
                  className="absolute right-4 z-10"
                  onClick={(e) => { e.stopPropagation(); onNext?.(); }}
                >
                  <ChevronRight />
                </GlassIconButton>
              )}
            </>
          )}
        </div>

        {/* Comments sidebar */}
        {showComments && (
          <div className="w-80 shrink-0 border-l border-white/10 bg-black/60 backdrop-blur-xl flex flex-col">
            <div className="p-4 border-b border-white/10"><h3 className="text-sm font-semibold text-white">Comments</h3></div>
            <div className="flex-1 overflow-y-auto p-4"><p className="text-sm text-white/30 text-center py-8">No comments yet</p></div>
            <div className="p-4 border-t border-white/10">
              <textarea value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmitComment(); } }} placeholder="Add a comment..." className="w-full resize-none rounded-xl border border-white/15 bg-white/5 backdrop-blur-sm px-3 py-2 text-sm text-white placeholder-white/25 focus:border-white/30 focus:outline-none" rows={2} />
              <button onClick={handleSubmitComment} disabled={!commentText.trim()} className="mt-2 w-full rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 py-2 text-sm font-medium text-white hover:bg-white/18 disabled:opacity-30 transition-all">Post</button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Burst expansion strip (GAL-FR-094) ─── */}
      {inBurst && !compareMode && (
        <div className="px-4 shrink-0">
          <button
            type="button"
            onClick={() => setBurstExpanded(s => !s)}
            className="text-xs text-white/50 hover:text-white/80 transition-colors"
          >
            {burstExpanded ? "Hide" : "Show"} burst ({burstSiblings.length} photos)
          </button>
          {burstExpanded && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
              {burstSiblings.map((sib) => (
                <BurstSiblingThumb
                  key={sib.id}
                  sibling={sib}
                  activeId={asset.id}
                  token={token}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Filmstrip (GAL-FR-093) ─── */}
      {filmstripVisible && allAssets && (
        <Filmstrip
          assets={allAssets}
          activeId={asset.id}
          onSelect={(id) => {
            if (id === asset.id) return;
            // Prefer random-access jump when the caller supports it. Fall
            // back to ±1 navigation only — a non-adjacent click with no
            // onJumpTo is silently ignored and we log a warning so the
            // caller notices they forgot to wire it.
            if (onJumpTo) {
              onJumpTo(id);
              return;
            }
            const idx = allAssets.findIndex((a) => a.id === asset.id);
            const targetIdx = allAssets.findIndex((a) => a.id === id);
            if (idx < 0 || targetIdx < 0) return;
            if (targetIdx === idx + 1) onNext?.();
            else if (targetIdx === idx - 1) onPrev?.();
            else {
              console.warn(
                "[PhotoLightbox] filmstrip jump ignored — caller did not pass onJumpTo",
              );
            }
          }}
        />
      )}

      {(isProofing || showInfo) && (
        <div className="px-4 pb-4 shrink-0">
          {/* Proofing toolbar */}
          {isProofing && (
            <div className="mb-3 flex items-center justify-center gap-4">
              <GlassIconButton size="lg" variant="accent" label="Select (1)" onClick={() => onProofingAction?.(asset.id, "select")}><CheckCircle /></GlassIconButton>
              <GlassIconButton size="lg" variant="success" label="Approve (2)" onClick={() => onProofingAction?.(asset.id, "approve")}><ThumbsUp /></GlassIconButton>
              <GlassIconButton size="lg" variant="danger" label="Reject (3)" onClick={() => onProofingAction?.(asset.id, "reject")}><XCircle /></GlassIconButton>
            </div>
          )}

          {/* Info panel — EXIF metadata and file details (separate from Comments sidebar) */}
          {showInfo && (
            <div className="mx-auto max-w-2xl rounded-2xl bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] px-6 py-4 text-white shadow-[0_8px_32px_-4px_hsla(0,0%,0%,0.2)]">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">File info</h3>
                <span className={`rounded-full px-3 py-0.5 text-[10px] font-semibold tracking-wider uppercase backdrop-blur-sm border ${
                  asset.status === "ready" ? "bg-feedback-success/15 text-feedback-success/70 border-feedback-success/20" :
                  asset.status === "failed" ? "bg-feedback-error/15 text-feedback-error/70 border-feedback-error/20" :
                  "bg-feedback-warning/15 text-feedback-warning/70 border-feedback-warning/20"
                }`}>{asset.status}</span>
              </div>
              <p className="text-sm text-white/60">
                {asset.filename}{" — "}
                {asset.width && asset.height ? `${asset.width} x ${asset.height} px` : "Dimensions unknown"}{" "}
                — {formatBytes(asset.size_bytes)} — {asset.content_type}
              </p>
              {Object.keys(exif).length > 0 ? (
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-white/8 pt-3 text-xs sm:grid-cols-3">
                  {exif.camera_make ? <div><span className="text-white/35">Camera</span> <span className="text-white/70">{String(exif.camera_make)} {String(exif.camera_model || "")}</span></div> : null}
                  {exif.focal_length ? <div><span className="text-white/35">Focal</span> <span className="text-white/70">{String(exif.focal_length)}mm</span></div> : null}
                  {exif.exposure_time ? <div><span className="text-white/35">Shutter</span> <span className="text-white/70">{String(exif.exposure_time)}</span></div> : null}
                  {exif.f_number ? <div><span className="text-white/35">Aperture</span> <span className="text-white/70">f/{String(exif.f_number)}</span></div> : null}
                  {exif.iso ? <div><span className="text-white/35">ISO</span> <span className="text-white/70">{String(exif.iso)}</span></div> : null}
                  {exif.date_taken ? <div><span className="text-white/35">Taken</span> <span className="text-white/70">{String(exif.date_taken)}</span></div> : null}
                  {exif.lens_model ? <div className="sm:col-span-2"><span className="text-white/35">Lens</span> <span className="text-white/70">{String(exif.lens_model)}</span></div> : null}
                </div>
              ) : (
                <p className="mt-3 text-xs text-white/25 border-t border-white/8 pt-3">No EXIF metadata available for this file.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
