"use client";
import { getApiBaseUrl } from "@/lib/api/base-url";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  publicGalleryMusicUrl,
  type Gallery,
  type GalleryBranding,
  type PublicAsset,
} from "@/lib/api/galleries";
import {
  resolveCoverDeviceProfile,
  type CoverDevice,
  type CoverDeviceProfile,
  type CoverProfileThumbnailMap,
  type PublicDesignConfig,
} from "@/lib/gallery-design-config";
import { getCoverStyleById } from "@/components/gallery/cover-styles";
import {
  coverTemplateSlotIndices,
  getCoverTemplate,
  type CoverTemplate,
} from "@/components/gallery/cover-templates";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import {
  buildCoverGoogleFontsHref,
  fontFamilyForCoverText,
  getCoverLanguage,
} from "@/lib/indian-cover-typography";
import {
  getFullscreenElement,
  isFullscreenSupportedForElement,
  requestElementFullscreen,
} from "@/lib/browser-fullscreen";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";
import { assetUsesClientMediaEncryption } from "@/lib/media-encryption/asset-media";
import { publicMediaErrorMessage } from "@/lib/media-encryption/public-media-error";
import { GallerySlideshow } from "@/components/gallery/gallery-slideshow";
import { SlideshowSlide } from "@/components/gallery/public-gallery-slideshow-launcher";
import { LockedMediaFallback } from "@/components/gallery/media-key-recovery";
import { Camera, Play } from "@/components/icons";

const API_BASE = getApiBaseUrl();

function absoluteApiUrl(url?: string | null) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
}

// Cover image is rendered as a plain <img src> in the hero, so the URL
// MUST resolve to a publicly-readable storage path — there's no JWT we
// can attach for unauthenticated share-link visitors.
//
// Storage layout (migration 104, M41):
//   /storage/thumbnails/<id>/thumb_{sm,md,lg}_webp.webp  — PUBLIC, no auth
//   /storage/derivatives/<id>/display_webp.webp          — AUTH-PROTECTED
//
// Picking display_webp first (as this helper used to do) caused the cover
// to 401 for every public visitor, leaving a broken-image placeholder and
// — because the design overlay text sits ON the cover — making the title
// invisible against an empty background.
//
// Priority is now: public WebP thumbs (thumb_lg → thumb_md → thumb_sm) →
// display_webp as a WebP-only last resort. The hero is above-the-fold so
// thumb_lg_webp (typically ~1200px) is more than enough detail. Lightbox
// stays on display_webp via authenticated fetch + blob.
function pickFromThumbnails(
  urls: Record<string, string> | undefined | null,
): string {
  if (!urls) return "";
  return getStorageBackedUrl(
    urls.thumb_lg_webp ||
      urls.thumb_md_webp ||
      urls.thumb_sm_webp ||
      urls.display_webp ||
      "",
  );
}

export function resolvePublicCoverImage(
  gallery: Gallery,
  assets: PublicAsset[],
) {
  const preferred = gallery.cover_asset_id
    ? assets.find((asset) => asset.id === gallery.cover_asset_id)
    : assets[0];
  const asset = preferred || assets[0];
  if (!asset) return "";
  return pickFromThumbnails(asset.thumbnail_urls);
}

// Resolves the cover image URL the public viewer should render. Priority:
//  1. Design studio's chosen cover asset thumbnails (server-resolved into
//     `gallery.settings.cover_thumbnails` so the album-filtered share link
//     still has a cover even when the cover asset isn't in the album).
//  2. The matching asset from the asset list if the cover asset happens to
//     be present (legacy `gallery.cover_asset_id` path).
//  3. The first asset in the list as a final fallback.
function resolveDesignCoverImage(
  gallery: Gallery,
  assets: PublicAsset[],
  cover: CoverDeviceProfile,
  designCoverThumbnails: Record<string, string> | null,
): string {
  if (designCoverThumbnails) {
    const url = pickFromThumbnails(designCoverThumbnails);
    if (url) return url;
  }
  const designAssetId = cover.assetId || gallery.cover_asset_id;
  if (designAssetId) {
    const match = assets.find((a) => a.id === designAssetId);
    if (match) return pickFromThumbnails(match.thumbnail_urls);
  }
  return resolvePublicCoverImage(gallery, assets);
}

const HERO_VARIANTS = [
  "thumb_lg_webp",
  "thumb_md_webp",
  "thumb_sm_webp",
  "display_webp",
] as const;

type PublicCoverConfig = CoverDeviceProfile;

function resolvePublicCoverAsset(
  gallery: Gallery,
  assets: PublicAsset[],
): PublicAsset | null {
  const preferred = gallery.cover_asset_id
    ? assets.find((asset) => asset.id === gallery.cover_asset_id)
    : assets[0];
  return preferred || assets[0] || null;
}

function coverAssetFromThumbnails(
  gallery: Gallery,
  thumbnailUrls: Record<string, string> | null,
  assetId?: string | null,
): PublicAsset | null {
  if (!thumbnailUrls || Object.keys(thumbnailUrls).length === 0) return null;
  return {
    id: assetId || gallery.cover_asset_id || "design-cover",
    filename: gallery.title || "Cover photo",
    content_type: "image/webp",
    thumbnail_urls: thumbnailUrls,
    sort_order: -1,
  };
}

function resolveDesignCoverAsset(
  gallery: Gallery,
  assets: PublicAsset[],
  cover: CoverDeviceProfile,
  designCoverThumbnails: Record<string, string> | null,
  designCoverAsset?: PublicAsset | null,
): PublicAsset | null {
  if (
    designCoverAsset &&
    (!cover.assetId || designCoverAsset.id === cover.assetId)
  ) {
    return designCoverAsset;
  }

  const designAssetId = cover.assetId || gallery.cover_asset_id;
  if (designAssetId) {
    const match = assets.find((a) => a.id === designAssetId);
    if (match) return match;
  }

  return (
    coverAssetFromThumbnails(gallery, designCoverThumbnails, designAssetId) ||
    resolvePublicCoverAsset(gallery, assets)
  );
}

