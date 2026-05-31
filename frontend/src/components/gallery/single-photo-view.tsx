"use client";

/**
 * SinglePhotoView — public viewer for ONE shared photo.
 *
 * Rendered by `/g/[slug]/photo/[assetId]`. The recipient of a per-tile share
 * link sees only this single image plus minimal photographer branding — they
 * cannot see the rest of the gallery (no grid, no chips, no products, no
 * filmstrip, no nav back to the gallery shell).
 *
 * Why this exists separately from the `?asset=<id>` deep-link in
 * public-gallery-grid.tsx: that param opens the full gallery viewer with the
 * lightbox pre-popped to the asset — fine for "share my view position" but
 * exposes the rest of the gallery. The user-facing requirement here was
 * "receiver must only see that particular image only, not complete gallery."
 * So a separate route with a fresh shell, and the per-tile Share button
 * generates THIS URL, not the `?asset=` URL.
 */

import { useEffect, useState } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Download, Share, XCircle, ZoomIn, ZoomOut } from "@/components/icons";
import type { Gallery, GalleryBranding, PublicAsset } from "@/lib/api/galleries";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { WatermarkOverlay } from "./watermark-overlay";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface Props {
  slug: string;
  photo: PublicAsset;
  gallery: Gallery;
  branding: GalleryBranding | null;
  // S4-G1: gallery-session token (when the gallery is gated) appended as `?gs=`
  // to the protected image bytes so the cross-origin <img> authenticates.
  gallerySessionToken?: string | null;
}

export function SinglePhotoView({ slug, photo, gallery, branding, gallerySessionToken = null }: Props) {
  const [shareCopied, setShareCopied] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Prefer the largest PUBLIC variant (thumb_lg_webp, ~1200px). Same fallback
  // chain as the public lightbox — display_webp is auth-gated under the
  // M41/104 split and would 401 for unauthenticated share recipients.
  const photoUrl = getStorageBackedUrl(
    photo.thumbnail_urls?.thumb_lg_webp ||
    photo.thumbnail_urls?.thumb_md_webp ||
    photo.thumbnail_urls?.thumb_lg ||
    photo.thumbnail_urls?.lg ||
    photo.thumbnail_urls?.display_webp ||
    Object.values(photo.thumbnail_urls || {})[0] ||
    "",
    null,
    gallerySessionToken,
  );

  const brandName = branding?.can_customize ? branding.brand_name : null;
  const downloadEnabled = gallery.download_enabled !== false;
  const wm = gallery.watermark_config as Record<string, unknown> | undefined;
  const watermarkConfig = wm && wm.enabled === true ? wm : undefined;

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/g/${slug}/photo/${photo.id}`
    : "";

  async function handleShare() {
    // Web Share API on mobile gives the native sheet (WhatsApp, Mail,
    // Messages, etc.). Falls back to copy-to-clipboard on desktop where
    // canShare isn't available.
    const data = { title: photo.filename, url: shareUrl };
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (d: { title: string; url: string }) => Promise<void> }).share(data);
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard so
        // they still have a way to grab the link.
      }
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else if (typeof document !== "undefined") {
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1600);
    } catch {
      // Silent: the chrome already shows a Share state.
    }
  }

  // Keyboard zoom shortcuts to match the public lightbox affordances.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
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
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      {/* Top bar — brand label only (NO link to the gallery shell, per
          requirement that the receiver shouldn't see the rest of the
          gallery). Filename on the right for context. */}
      <header className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-border-subtle">
        <div className="flex min-w-0 items-center gap-3 text-text-secondary text-sm">
          {brandName ? (
            <span className="font-medium text-text-primary truncate">{brandName}</span>
          ) : (
            <span className="font-medium text-text-primary truncate">RawDrive</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <GlassIconButton size="sm" label="Zoom out" onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}>
            <ZoomOut />
          </GlassIconButton>
          <span className="text-text-tertiary text-xs w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <GlassIconButton size="sm" label="Zoom in" onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}>
            <ZoomIn />
          </GlassIconButton>
          <div className="w-px h-6 bg-border-subtle mx-1" />
          {downloadEnabled && (
            <GlassIconButton
              size="sm"
              label="Download"
              onClick={() => {
                window.open(`${API_BASE}/api/v1/public/galleries/${slug}/assets/${photo.id}/download`, "_self");
              }}
            >
              <Download />
            </GlassIconButton>
          )}
          <GlassIconButton
            size="sm"
            variant={shareCopied ? "success" : "glass"}
            label={shareCopied ? "Link copied" : "Share photo"}
            onClick={handleShare}
          >
            <Share />
          </GlassIconButton>
        </div>
      </header>

      {/* Photo region — centered, full-bleed within the remaining viewport
          height. Watermark overlay sits on top with pointer-events-none so
          the user can still right-click → save (which, for galleries with
          downloads disabled, won't yield the original anyway). */}
      <main className="relative flex flex-1 items-center justify-center overflow-auto p-4 sm:p-8">
        {photoUrl ? (
          <div className="relative max-h-full max-w-full">
            <img
              src={photoUrl}
              alt={photo.filename}
              width={photo.width || undefined}
              height={photo.height || undefined}
              className="max-h-[85vh] max-w-full object-contain transition-transform duration-200"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
              draggable={false}
            />
            {watermarkConfig && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
              >
                <WatermarkOverlay config={watermarkConfig as Gallery["watermark_config"]} />
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            <XCircle className="mx-auto mb-2 h-8 w-8 text-text-tertiary" />
            <p className="text-sm text-text-secondary">Image unavailable</p>
          </div>
        )}
      </main>

      {/* Filename caption — small, centered, kept on a separate row so the
          photo always reads first. Hides on tall portrait screens where it
          would steal vertical space. */}
      <footer className="shrink-0 px-4 pb-4 text-center text-xs text-text-tertiary">
        <p className="truncate">{photo.filename}</p>
      </footer>
    </div>
  );
}
