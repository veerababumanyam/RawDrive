"use client";

import { useCallback, useEffect } from "react";
import type { Asset } from "@/lib/api/assets";

interface PhotoLightboxProps {
  asset: Asset;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev: boolean;
  hasNext: boolean;
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
}: PhotoLightboxProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev && onPrev) onPrev();
      if (e.key === "ArrowRight" && hasNext && onNext) onNext();
    },
    [onClose, onPrev, onNext, hasPrev, hasNext]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  // Use the largest thumbnail for the lightbox, fallback to download_url
  const largeUrl =
    asset.thumbnail_urls?.lg ||
    asset.thumbnail_urls?.cover_1920 ||
    asset.download_url ||
    Object.values(asset.thumbnail_urls || {})[0] ||
    "";

  const exif = asset.exif_data || {};

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo: ${asset.filename}`}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
        aria-label="Close lightbox"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Previous button */}
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
          className="absolute left-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
          aria-label="Previous photo"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Next button */}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext?.(); }}
          className="absolute right-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
          aria-label="Next photo"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Main image */}
      <div className="flex max-h-[85vh] max-w-[85vw] flex-col items-center">
        <img
          src={largeUrl}
          alt={asset.filename}
          className="max-h-[70vh] max-w-full rounded-lg object-contain"
          draggable={false}
        />

        {/* Info panel below image */}
        <div className="mt-4 w-full max-w-2xl rounded-xl bg-white/10 px-6 py-4 text-white backdrop-blur-sm">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold">{asset.filename}</h3>
              <p className="mt-1 text-sm text-white/70">
                {asset.width && asset.height
                  ? `${asset.width} x ${asset.height} px`
                  : "Dimensions unknown"}{" "}
                — {formatBytes(asset.size_bytes)} — {asset.content_type}
              </p>
            </div>
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

          {/* EXIF data if available */}
          {Object.keys(exif).length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-white/10 pt-3 text-sm">
              {exif.camera_make && (
                <div>
                  <span className="text-white/50">Camera:</span>{" "}
                  <span>{String(exif.camera_make)} {String(exif.camera_model || "")}</span>
                </div>
              )}
              {exif.focal_length && (
                <div>
                  <span className="text-white/50">Focal:</span> <span>{String(exif.focal_length)}mm</span>
                </div>
              )}
              {exif.exposure_time && (
                <div>
                  <span className="text-white/50">Shutter:</span> <span>{String(exif.exposure_time)}</span>
                </div>
              )}
              {exif.f_number && (
                <div>
                  <span className="text-white/50">Aperture:</span> <span>f/{String(exif.f_number)}</span>
                </div>
              )}
              {exif.iso && (
                <div>
                  <span className="text-white/50">ISO:</span> <span>{String(exif.iso)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