interface PublicGalleryHeroProps {
  gallery: Gallery;
  assets: PublicAsset[];
  branding?: GalleryBranding | null;
  // Design studio output. When present, the hero renders the saved cover
  // style, typography, accent color, title, and subtitle. When null,
  // falls back to the M19 legacy `cover_template` path so existing
  // galleries that never used the studio still render correctly.
  design?: PublicDesignConfig | null;
  designCoverAsset?: PublicAsset | null;
  designCoverThumbnails?: Record<string, string> | null;
  designCoverProfileThumbnails?: CoverProfileThumbnailMap | null;
  // Public slideshow wiring. The page passes these so the "Play" button can
  // sit next to "View Gallery" / "Find me" and open the same full-screen
  // slideshow the old standalone launcher exposed. Music remains optional:
  // when configured, the slideshow auto-opens and receives the audio URL.
  slug?: string;
  ws?: string | null;
  hasMusic?: boolean;
  assetAccessToken?: string | null;
  shareToken?: string | null;
  // Surfaces the "Find me" photo-search CTA in the hero CTA row, horizontally
  // aligned with Play + View Gallery. Maps to galleries.face_detection_enabled
  // (migration 046). Default-off so it only renders when the page explicitly
  // opts the gallery in — the FAB it replaced lived in
  // PublicGalleryEnhancements before this CTA-row consolidation.
  faceDetectionEnabled?: boolean;
  // Owner "View as client" preview only. The authenticated photographer's
  // access token, threaded into useDecryptedAssetUrl as its bearer `token` so
  // the encrypted cover's /storage bytes carry `Authorization: Bearer` and
  // decrypt for unpublished/private galleries. The public /g/[slug] route
  // leaves it unset (anonymous), so the cover path there is unchanged.
  viewerToken?: string | null;
}

// Maps the studio's overlay/scrim variant to a CSS color string. `light`
// keeps the cover photo bright with no overlay so dark text reads against
// it; `dark` and `auto` add increasing levels of dim so light text reads
// against a busy cover. Same mapping the Gallery Design Studio preview
// uses, so what-you-see-is-what-clients-see.
function variantScrim(
  variant: "light" | "dark" | "auto" | undefined,
): string | null {
  if (variant === "dark") return "var(--cover-scrim-dark)";
  if (variant === "auto") return "var(--cover-scrim-auto)";
  return null;
}

function coverExperienceScrim(
  style: PublicCoverConfig["scrimStyle"],
  variant: "light" | "dark" | "auto" | undefined,
): string | null {
  if (style === "none") return null;
  if (style === "soft-gradient")
    return "linear-gradient(to bottom, var(--cover-scrim-soft-start), var(--cover-scrim-soft-end))";
  if (style === "cinematic-dark")
    return "linear-gradient(180deg, var(--cover-scrim-cinematic-start), var(--cover-scrim-cinematic-end))";
  if (style === "warm-vignette") {
    return "radial-gradient(circle at 50% 45%, var(--cover-scrim-warm), var(--cover-scrim-soft-end) 72%)";
  }
  if (style === "blur-band")
    return "linear-gradient(to bottom, transparent 36%, var(--cover-scrim-band) 55%, transparent 76%)";
  if (style === "light-wash")
    return "linear-gradient(to bottom, var(--cover-scrim-light-start), var(--cover-scrim-light-end))";
  return variantScrim(variant);
}

function textBackdropStyle(
  backdrop: PublicCoverConfig["textBackdrop"],
): CSSProperties | undefined {
  if (backdrop === "glass") {
    return {
      background: "var(--cover-text-backdrop-glass-bg)",
      backdropFilter:
        "blur(calc(var(--glass-blur) * 0.6)) saturate(var(--glass-saturation))",
      border: "1px solid var(--cover-text-backdrop-glass-border)",
      borderRadius: "var(--radius-xl)",
      boxShadow: "var(--shadow-md)",
      padding: "var(--cover-text-backdrop-padding)",
    };
  }
  if (backdrop === "dark") {
    return {
      background: "var(--cover-text-backdrop-dark-bg)",
      borderRadius: "var(--radius-xl)",
      padding: "var(--cover-text-backdrop-padding)",
    };
  }
  if (backdrop === "light") {
    return {
      background: "var(--cover-text-backdrop-light-bg)",
      borderRadius: "var(--radius-xl)",
      padding: "var(--cover-text-backdrop-padding)",
    };
  }
  return undefined;
}

function useIsMobileViewport() {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return mobile;
}

function placementClass(
  placement:
    | NonNullable<PublicDesignConfig["branding"]>["logoPlacement"]
    | undefined,
) {
  if (placement === "top-right") return "top-6 right-6";
  if (placement === "bottom-left") return "bottom-6 left-6";
  if (placement === "bottom-right") return "bottom-6 right-6";
  return "top-6 left-6";
}

function mediaUrlForAsset(asset: PublicAsset | null | undefined): string {
  return pickFromThumbnails(asset?.thumbnail_urls);
}

function templateSlotAssetId(
  cover: PublicCoverConfig | undefined,
  slotIndex: number,
): string | null {
  if (!cover) return null;
  if (slotIndex === 0) {
    return cover.assetId || cover.assetSlots?.[0] || null;
  }
  return cover.assetSlots?.[slotIndex] || null;
}

