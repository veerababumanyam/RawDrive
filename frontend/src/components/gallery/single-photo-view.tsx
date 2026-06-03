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
import { LIGHTBOX_VARIANTS, assetUsesClientMediaEncryption, originalManifest, variantManifest } from "@/lib/media-encryption/asset-media";
import { decryptBlobWithAvailableMediaKeys } from "@/lib/media-encryption/media-key-store";
import { publicMediaErrorMessage } from "@/lib/media-encryption/public-media-error";
import {
  appendCurrentGalleryKeyFragment,
  setUrlSearchParamBeforeFragment,
} from "@/lib/media-encryption/share-url";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";
import { WatermarkOverlay } from "./watermark-overlay";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type PublicDownloadFormat = "webp" | "thumbnail" | "original";

function downloadFormatsForQuality(value: string | undefined | null): PublicDownloadFormat[] {
  if (value === "original") return ["original"];
  if (value === "thumbnail") return ["thumbnail"];
  return ["webp"];
}

function publicDownloadLabel(format: PublicDownloadFormat): string {
  if (format === "original") return "Download original";
  if (format === "thumbnail") return "Download thumbnail";
  return "Download WebP";
}

function publicDownloadFilename(photo: PublicAsset, format: PublicDownloadFormat): string {
  if (format === "original") return photo.filename;
  if (format === "thumbnail") return "thumb_" + photo.filename.replace(/\.[^.]+$/, ".webp");
  return photo.filename.replace(/\.[^.]+$/, ".webp");
}

function encryptedDownloadManifest(photo: PublicAsset, format: PublicDownloadFormat) {
  if (format === "original") return originalManifest(photo);
  if (format === "thumbnail") {
    return (
      variantManifest(photo, "thumb_lg_webp") ||
      variantManifest(photo, "thumb_md_webp") ||
      variantManifest(photo, "thumb_sm_webp")
    );
  }
  return (
    variantManifest(photo, "display_webp") ||
    variantManifest(photo, "thumb_lg_webp") ||
    variantManifest(photo, "thumb_md_webp") ||
    variantManifest(photo, "thumb_sm_webp")
  );
}

interface Props {
  slug: string;
  photo: PublicAsset;
  gallery: Gallery;
  branding: GalleryBranding | null;
  // S4-G1: gallery-session token (when the gallery is gated) appended as `?gs=`
  // to the protected image bytes so the cross-origin <img> authenticates.
  gallerySessionToken?: string | null;
  workspaceScope?: string | null;
}

export function SinglePhotoView({
  slug,
  photo,
  gallery,
  branding,
  gallerySessionToken = null,
  workspaceScope = null,
}: Props) {
  const [shareCopied, setShareCopied] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Client-side media-encryption aware image resolution (feature branch). The
  // hook picks the largest PUBLIC WebP variant and, for E2EE-shared galleries,
  // decrypts the blob in the browser using the key carried in the URL hash.
  //
  // Gated-gallery byte auth (origin/main security control): the
  // `gallerySessionToken` is passed in the hook's dedicated 4th slot so it
  // routes to getStorageBackedUrl's `?gs=` query param — the only one the
  // storage proxy reads for gallery sessions on a split-origin deployment
  // (storage is served from the API origin, where the SameSite gallery_session
  // cookie does not reach). For open/published galleries the bytes serve
  // anonymously and the token is ignored; gated same-origin deployments also
  // still work via the SameSite cookie.
  const media = useDecryptedAssetUrl(photo, LIGHTBOX_VARIANTS, null, gallerySessionToken);

  const brandName = branding?.can_customize ? branding.brand_name : null;
  const downloadEnabled = gallery.download_enabled !== false;
  const allowedDownloadFormats = downloadEnabled ? downloadFormatsForQuality(gallery.download_quality) : [];
  const wm = gallery.watermark_config as Record<string, unknown> | undefined;
  const watermarkConfig = wm && wm.enabled === true ? wm : undefined;

  const plainShareUrl = typeof window !== "undefined"
    ? setUrlSearchParamBeforeFragment(`${window.location.origin}/g/${slug}/photo/${photo.id}`, "ws", workspaceScope)
    : "";
  const shareUrl = appendCurrentGalleryKeyFragment(plainShareUrl);

  async function handleDownload(format: PublicDownloadFormat) {
    const url = new URL(`${API_BASE}/api/v1/public/galleries/${slug}/assets/${photo.id}/download`);
    url.searchParams.set("format", format);
    if (workspaceScope) {
      url.searchParams.set("ws", workspaceScope);
    }
    if (gallerySessionToken) {
      url.searchParams.set("gs", gallerySessionToken);
    }
    if (!assetUsesClientMediaEncryption(photo)) {
      window.open(url.toString(), "_self");
      return;
    }
    const manifest = encryptedDownloadManifest(photo, format);
    if (!manifest) return;
    const res = await fetch(url.toString());
    if (!res.ok) return;
    const plaintext = await decryptBlobWithAvailableMediaKeys(await res.blob(), manifest);
    const objectUrl = URL.createObjectURL(plaintext);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = publicDownloadFilename(photo, format);
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

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
          {allowedDownloadFormats.map((format) => (
            <GlassIconButton
              key={format}
              size="sm"
              label={publicDownloadLabel(format)}
              onClick={() => {
                void handleDownload(format);
              }}
            >
              <Download />
            </GlassIconButton>
          ))}
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
        {media.src ? (
          <div className="relative max-h-full max-w-full">
            <img
              src={media.src}
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
            <p className="text-sm text-text-secondary">
              {media.loading ? "Decrypting photo..." : publicMediaErrorMessage(media.error) || "Image unavailable"}
            </p>
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
