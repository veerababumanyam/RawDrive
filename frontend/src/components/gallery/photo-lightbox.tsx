"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Asset } from "@/lib/api/assets";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import {
  ChevronLeft, ChevronRight, XMark, Download, Expand, Compress,
  ZoomIn, ZoomOut, InfoCircle, ChatBubble, CheckCircle, ThumbsUp, XCircle,
} from "@/components/icons";

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
  asset, onClose, onPrev, onNext, hasPrev, hasNext,
  isProofing = false, onProofingAction, onComment,
}: PhotoLightboxProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    switch (e.key) {
      case "Escape": isFullscreen ? document.exitFullscreen?.() : onClose(); break;
      case "ArrowLeft": if (hasPrev && onPrev) onPrev(); break;
      case "ArrowRight": if (hasNext && onNext) onNext(); break;
      case "f": case "F": toggleFullscreen(); break;
      case "i": case "I": setShowInfo(s => !s); break;
      case "c": case "C": setShowComments(s => !s); break;
      case "+": case "=": setZoom(z => Math.min(z + 0.25, 3)); break;
      case "-": setZoom(z => Math.max(z - 0.25, 0.5)); break;
      case "0": setZoom(1); break;
      case "1": if (isProofing) onProofingAction?.(asset.id, "select"); break;
      case "2": if (isProofing) onProofingAction?.(asset.id, "approve"); break;
      case "3": if (isProofing) onProofingAction?.(asset.id, "reject"); break;
    }
  }, [onClose, onPrev, onNext, hasPrev, hasNext, isFullscreen, isProofing, asset.id, onProofingAction]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handleKeyDown); document.body.style.overflow = ""; };
  }, [handleKeyDown]);

  useEffect(() => { setZoom(1); }, [asset.id]);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  }, []);

  const handleDownloadFormat = (format: "original" | "webp" | "thumbnail") => {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    let url: string; let filename: string;
    switch (format) {
      case "webp": url = asset.thumbnail_urls?.display_webp || asset.thumbnail_urls?.thumb_lg_webp || ""; filename = asset.filename.replace(/\.[^.]+$/, ".webp"); break;
      case "thumbnail": url = asset.thumbnail_urls?.thumb_lg || asset.thumbnail_urls?.lg || ""; filename = "thumb_" + asset.filename; break;
      default: url = asset.download_url || asset.storage_key || ""; filename = asset.filename;
    }
    if (!url) return;
    if (!url.startsWith("http")) url = `${API_BASE}/storage/${url}`;
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  };

  const handleSubmitComment = () => {
    if (commentText.trim() && onComment) { onComment(asset.id, commentText.trim()); setCommentText(""); }
  };

  const largeUrl = asset.thumbnail_urls?.lg || asset.thumbnail_urls?.cover_1920 || asset.download_url || Object.values(asset.thumbnail_urls || {})[0] || "";
  const exif = asset.exif_data || {};

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={e => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={`Photo: ${asset.filename}`}>

      {/* ─── Top Toolbar ─── */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="flex items-center gap-3 text-white text-sm">
          <span className="font-medium truncate max-w-[200px] sm:max-w-[400px]">{asset.filename}</span>
          {asset.width && asset.height && <span className="hidden sm:inline text-white/40 text-xs">{asset.width} x {asset.height}</span>}
          {zoom !== 1 && <span className="text-white/40 text-xs">{Math.round(zoom * 100)}%</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <GlassIconButton size="sm" label="Zoom out (-)" onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))}><ZoomOut /></GlassIconButton>
          <GlassIconButton size="sm" label="Zoom in (+)" onClick={() => setZoom(z => Math.min(z + 0.25, 3))}><ZoomIn /></GlassIconButton>
          <div className="w-px h-6 bg-white/10 mx-1" />
          <GlassIconButton size="sm" label="Comments (C)" active={showComments} onClick={() => setShowComments(s => !s)}><ChatBubble /></GlassIconButton>
          <GlassIconButton size="sm" label="Info (I)" active={showInfo} onClick={() => setShowInfo(s => !s)}><InfoCircle /></GlassIconButton>
          <div className="relative">
            <GlassIconButton size="sm" label="Download" active={showDownloadMenu} onClick={() => setShowDownloadMenu(s => !s)}><Download /></GlassIconButton>
            {showDownloadMenu && (
              <div className="absolute right-0 top-11 z-20 w-56 rounded-2xl bg-black/80 backdrop-blur-xl border border-white/10 py-2 shadow-2xl">
                <button onClick={() => { handleDownloadFormat("original"); setShowDownloadMenu(false); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/10 rounded-lg mx-1" style={{width: "calc(100% - 8px)"}}>
                  <span className="text-white/40 text-[10px] font-semibold tracking-wider w-10">ORIG</span>
                  <span>Original ({formatBytes(asset.size_bytes)})</span>
                </button>
                {asset.thumbnail_urls?.display_webp && (
                  <button onClick={() => { handleDownloadFormat("webp"); setShowDownloadMenu(false); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/10 rounded-lg mx-1" style={{width: "calc(100% - 8px)"}}>
                    <span className="text-white/40 text-[10px] font-semibold tracking-wider w-10">WebP</span>
                    <span>Optimized</span>
                  </button>
                )}
                <button onClick={() => { handleDownloadFormat("thumbnail"); setShowDownloadMenu(false); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/10 rounded-lg mx-1" style={{width: "calc(100% - 8px)"}}>
                  <span className="text-white/40 text-[10px] font-semibold tracking-wider w-10">SMALL</span>
                  <span>Thumbnail</span>
                </button>
              </div>
            )}
          </div>
          <GlassIconButton size="sm" label={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"} onClick={toggleFullscreen}>{isFullscreen ? <Compress /> : <Expand />}</GlassIconButton>
          <div className="w-px h-6 bg-white/10 mx-1" />
          <GlassIconButton size="sm" variant="ghost" label="Close (Esc)" onClick={onClose}><XMark /></GlassIconButton>
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Image area */}
        <div className="relative flex flex-1 items-center justify-center overflow-auto">
          {hasPrev && (
            <GlassIconButton size="lg" label="Previous (Left arrow)" className="absolute left-4 z-10" onClick={e => { e.stopPropagation(); onPrev?.(); }}><ChevronLeft /></GlassIconButton>
          )}
          <img src={largeUrl} alt={asset.filename} className="max-h-full max-w-full object-contain p-4 transition-transform duration-200" style={{ transform: `scale(${zoom})` }} draggable={false} />
          {hasNext && (
            <GlassIconButton size="lg" label="Next (Right arrow)" className="absolute right-4 z-10" onClick={e => { e.stopPropagation(); onNext?.(); }}><ChevronRight /></GlassIconButton>
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

      {/* ─── Bottom Bar ─── */}
      <div className="px-4 pb-4 shrink-0">
        {/* Proofing toolbar */}
        {isProofing && (
          <div className="mb-3 flex items-center justify-center gap-4">
            <GlassIconButton size="lg" variant="accent" label="Select (1)" onClick={() => onProofingAction?.(asset.id, "select")}><CheckCircle /></GlassIconButton>
            <GlassIconButton size="lg" variant="success" label="Approve (2)" onClick={() => onProofingAction?.(asset.id, "approve")}><ThumbsUp /></GlassIconButton>
            <GlassIconButton size="lg" variant="danger" label="Reject (3)" onClick={() => onProofingAction?.(asset.id, "reject")}><XCircle /></GlassIconButton>
          </div>
        )}

        {/* Keyboard hints */}
        <div className="mb-2 flex items-center justify-center gap-3 text-[10px] text-white/20 tracking-wide">
          <span>← → Navigate</span><span>F Fullscreen</span><span>I Info</span><span>C Comments</span><span>+/- Zoom</span><span>Esc Close</span>
          {isProofing && <span>1/2/3 Select/Approve/Reject</span>}
        </div>

        {/* Info panel */}
        {showInfo && (
          <div className="mx-auto max-w-2xl rounded-2xl bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] px-6 py-4 text-white shadow-[0_8px_32px_-4px_hsla(0,0%,0%,0.2)]">
            <div className="flex items-start justify-between">
              <p className="text-sm text-white/60">
                {asset.width && asset.height ? `${asset.width} x ${asset.height} px` : "Dimensions unknown"}{" "}
                — {formatBytes(asset.size_bytes)} — {asset.content_type}
              </p>
              <span className={`rounded-full px-3 py-0.5 text-[10px] font-semibold tracking-wider uppercase backdrop-blur-sm border ${
                asset.status === "ready" ? "bg-green-500/15 text-green-300 border-green-400/20" :
                asset.status === "failed" ? "bg-red-500/15 text-red-300 border-red-400/20" :
                "bg-yellow-500/15 text-yellow-300 border-yellow-400/20"
              }`}>{asset.status}</span>
            </div>
            {Object.keys(exif).length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-white/8 pt-3 text-xs sm:grid-cols-3">
                {exif.camera_make && <div><span className="text-white/35">Camera</span> <span className="text-white/70">{String(exif.camera_make)} {String(exif.camera_model || "")}</span></div>}
                {exif.focal_length && <div><span className="text-white/35">Focal</span> <span className="text-white/70">{String(exif.focal_length)}mm</span></div>}
                {exif.exposure_time && <div><span className="text-white/35">Shutter</span> <span className="text-white/70">{String(exif.exposure_time)}</span></div>}
                {exif.f_number && <div><span className="text-white/35">Aperture</span> <span className="text-white/70">f/{String(exif.f_number)}</span></div>}
                {exif.iso && <div><span className="text-white/35">ISO</span> <span className="text-white/70">{String(exif.iso)}</span></div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