function resolveTemplateSlotAssets({
  gallery,
  assets,
  cover,
  coverAsset,
  template,
}: {
  gallery: Gallery;
  assets: PublicAsset[];
  cover: PublicCoverConfig | undefined;
  coverAsset: PublicAsset | null;
  template: CoverTemplate;
}): Array<PublicAsset | null> {
  const orderedPool = [
    coverAsset,
    ...assets.filter((asset) => asset.id !== coverAsset?.id),
  ].filter((asset): asset is PublicAsset => Boolean(asset));
  return coverTemplateSlotIndices(template).map((slotIndex) => {
    const explicitId = templateSlotAssetId(cover, slotIndex);
    if (explicitId) {
      const explicit = assets.find((asset) => asset.id === explicitId);
      if (explicit) return explicit;
      if (slotIndex === 0 && coverAsset?.id === explicitId) return coverAsset;
    }
    if (slotIndex === 0)
      return coverAsset || resolvePublicCoverAsset(gallery, assets);
    return orderedPool[slotIndex] || orderedPool[0] || null;
  });
}

function templateSlotFocalPoint(
  cover: PublicCoverConfig | undefined,
  slotIndex: number,
): { x: number; y: number } {
  if (slotIndex === 0) {
    return cover?.focalPoint || { x: 50, y: 50 };
  }
  return cover?.slotFocalPoints?.[slotIndex] || { x: 50, y: 50 };
}

function PublicCoverTemplateMedia({
  template,
  assets,
  coverUrl,
  cover,
  title,
  viewerToken,
  assetAccessToken,
}: {
  template: CoverTemplate;
  assets: Array<PublicAsset | null>;
  coverUrl: string;
  cover: PublicCoverConfig | undefined;
  title: string;
  viewerToken: string | null;
  assetAccessToken: string | null;
}) {
  return (
    <div
      className={`cover-template-layout cover-template-layout--${template.layout}`}
      data-cover-template={template.id}
      data-testid={
        template.layout === "quad"
          ? "gallery-cover-photo-grid"
          : "gallery-cover-template"
      }
    >
      {coverTemplateSlotIndices(template).map((slotIndex) => (
        <PublicCoverTemplateSlot
          key={slotIndex}
          asset={assets[slotIndex]}
          fallbackUrl={slotIndex === 0 ? coverUrl : ""}
          focalPoint={templateSlotFocalPoint(cover, slotIndex)}
          title={title}
          slotIndex={slotIndex}
          viewerToken={viewerToken}
          assetAccessToken={assetAccessToken}
        />
      ))}
      {template.layout === "journal" && (
        <div className="cover-template-journal-panel" aria-hidden />
      )}
      {template.layout === "outline" && (
        <div className="cover-template-outline" aria-hidden />
      )}
    </div>
  );
}

function PublicCoverTemplateSlot({
  asset,
  fallbackUrl,
  focalPoint,
  title,
  slotIndex,
  viewerToken,
  assetAccessToken,
}: {
  asset: PublicAsset | null | undefined;
  fallbackUrl: string;
  focalPoint: { x: number; y: number };
  title: string;
  slotIndex: number;
  viewerToken: string | null;
  assetAccessToken: string | null;
}) {
  const media = useDecryptedAssetUrl(
    asset,
    HERO_VARIANTS,
    viewerToken,
    assetAccessToken,
  );
  const rawFallback = assetUsesClientMediaEncryption(asset)
    ? ""
    : mediaUrlForAsset(asset);
  const src = media.src || rawFallback || fallbackUrl;
  return (
    <div
      className="cover-template-slot"
      data-cover-slot={slotIndex}
      data-testid={`gallery-cover-template-slot-${slotIndex}`}
    >
      {src ? (
        <img
          src={src}
          alt={slotIndex === 0 ? title : ""}
          className="cover-template-slot__image"
          style={{
            objectPosition: `${focalPoint.x}% ${focalPoint.y}%`,
          }}
          loading={slotIndex === 0 ? "eager" : "lazy"}
        />
      ) : media.loading ? (
        <div className="cover-template-slot__fallback">
          <span className="text-xs text-text-tertiary">Loading cover</span>
        </div>
      ) : (
        <LockedMediaFallback
          asset={asset}
          error={media.error}
          message={publicMediaErrorMessage(media.error) || "Cover unavailable"}
          className="cover-template-slot__fallback"
        />
      )}
    </div>
  );
}

function sceneCoverUrl(
  scene: NonNullable<PublicDesignConfig["sceneHeaders"]>[number],
  assets: PublicAsset[],
  fallbackAsset: PublicAsset | null,
): string {
  const sceneAsset = scene.assetId
    ? assets.find((asset) => asset.id === scene.assetId)
    : null;
  return mediaUrlForAsset(sceneAsset || fallbackAsset);
}

