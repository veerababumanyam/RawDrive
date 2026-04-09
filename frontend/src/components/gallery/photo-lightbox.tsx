"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Asset } from "@/lib/api/assets";

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
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function PhotoLightbox({
  asset,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  isProofing = false,
  onProofingAction,
  onComment,
}: PhotoLightboxProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't capture keys when typing in the comment box
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      switch (e.key) {
        case "Escape":
          if (isFullscreen) document.exitFullscreen?.();
          else onClose();
          break;
        case "ArrowLeft":
          if (hasPrev && onPrev) onPrev();
          break;
        case "ArrowRight":
          if (hasNext && onNext) onNext();
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "i":
        case "I":
          setShowInfo((s) => !s);
          break;
        case "c":
        case "C":
          setShowComments((s) => !s);
          break;
        case "+":
        case "=":
          setZoom((z) => Math.min(z + 0.25, 3));
          break;
        case "-":
          setZoom((z) => Math.max(z - 0.25, 0.5));
          break;
        case "0":
          setZoom(1);
          break;
        // Proofing shortcuts
        case "1":
          if (isProofing) onProofingAction?.(asset.id, "select");
          break;
        case "2":
          if (isProofing) onProofingAction?.(asset.id, "approve");
          break;
        case "3":
          if (isProofing) onProofingAction?.(asset.id, "reject");
          break;
      }
    },
    [onClose, onPrev, onNext, hasPrev, hasNext, isFullscreen, isProofing, asset.id, onProofingAction]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  // Reset zoom when navigating
  useEffect(() => { setZoom(1); }, [asset.id]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  }, []);

  const handleDownloadFormat = (format: "original" | "webp" | "thumbnail") => {
    let url: string;
    let filename: string;
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

    switch (format) {
      case "webp":
        url = asset.thumbnail_urls?.display_webp || asset.thumbnail_urls?.thumb_lg_webp || "";
        filename = asset.filename.replace(/\.[^.]+$/, ".webp");
        break;
      case "thumbnail":
        url = asset.thumbnail_urls?.thumb_lg || asset.thumbnail_urls?.lg || "";
        filename = "thumb_" + asset.filename;
        break;
      default:
        url = asset.download_url || asset.storage_key || "";
        filename = asset.filename;
    }

    if (!url) return;

    // If it's a relative path, prepend the API base + storage prefix
    if (!url.startsWith("http")) {
      url = `${API_BASE}/storage/${url}`;
    }

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  const handleSubmitComment = () => {
    if (commentText.trim() && onComment) {
      onComment(asset.id, commentText.trim());
      setCommentText("");
    }
  };

  const largeUrl =
    asset.thumbnail_urls?.lg ||
    asset.thumbnail_urls?.cover_1920 ||
    asset.download_url ||
    Object.values(asset.thumbnail_urls || {})[0] ||
    "";

  const exif = asset.exif_data || {};
  const btnClass =
    "flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 transition-colors";

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo: ${asset.filename}`}
    >
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="flex items-center gap-3 text-white text-sm">
          <span className="font-medium truncate max-w-[200px] sm:max-w-[400px]">{asset.filename}</span>
          {asset.width && asset.height && (
            <span className="hidden sm:inline text-white/50">{asset.width}x{asset.height}</span>
          )}
          {zoom !== 1 && (
            <span className="text-white/50">{Math.round(zoom * 100)}%</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Zoom controls */}
          <button onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))} className={btnClass} aria-label="Zoom out" title="Zoom out (-)">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          <button onClick={() => setZoom((z) => Math.min(z + 0.25, 3))} className={btnClass} aria-label="Zoom in" title="Zoom in (+)">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
            </svg>
          </button>

          {/* Comments toggle */}
          <button
            onClick={() => { setShowComments((s) => !s); }}
            className={`${btnClass} ${showComments ? "bg-white/25" : ""}`}
            aria-label="Toggle comments"
            title="Comments (C)"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>

          {/* Info toggle */}
          <button
            onClick={() => setShowInfo((s) => !s)}
            className={`${btnClass} ${showInfo ? "bg-white/25" : ""}`}
            aria-label="Toggle info panel"
            title="Toggle info (I)"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          {/* Download with format options */}
          <div className="relative">
            <button
              onClick={() => setShowDownloadMenu((s) => !s)}
              className={`${btnClass} ${showDownloadMenu ? "bg-white/25" : ""}`}
              aria-label="Download options"
              title="Download"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            {showDownloadMenu && (
              <div className="absolute right-0 top-12 z-20 w-56 rounded-xl bg-black/90 border border-white/10 backdrop-blur-sm py-1 shadow-xl">
                <button
                  onClick={() => { handleDownloadFormat("original"); setShowDownloadMenu(false); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/10"
                >
                  <span className="text-white/50 w-12 text-xs">ORIG</span>
                  <span>Original ({formatBytes(asset.size_bytes)})</span>
                </button>
                {asset.thumbnail_urls?.display_webp && (
                  <button
                    onClick={() => { handleDownloadFormat("webp"); setShowDownloadMenu(false); }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/10"
                  >
                    <span className="text-white/50 w-12 text-xs">WebP</span>
                    <span>Optimized WebP</span>
                  </button>
                )}
                <button
                  onClick={() => { handleDownloadFormat("thumbnail"); setShowDownloadMenu(false); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/10"
                >
                  <span className="text-white/50 w-12 text-xs">THUMB</span>
                  <span>Thumbnail (small)</span>
                </button>
                <div className="border-t border-white/10 mx-3 my-1" />
                <button
                  onClick={() => { handleDownloadFormat("original"); handleDownloadFormat("webp"); setShowDownloadMenu(false); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/10"
                >
                  <span className="text-white/50 w-12 text-xs">BOTH</span>
                  <span>Original + WebP</span>
                </button>
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} className={btnClass} aria-label="Toggle fullscreen" title="Fullscreen (F)">
            {isFullscreen ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </button>

          {/* Close */}
          <button onClick={onClose} className={btnClass} aria-label="Close lightbox" title="Close (Esc)">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Image area */}
        <div className="relative flex flex-1 items-center justify-center overflow-auto">
          {/* Previous */}
          {hasPrev && (
            <button
              onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
              className={`absolute left-4 z-10 ${btnClass}`}
              aria-label="Previous photo (Left arrow)"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          <img
            src={largeUrl}
            alt={asset.filename}
            className="max-h-full max-w-full object-contain transition-transform duration-200"
            style={{ transform: `scale(${zoom})` }}
            draggable={false}
          />

          {/* Next */}
          {hasNext && (
            <button
              onClick={(e) => { e.stopPropagation(); onNext?.(); }}
              className={`absolute right-4 z-10 ${btnClass}`}
              aria-label="Next photo (Right arrow)"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>

        {/* Comments sidebar */}
        {showComments && (
          <div className="w-80 shrink-0 border-l border-white/10 bg-black/80 backdrop-blur-sm flex flex-col">
            <div className="p-4 border-b border-white/10">
              <h3 className="text-sm font-semibold text-white">Comments</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-sm text-white/40 text-center py-8">No comments yet</p>
            </div>
            <div className="p-4 border-t border-white/10">
              <textarea
                ref={commentInputRef}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitComment();
                  }
                }}
                placeholder="Add a comment..."
                className="w-full resize-none rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-white/40 focus:outline-none"
                rows={2}
              />
              <button
                onClick={handleSubmitComment}
                disabled={!commentText.trim()}
                className="mt-2 w-full rounded-lg bg-white/10 py-2 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 transition-colors"
              >
                Post Comment
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar: proofing tools + info */}
      <div className="px-4 pb-4 shrink-0">
        {/* Proofing toolbar */}
        {isProofing && (
          <div className="mb-3 flex items-center justify-center gap-3">
            <button
              onClick={() => onProofingAction?.(asset.id, "select")}
              className="flex items-center gap-2 rounded-full bg-blue-500/20 px-5 py-2.5 text-sm font-medium text-blue-300 hover:bg-blue-500/30 transition-colors"
              title="Select (1)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
              </svg>
              Select
            </button>
            <button
              onClick={() => onProofingAction?.(asset.id, "approve")}
              className="flex items-center gap-2 rounded-full bg-green-500/20 px-5 py-2.5 text-sm font-medium text-green-300 hover:bg-green-500/30 transition-colors"
              title="Approve (2)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Approve
            </button>
            <button
              onClick={() => onProofingAction?.(asset.id, "reject")}
              className="flex items-center gap-2 rounded-full bg-red-500/20 px-5 py-2.5 text-sm font-medium text-red-300 hover:bg-red-500/30 transition-colors"
              title="Reject (3)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Reject
            </button>
          </div>
        )}

        {/* Keyboard shortcuts hint */}
        <div className="mb-2 flex items-center justify-center gap-4 text-[10px] text-white/30">
          <span>← → Navigate</span>
          <span>F Fullscreen</span>
          <span>I Info</span>
          <span>C Comments</span>
          <span>+/- Zoom</span>
          <span>0 Reset</span>
          <span>Esc Close</span>
          {isProofing && <span>1/2/3 Select/Approve/Reject</span>}
        </div>

        {/* Info panel */}
        {showInfo && (
          <div className="mx-auto max-w-2xl rounded-xl bg-white/10 px-6 py-4 text-white backdrop-blur-sm">
            <div className="flex items-start justify-between">
              <p className="text-sm text-white/70">
                {asset.width && asset.height
                  ? `${asset.width} x ${asset.height} px`
                  : "Dimensions unknown"}{" "}
                — {formatBytes(asset.size_bytes)} — {asset.content_type}
              </p>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  asset.status === "ready"
                    ? "bg-green-500/20 text-green-300"
                    : asset.status === "failed"
                    ? "bg-red-500/20 text-red-300"
                    : "bg-yellow-500/20 text-yellow-300"
                }`}
              >
                {asset.status}
              </span>
            </div>

            {Object.keys(exif).length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-white/10 pt-3 text-sm sm:grid-cols-3">
                {exif.camera_make && (
                  <div><span className="text-white/50">Camera:</span> {String(exif.camera_make)} {String(exif.camera_model || "")}</div>
                )}
                {exif.focal_length && (
                  <div><span className="text-white/50">Focal:</span> {String(exif.focal_length)}mm</div>
                )}
                {exif.exposure_time && (
                  <div><span className="text-white/50">Shutter:</span> {String(exif.exposure_time)}</div>
                )}
                {exif.f_number && (
                  <div><span className="text-white/50">Aperture:</span> f/{String(exif.f_number)}</div>
                )}
                {exif.iso && (
                  <div><span className="text-white/50">ISO:</span> {String(exif.iso)}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