function CoverSlideshow({
  coverUrl,
  assets,
  title,
  objectPosition,
}: {
  coverUrl: string;
  assets: PublicAsset[];
  title: string;
  objectPosition: string;
}) {
  const urls = [
    coverUrl,
    ...assets.map((asset) => mediaUrlForAsset(asset)),
  ].filter(
    (url, index, all): url is string =>
      Boolean(url) && all.indexOf(url) === index,
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (urls.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % urls.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [urls.length]);

  if (urls.length === 0) return null;

  return (
    <img
      src={urls[index] || urls[0]}
      alt={title}
      className="absolute inset-0 h-full w-full object-cover transition-opacity"
      style={{ objectPosition }}
      loading="eager"
      data-testid="gallery-cover-slideshow"
    />
  );
}

// Central design-system CTA classes. The public-cover call-to-actions build
// on the shared .glass-button primitive (translucent liquid-glass surface,
// ≥44px touch target, token-driven focus via the global *:focus-visible rule)
// so "Play", "View Gallery" and "Find Me" read as one consistent group.
const COVER_CTA_CLASS = "glass-button glass-button--surface glass-button--md";

function requestPageFullscreenForSlideshow() {
  if (typeof document === "undefined") return;
  if (getFullscreenElement(document)) return;

  const target = document.documentElement;
  if (!isFullscreenSupportedForElement(target, document)) return;
  try {
    const request = requestElementFullscreen(target, {
      navigationUI: "hide",
    });
    if (request && typeof request.catch === "function") {
      request.catch(() => {});
    }
  } catch {
    // Fullscreen is a progressive enhancement; opening the slideshow is primary.
  }
}

// Play CTA — opens the in-page slideshow rather than navigating, so it is a
// real <button>. It uses the same .glass-button primitive as the View Gallery /
// Find Me anchors so the whole CTA row reads as one matched set. Sits first in
// the row, before View Gallery and Find Me.
function PlaySlideshowButton({
  onClick,
  accent,
}: {
  onClick: () => void;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Play slideshow"
      className={COVER_CTA_CLASS}
      style={accent ? { borderColor: accent } : undefined}
    >
      <span className="glass-button__icon">
        <Play width={18} height={18} aria-hidden />
      </span>
      <span>Play</span>
    </button>
  );
}

/**
 * CoverCtaGroup — the public cover's call-to-action pair. Renders the
 * "View Gallery" scroll link and the "Find Me" photo-search entry as a single
 * matched set, replacing the old detached "Find me with my camera" FAB that
 * floated off the central design system in PublicGalleryEnhancements. An
 * optional leading Play control (passed via `slideshowControl`) is rendered
 * first so the music slideshow CTA shares the same row and glass styling.
 */
function CoverCtaGroup({
  slug,
  ws,
  shareToken,
  showViewGallery = true,
  showPhotoSearch,
  accent,
  className,
  slideshowControl,
}: {
  slug: string;
  ws?: string | null;
  shareToken?: string | null;
  showViewGallery?: boolean;
  showPhotoSearch: boolean;
  accent?: string;
  className?: string;
  slideshowControl?: ReactNode;
}) {
  if (!slideshowControl && !showViewGallery && !showPhotoSearch) return null;
  // Studio accent (when the tier permits it) recolours the glass border to
  // keep brand continuity, exactly as the legacy View Gallery pill did.
  const accentStyle = accent ? { borderColor: accent } : undefined;
  // Preserve the share-link access scope (#175) on the "Find me" navigation —
  // the standalone photo-search page forwards it so the POST self-authorizes
  // via tryBindShareSession even when the gallery_session cookie is absent
  // (no-PIN share arrival). Without this the link strips ?share= and 403s.
  const photoSearchHref = (() => {
    const params = new URLSearchParams();
    if (ws) params.set("ws", ws);
    if (shareToken) params.set("share", shareToken);
    const qs = params.toString();
    return qs ? `/g/${slug}/photo-search?${qs}` : `/g/${slug}/photo-search`;
  })();
  return (
    <div
      className={`flex flex-wrap items-center gap-3${className ? ` ${className}` : ""}`}
    >
      {slideshowControl}
      {showViewGallery && (
        <a href="#gallery-grid" className={COVER_CTA_CLASS} style={accentStyle}>
          <span>View Gallery</span>
        </a>
      )}
      {showPhotoSearch && (
        <a
          href={photoSearchHref}
          aria-label="Find your photos with your camera"
          className={COVER_CTA_CLASS}
          style={accentStyle}
        >
          <span className="glass-button__icon">
            <Camera width={18} height={18} aria-hidden />
          </span>
          <span>Find me</span>
        </a>
      )}
    </div>
  );
}

export function PublicGalleryHero({
  gallery,
  assets,
  branding,
  design,
  designCoverAsset,
  designCoverThumbnails,
  designCoverProfileThumbnails,
  slug,
  ws,
  hasMusic = false,
  assetAccessToken,
  shareToken,
  faceDetectionEnabled = false,
  viewerToken = null,
}: PublicGalleryHeroProps) {
  const mobileViewport = useIsMobileViewport();
  // Whether to surface the public slideshow at all: it only needs a slug and
  // at least one photo. The retired page-level launcher always showed Play for
  // photo galleries; music only controlled whether audio was wired in.
  const slideshowEnabled = Boolean(slug) && assets.length > 0;
  const slideshowHasMusic = slideshowEnabled && hasMusic;
  // Auto-open on mount when the gallery has music, so the music plays as soon
  // as the /g/[slug] link opens — same UX the standalone launcher gave via
  // autoStart. Initializing state lazily from props (rather than a
  // set-state-in-effect) keeps this React-Compiler-safe and avoids a flash of
  // the closed state.
  const [slideshowOpen, setSlideshowOpen] = useState(() => slideshowHasMusic);
  const openSlideshow = () => {
    requestPageFullscreenForSlideshow();
    setSlideshowOpen(true);
  };
  const closeSlideshow = () => setSlideshowOpen(false);
  const slideshowOverlay =
    slideshowEnabled && slideshowOpen ? (
      <GallerySlideshow
        slideCount={assets.length}
        renderSlide={(i) => (
          <SlideshowSlide
            asset={assets[i]}
            assetAccessToken={assetAccessToken ?? null}
            position={i + 1}
            total={assets.length}
          />
        )}
        musicUrl={
          slideshowHasMusic && slug
            ? publicGalleryMusicUrl(slug, ws, assetAccessToken, shareToken)
            : null
        }
        onClose={closeSlideshow}
      />
    ) : null;
  const canUseStudioBrand = Boolean(
    branding?.can_customize && branding.public_branding_enabled !== false,
  );
  // Brand chip only renders when the studio HAS configured branding for
  // the public viewer. Prior to this fix, the fallback was the literal
  // string "RawDrive" which forced the platform's own wordmark onto every
  // guest gallery whose studio hadn't customized branding — the app was
  // self-promoting on top of client photos. Empty string means "no chip".
  // Three downstream render sites already guard on `(logoUrl || brandName)`
  // so dropping the fallback removes the chip entirely when nothing is
  // configured.
  const brandName = canUseStudioBrand ? branding?.brand_name?.trim() || "" : "";
  const logoUrl = canUseStudioBrand ? absoluteApiUrl(branding?.logo_url) : "";
  const studioAccent = canUseStudioBrand ? branding?.accent_color || "" : "";
  const photoSearchSlug = slug || gallery.slug;
  // "Find me" photo-search CTA gating. It sits last in the hero CTA row, after
  // Play and View Gallery, and links to /g/{slug}/photo-search.
  //
  // Two entry points feed the same control:
  //   1. The page passes `faceDetectionEnabled` (computed from the gallery's
  //      face_detection_enabled field) alongside the `slug` it uses for the
  //      slideshow music URL — the authoritative production path.
  //   2. When the hero is mounted without those props (e.g. embedded previews)
  //      it falls back to the gallery's own face_detection_enabled field, which
  //      defaults to true in the schema (migration 046); only an explicit false
  //      hides it.
  // An explicit `face_detection_enabled: false` always wins and hides the CTA.
  const photoSearchEnabled =
    gallery.face_detection_enabled !== false && (faceDetectionEnabled || !slug);
  const findMeEnabled = photoSearchEnabled;

  const coverDevice: CoverDevice = mobileViewport ? "phone" : "desktop";
  const activeProfile = resolveCoverDeviceProfile(design, coverDevice);
  const activeCover = activeProfile.cover;
  const activeTypography = activeProfile.typography;
  const activeProfileThumbnails =
    designCoverProfileThumbnails?.[coverDevice] ||
    (coverDevice === "phone"
      ? designCoverProfileThumbnails?.desktop || designCoverThumbnails
      : designCoverThumbnails) ||
    null;

  // Design-driven path — runs when the studio has saved anything we can
  // act on. We check the resolved cover profile's styleId rather than just
  // "design exists" so an entirely-empty design_config still falls through
  // to the legacy path for predictability.
  const designStyleId = activeCover.styleId;
  const designStyle = designStyleId
    ? getCoverStyleById(designStyleId)
    : undefined;
  const resolvedDesignCoverAsset =
    design && designStyle
      ? resolveDesignCoverAsset(
          gallery,
          assets,
          activeCover,
          activeProfileThumbnails,
          designCoverAsset,
        )
      : null;
  const legacyCoverAsset = !resolvedDesignCoverAsset
    ? resolvePublicCoverAsset(gallery, assets)
    : null;
  const coverMedia = useDecryptedAssetUrl(
    resolvedDesignCoverAsset || legacyCoverAsset,
    HERO_VARIANTS,
    viewerToken,
    assetAccessToken ?? null,
  );

  if (design && designStyle) {
    const coverAssetForMedia = resolvedDesignCoverAsset || legacyCoverAsset;
    const coverAssetEncrypted =
      assetUsesClientMediaEncryption(coverAssetForMedia);
    const coverUrl =
      coverMedia.src ||
      (coverAssetEncrypted || resolvedDesignCoverAsset
        ? ""
        : resolveDesignCoverImage(
            gallery,
            assets,
            activeCover,
            activeProfileThumbnails,
          ));
    const videoPoster = assetUsesClientMediaEncryption(resolvedDesignCoverAsset)
      ? undefined
      : mediaUrlForAsset(resolvedDesignCoverAsset);
    const accent = design.theme?.accentColor || studioAccent || "";
    const variant = design.theme?.variant;
    const scrim = coverExperienceScrim(activeCover.scrimStyle, variant);
    const focal = activeCover.focalPoint;
    const objectPosition = focal
      ? `${focal.x}% ${focal.y}%`
      : designStyle.objectPosition;
    const titleVisible = activeCover.titleVisible !== false;
    const subtitleVisible = activeCover.subtitleVisible !== false;
    const title = titleVisible
      ? activeCover.title?.trim() || gallery.title
      : "";
    const subtitle = subtitleVisible
      ? activeCover.subtitle?.trim() || gallery.description || ""
      : "";
    const titleSize = activeTypography.titleSize;
    const subtitleSize = activeTypography.subtitleSize;
    const headingFont = activeTypography.headingFont;
    const bodyFont = activeTypography.bodyFont;
    const titleLanguage = getCoverLanguage(activeTypography.titleLanguage);
    const subtitleLanguage = getCoverLanguage(
      activeTypography.subtitleLanguage,
    );
    const titleWeight = activeTypography.titleWeight ?? 600;
    const subtitleWeight = activeTypography.subtitleWeight ?? 400;
    const titleItalic = Boolean(activeTypography.titleItalic);
    const subtitleItalic = Boolean(activeTypography.subtitleItalic);
    const fontsHref = buildCoverGoogleFontsHref([headingFont, bodyFont]);
    // Cover & Design page can override the styleId's textAlign with a
    // free-positioned overlay. When the override is set, the dragged
    // text uses it; otherwise we honor the style's declared alignment.
    const effectiveAlign = activeCover.textAlign || designStyle.textAlign;
    const textAlignClass =
      effectiveAlign === "left"
        ? "text-left items-start"
        : effectiveAlign === "right"
          ? "text-right items-end"
          : "text-center items-center";
    // Aspect-ratio override from the Cover & Design page lets the user
    // crop a 21/9 panoramic style to 4/3 without picking a new style.
    const renderedAspectRatio =
      activeCover.aspectRatio || designStyle.aspectRatio;
    const titlePos = activeCover.titlePosition;
    const subtitlePos = activeCover.subtitlePosition;
    const useDragLayout = Boolean(titlePos || subtitlePos);
    // 2026-05-18: title/subtitle colors split into separate fields. The
    // editor picker writes both `titleColor` and `subtitleColor`; the
    // legacy `textColor` stays in the payload as a fallback so older
    // galleries that saved only the shared color still render with a
    // sensible value on both elements.
    const textColor = activeCover.textColor || undefined;
    const titleColor = activeCover.titleColor || textColor;
    const subtitleColor = activeCover.subtitleColor || textColor;
    const textShadow = activeCover.textShadow
      ? "var(--cover-text-shadow)"
      : undefined;
    const backdropStyle = textBackdropStyle(activeCover.textBackdrop);
    const mediaMode = activeCover.mediaMode || "single-photo";
    const enabledScenes = (design.sceneHeaders || []).filter(
      (scene) => scene.enabled,
    );
    const coverForGrid = resolvedDesignCoverAsset || legacyCoverAsset;
    const coverTemplate = getCoverTemplate(activeCover.styleId);
    const templateAssets = resolveTemplateSlotAssets({
      gallery,
      assets,
      cover: activeCover,
      coverAsset: coverForGrid,
      template: coverTemplate,
    });
    const photoGridAssets = [
      coverForGrid,
      ...assets.filter((asset) => asset.id !== coverForGrid?.id),
    ]
      .filter((asset): asset is PublicAsset => Boolean(asset))
      .slice(0, 4);
    const showVideo =
      mediaMode === "short-video" &&
      resolvedDesignCoverAsset?.content_type?.startsWith("video/");
    const showSlideshow =
      mediaMode === "slideshow" && photoGridAssets.length > 1;
    const activeLogoPlacement = design.branding?.logoPlacement;
    const showBrandChip =
      activeLogoPlacement !== "hidden" &&
      (logoUrl || brandName || design.branding?.monogram);
    const monogram = design.branding?.monogram?.trim();
    const brandColor =
      design.branding?.brandColor || accent || textColor || "var(--text-media)";
    const logoSize = design.branding?.logoSize ?? 40;
    const logoOpacity = (design.branding?.logoOpacity ?? 100) / 100;
    const watermarkOpacity = (design.branding?.watermarkOpacity ?? 70) / 100;
    const watermarkText =
      design.branding?.watermarkText?.trim() || monogram || brandName || "";
    // Title and subtitle are anchored at their CENTER regardless of
    // textAlign — matches the Cover & Design editor's drag behavior
    // (Canva/Figma-style: object grabbed at visual middle). textAlign
    // only controls multi-line internal alignment, not anchor edge.
    // Prior to 2026-05-18 the anchor varied by textAlign which made
    // drags feel disconnected and let titles wrap as they hit the
    // canvas edge.

    return (
      // Honor the cover style's declared aspectRatio so the container
      // matches the image's natural shape. Previously the hero forced
      // `min-h-[60vh]` and the image was rendered with `object-fit: cover`
      // — on wide desktop viewports (e.g. 1920×648) a 16:9 cover photo
      // was force-cropped top + bottom by ~216px each, hiding the
      // subject area at the top of wedding shots. With aspectRatio in
      // place the container becomes the correct height for the chosen
      // style (16/9, 21/9, 4/3, etc.), so cover cropping shrinks to
      // near zero on standard viewports.
      // Bracketing:
      //   - minHeight: 60vh keeps the hero usable on tall narrow
      //     viewports (mobile portrait) where the aspect-ratio derived
      //     height would be too short.
      //   - maxHeight: 85vh stops a 4:3 / 1:1 cover style from pushing
      //     the View Gallery CTA below the fold on shorter desktop
      //     viewports (1440×900 etc.).
      <section
        className="cover-hero-frame relative flex w-full overflow-hidden"
        style={{
          aspectRatio: renderedAspectRatio,
        }}
        data-cover-style={designStyle.id}
      >
        {fontsHref && <link rel="stylesheet" href={fontsHref} />}
        {showVideo && coverUrl ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={coverUrl}
            poster={videoPoster}
            style={{ objectPosition }}
            muted
            loop
            playsInline
            autoPlay
            data-testid="gallery-cover-video"
          />
        ) : showSlideshow ? (
          <CoverSlideshow
            coverUrl={coverUrl}
            assets={photoGridAssets}
            title={title}
            objectPosition={objectPosition}
          />
        ) : (
          <PublicCoverTemplateMedia
            template={coverTemplate}
            assets={templateAssets}
            coverUrl={coverUrl}
            cover={activeCover}
            title={title}
            viewerToken={viewerToken}
            assetAccessToken={assetAccessToken ?? null}
          />
        )}
        {designStyle.overlay && (
          <div
            className="absolute inset-0"
            style={{ background: designStyle.overlay }}
          />
        )}
        {scrim && (
          <div
            className="absolute inset-0"
            style={{ background: scrim }}
            data-testid="gallery-cover-scrim"
          />
        )}

        {useDragLayout ? (
          // Drag-positioned overlay — title and subtitle are absolutely
          // positioned at the percentages chosen in the Cover & Design
          // editor. This is the WYSIWYG path: the editor's preview uses
          // the exact same coordinate scheme.
          <div className="absolute inset-0 z-10">
            {title && titlePos && (
              <h1
                className="absolute font-semibold tracking-tight"
                data-testid="gallery-cover-title"
                lang={titleLanguage.htmlLang}
                dir={titleLanguage.dir}
                style={{
                  left: `${titlePos.x}%`,
                  top: `${titlePos.y}%`,
                  transform: "translate(-50%, -50%)",
                  fontFamily: fontFamilyForCoverText(
                    headingFont,
                    titleLanguage.id,
                  ),
                  fontSize: titleSize ? `${titleSize}px` : undefined,
                  fontWeight: titleWeight,
                  fontStyle: titleItalic ? "italic" : "normal",
                  direction: titleLanguage.dir,
                  color: titleColor || accent || "var(--text-media)",
                  textShadow,
                  textAlign: effectiveAlign,
                  whiteSpace: "pre",
                  ...backdropStyle,
                }}
              >
                {title}
              </h1>
            )}
            {subtitle && subtitlePos && (
              <p
                className="absolute"
                data-testid="gallery-cover-subtitle"
                lang={subtitleLanguage.htmlLang}
                dir={subtitleLanguage.dir}
                style={{
                  left: `${subtitlePos.x}%`,
                  top: `${subtitlePos.y}%`,
                  transform: "translate(-50%, -50%)",
                  fontFamily: fontFamilyForCoverText(
                    bodyFont,
                    subtitleLanguage.id,
                  ),
                  fontSize: subtitleSize ? `${subtitleSize}px` : undefined,
                  fontWeight: subtitleWeight,
                  fontStyle: subtitleItalic ? "italic" : "normal",
                  direction: subtitleLanguage.dir,
                  color: subtitleColor || "var(--text-media)",
                  textShadow,
                  textAlign: effectiveAlign,
                  whiteSpace: "pre",
                  ...backdropStyle,
                }}
              >
                {subtitle}
              </p>
            )}
            {showBrandChip && (
              <div
                className={`absolute flex items-center gap-3 ${placementClass(activeLogoPlacement)}`}
                style={{
                  color: textColor || "var(--text-media)",
                  textShadow,
                }}
              >
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt={brandName ? `${brandName} logo` : "Studio logo"}
                    className="h-10 w-10 rounded-full bg-surface-raised object-contain p-1"
                    style={{
                      width: `${logoSize}px`,
                      height: `${logoSize}px`,
                      opacity: logoOpacity,
                    }}
                  />
                )}
                {brandName && <span className="media-label">{brandName}</span>}
                {monogram && (
                  <span
                    className="cover-brand-mark inline-flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-sm font-semibold"
                    style={{
                      color: brandColor,
                      borderColor: brandColor,
                      width: `${logoSize}px`,
                      minWidth: `${logoSize}px`,
                      height: `${logoSize}px`,
                      opacity: logoOpacity,
                    }}
                  >
                    {monogram}
                  </span>
                )}
              </div>
            )}
            {design.branding?.watermarkStyle &&
              design.branding.watermarkStyle !== "none" &&
              watermarkText && (
                <div
                  className={`cover-watermark-public cover-watermark-public--${design.branding.watermarkStyle} pointer-events-none absolute font-semibold`}
                  style={{
                    color: brandColor,
                    opacity: watermarkOpacity,
                    textShadow,
                    bottom:
                      design.branding.watermarkStyle === "tiled"
                        ? undefined
                        : enabledScenes.length > 0
                          ? "var(--space-24)"
                          : "var(--space-5)",
                    left:
                      design.branding.watermarkStyle === "tiled"
                        ? undefined
                        : "var(--space-6)",
                  }}
                  aria-hidden
                >
                  {design.branding.watermarkStyle === "tiled"
                    ? Array.from({ length: 8 }, (_, index) => (
                        <span key={index}>{watermarkText}</span>
                      ))
                    : watermarkText}
                </div>
              )}
            {enabledScenes.length > 0 && (
              <div
                className="absolute bottom-6 left-6 right-40 flex gap-2 overflow-x-auto pb-1"
                data-testid="gallery-scene-headers"
              >
                {enabledScenes.map((scene) => (
                  <a
                    key={scene.id}
                    href="#gallery-grid"
                    className="cover-media-chip flex min-w-28 items-center gap-2 p-1.5 pr-3 text-xs font-medium"
                    data-testid={`gallery-scene-header-${scene.id}`}
                  >
                    {sceneCoverUrl(scene, assets, coverForGrid) && (
                      <img
                        src={sceneCoverUrl(scene, assets, coverForGrid)}
                        alt={`${scene.label} scene cover`}
                        className="h-10 w-10 rounded-lg object-cover"
                        loading="lazy"
                      />
                    )}
                    <span>{scene.label}</span>
                  </a>
                ))}
              </div>
            )}
            <CoverCtaGroup
              slug={photoSearchSlug}
              ws={ws}
              shareToken={shareToken}
              showPhotoSearch={findMeEnabled}
              accent={accent || undefined}
              className="absolute bottom-6 right-6 justify-end"
              slideshowControl={
                slideshowEnabled ? (
                  <PlaySlideshowButton
                    onClick={openSlideshow}
                    accent={accent || undefined}
                  />
                ) : null
              }
            />
          </div>
        ) : (
          // Legacy bottom-anchored layout — used when no drag positions
          // have been saved. Matches the design-studio's published behavior.
          <div
            className={`relative z-10 mx-auto flex w-full max-w-3xl flex-col justify-end px-6 py-16 ${textAlignClass}`}
          >
            {(logoUrl || brandName) && (
              <div
                className="mb-6 flex items-center gap-3"
                style={{
                  justifyContent:
                    effectiveAlign === "center"
                      ? "center"
                      : effectiveAlign === "right"
                        ? "flex-end"
                        : "flex-start",
                }}
              >
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt={brandName ? `${brandName} logo` : "Studio logo"}
                    className="h-10 w-10 rounded-full bg-surface-raised object-contain p-1"
                    style={{
                      width: `${logoSize}px`,
                      height: `${logoSize}px`,
                      opacity: logoOpacity,
                    }}
                  />
                )}
                {brandName && (
                  <span className="media-label text-text-inverse">
                    {brandName}
                  </span>
                )}
              </div>
            )}
            {title && (
              <h1
                className="font-semibold tracking-tight text-text-inverse"
                data-testid="gallery-cover-title"
                lang={titleLanguage.htmlLang}
                dir={titleLanguage.dir}
                style={{
                  fontFamily: fontFamilyForCoverText(
                    headingFont,
                    titleLanguage.id,
                  ),
                  fontSize: titleSize ? `${titleSize}px` : undefined,
                  fontWeight: titleWeight,
                  fontStyle: titleItalic ? "italic" : "normal",
                  direction: titleLanguage.dir,
                  color: titleColor || accent || undefined,
                  textShadow,
                  ...backdropStyle,
                }}
              >
                {title}
              </h1>
            )}
            {subtitle && (
              <p
                className="mt-3 max-w-2xl text-text-inverse/85"
                data-testid="gallery-cover-subtitle"
                lang={subtitleLanguage.htmlLang}
                dir={subtitleLanguage.dir}
                style={{
                  fontFamily: fontFamilyForCoverText(
                    bodyFont,
                    subtitleLanguage.id,
                  ),
                  fontSize: subtitleSize ? `${subtitleSize}px` : undefined,
                  fontWeight: subtitleWeight,
                  fontStyle: subtitleItalic ? "italic" : "normal",
                  direction: subtitleLanguage.dir,
                  color: subtitleColor || undefined,
                  textShadow,
                  ...backdropStyle,
                }}
              >
                {subtitle}
              </p>
            )}
            {enabledScenes.length > 0 && (
              <div
                className="mt-5 flex max-w-2xl flex-wrap gap-2"
                style={{
                  justifyContent:
                    effectiveAlign === "center"
                      ? "center"
                      : effectiveAlign === "right"
                        ? "flex-end"
                        : "flex-start",
                }}
                data-testid="gallery-scene-headers"
              >
                {enabledScenes.map((scene) => (
                  <a
                    key={scene.id}
                    href="#gallery-grid"
                    className="cover-media-chip flex items-center gap-2 p-1.5 pr-3 text-xs font-medium"
                    data-testid={`gallery-scene-header-${scene.id}`}
                  >
                    {sceneCoverUrl(scene, assets, coverForGrid) && (
                      <img
                        src={sceneCoverUrl(scene, assets, coverForGrid)}
                        alt={`${scene.label} scene cover`}
                        className="h-10 w-10 rounded-lg object-cover"
                        loading="lazy"
                      />
                    )}
                    <span>{scene.label}</span>
                  </a>
                ))}
              </div>
            )}
            <div
              className="mt-8"
              style={{
                alignSelf:
                  effectiveAlign === "center"
                    ? "center"
                    : effectiveAlign === "right"
                      ? "flex-end"
                      : "flex-start",
              }}
            >
              <CoverCtaGroup
                slug={photoSearchSlug}
                ws={ws}
                shareToken={shareToken}
                showPhotoSearch={findMeEnabled}
                accent={accent || undefined}
                slideshowControl={
                  slideshowEnabled ? (
                    <PlaySlideshowButton
                      onClick={openSlideshow}
                      accent={accent || undefined}
                    />
                  ) : null
                }
              />
            </div>
          </div>
        )}
        {slideshowOverlay}
      </section>
    );
  }

  // Legacy fallback — keeps the M19 `cover_template` path working for any
  // gallery that hasn't been touched by the design studio. Same code as
  // before this fix, modulo the early-return shape above.
  const coverImageUrl =
    coverMedia.src ||
    (!legacyCoverAsset ? resolvePublicCoverImage(gallery, assets) : "");
  const hasCoverTemplate = Boolean(
    gallery.cover_template &&
    gallery.cover_template !== "none" &&
    coverImageUrl,
  );
  const accentColor = studioAccent;

  if (!hasCoverTemplate) {
    return (
      <header className="mx-auto max-w-6xl px-4 py-8">
        {(logoUrl || brandName) && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {logoUrl && (
              <img
                src={logoUrl}
                alt={brandName ? `${brandName} logo` : "Studio logo"}
                className="h-10 w-10 rounded-full object-contain"
              />
            )}
            {brandName && (
              <span className="media-label text-text-tertiary">
                {brandName}
              </span>
            )}
          </div>
        )}
        <h1 className="text-3xl font-semibold text-text-primary">
          {gallery.title}
        </h1>
        {gallery.description && (
          <p className="mt-2 max-w-2xl text-text-secondary">
            {gallery.description}
          </p>
        )}
        {/* No cover photo here, so the grid sits immediately below — surface
            only the Play + Find Me entries (preserving the old FAB's reach)
            rather than a redundant scroll-to-grid button. */}
        <CoverCtaGroup
          slug={photoSearchSlug}
          ws={ws}
          shareToken={shareToken}
          showViewGallery={false}
          showPhotoSearch={findMeEnabled}
          accent={accentColor || undefined}
          className="mt-6"
          slideshowControl={
            slideshowEnabled ? (
              <PlaySlideshowButton
                onClick={openSlideshow}
                accent={accentColor || undefined}
              />
            ) : null
          }
        />
        {slideshowOverlay}
      </header>
    );
  }

  return (
    <section className="cover-hero-frame relative flex w-full items-center justify-center overflow-hidden">
      <img
        src={coverImageUrl}
        alt={gallery.title}
        className="absolute inset-0 h-full w-full object-cover"
        loading="eager"
      />
      <div className="absolute inset-0 bg-surface-overlay/80" />
      <div className="relative z-10 max-w-2xl px-6 py-12 text-center">
        {(logoUrl || brandName) && (
          <div className="mb-6 flex items-center justify-center gap-3">
            {logoUrl && (
              <img
                src={logoUrl}
                alt={brandName ? `${brandName} logo` : "Studio logo"}
                className="h-12 w-12 rounded-full bg-surface-raised object-contain p-2"
              />
            )}
            {brandName && (
              <span className="media-label text-text-inverse">{brandName}</span>
            )}
          </div>
        )}
        <h1 className="text-4xl font-bold tracking-tight text-text-inverse md:text-5xl">
          {gallery.title}
        </h1>
        {gallery.description && (
          <p className="mt-4 text-lg text-text-inverse/80">
            {gallery.description}
          </p>
        )}
        <CoverCtaGroup
          slug={photoSearchSlug}
          ws={ws}
          shareToken={shareToken}
          showPhotoSearch={findMeEnabled}
          accent={accentColor || undefined}
          className="mt-8 justify-center"
          slideshowControl={
            slideshowEnabled ? (
              <PlaySlideshowButton
                onClick={openSlideshow}
                accent={accentColor || undefined}
              />
            ) : null
          }
        />
      </div>
      {slideshowOverlay}
    </section>
  );
}
