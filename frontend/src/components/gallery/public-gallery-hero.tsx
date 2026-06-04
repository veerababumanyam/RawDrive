"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type {
  Gallery,
  GalleryBranding,
  PublicAsset,
} from "@/lib/api/galleries";
import type { PublicDesignConfig } from "@/lib/gallery-design-config";
import { getCoverStyleById } from "@/components/gallery/cover-styles";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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
  design: PublicDesignConfig | null,
  designCoverThumbnails: Record<string, string> | null,
): string {
  if (designCoverThumbnails) {
    const url = pickFromThumbnails(designCoverThumbnails);
    if (url) return url;
  }
  const designAssetId = design?.cover?.assetId || gallery.cover_asset_id;
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

type PublicCoverConfig = NonNullable<PublicDesignConfig["cover"]>;

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
): PublicAsset | null {
  if (!thumbnailUrls || Object.keys(thumbnailUrls).length === 0) return null;
  return {
    id: gallery.cover_asset_id || "design-cover",
    filename: gallery.title || "Cover photo",
    content_type: "image/webp",
    thumbnail_urls: thumbnailUrls,
    sort_order: -1,
  };
}

function resolveDesignCoverAsset(
  gallery: Gallery,
  assets: PublicAsset[],
  design: PublicDesignConfig | null,
  designCoverThumbnails: Record<string, string> | null,
  designCoverAsset?: PublicAsset | null,
): PublicAsset | null {
  if (designCoverAsset) return designCoverAsset;

  const designAssetId = design?.cover?.assetId || gallery.cover_asset_id;
  if (designAssetId) {
    const match = assets.find((a) => a.id === designAssetId);
    if (match) return match;
  }

  return (
    coverAssetFromThumbnails(gallery, designCoverThumbnails) ||
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

// Builds a fonts.googleapis.com URL for the heading and body fonts the
// design studio picked. The studio injects fonts at design time via
// dynamic <link>; on the public viewer we add a static <link> in the
// rendered output so first paint already has the right family. Falls
// back silently when no design is present.
function googleFontsHref(
  headingFont: string | undefined,
  bodyFont: string | undefined,
): string | null {
  const families: string[] = [];
  if (headingFont) families.push(headingFont);
  if (bodyFont && bodyFont !== headingFont) families.push(bodyFont);
  if (families.length === 0) return null;
  const param = families
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${param}&display=swap`;
}

export function PublicGalleryHero({
  gallery,
  assets,
  branding,
  design,
  designCoverAsset,
  designCoverThumbnails,
}: PublicGalleryHeroProps) {
  const mobileViewport = useIsMobileViewport();
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

  // Design-driven path — runs when the studio has saved anything we can
  // act on. We check `design?.cover?.styleId` rather than just "design
  // exists" so an entirely-empty design_config (e.g. a gallery that was
  // saved with all defaults intact) still falls through to the legacy
  // path for predictability.
  const designStyleId = design?.cover?.styleId;
  const designStyle = designStyleId
    ? getCoverStyleById(designStyleId)
    : undefined;
  const resolvedDesignCoverAsset =
    design && designStyle
      ? resolveDesignCoverAsset(
          gallery,
          assets,
          design,
          designCoverThumbnails ?? null,
          designCoverAsset,
        )
      : null;
  const legacyCoverAsset = !resolvedDesignCoverAsset
    ? resolvePublicCoverAsset(gallery, assets)
    : null;
  const coverMedia = useDecryptedAssetUrl(
    resolvedDesignCoverAsset || legacyCoverAsset,
    HERO_VARIANTS,
  );

  if (design && designStyle) {
    const coverUrl =
      coverMedia.src ||
      (resolvedDesignCoverAsset
        ? ""
        : resolveDesignCoverImage(
            gallery,
            assets,
            design,
            designCoverThumbnails ?? null,
          ));
    const accent = design.theme?.accentColor || studioAccent || "";
    const variant = design.theme?.variant;
    const scrim = coverExperienceScrim(design.cover?.scrimStyle, variant);
    const focal = design.cover?.focalPoint;
    const mobileFocal = design.cover?.mobileFocalPoint;
    const objectPosition = focal
      ? `${mobileViewport && mobileFocal ? mobileFocal.x : focal.x}% ${mobileViewport && mobileFocal ? mobileFocal.y : focal.y}%`
      : designStyle.objectPosition;
    const title = design.cover?.title?.trim() || gallery.title;
    const subtitle =
      design.cover?.subtitle?.trim() || gallery.description || "";
    const titleSize = design.typography?.titleSize;
    const subtitleSize = design.typography?.subtitleSize;
    const headingFont = design.typography?.headingFont;
    const bodyFont = design.typography?.bodyFont;
    const fontsHref = googleFontsHref(headingFont, bodyFont);
    // Cover & Design page can override the styleId's textAlign with a
    // free-positioned overlay. When the override is set, the dragged
    // text uses it; otherwise we honor the style's declared alignment.
    const effectiveAlign = design.cover?.textAlign || designStyle.textAlign;
    const textAlignClass =
      effectiveAlign === "left"
        ? "text-left items-start"
        : effectiveAlign === "right"
          ? "text-right items-end"
          : "text-center items-center";
    // Aspect-ratio override from the Cover & Design page lets the user
    // crop a 21/9 panoramic style to 4/3 without picking a new style.
    const effectiveAspectRatio =
      design.cover?.aspectRatio || designStyle.aspectRatio;
    const mobileAspectRatio = design.cover?.mobileAspectRatio || "4/5";
    const renderedAspectRatio = mobileViewport
      ? mobileAspectRatio
      : effectiveAspectRatio;
    const titlePos = design.cover?.titlePosition;
    const subtitlePos = design.cover?.subtitlePosition;
    const useDragLayout = Boolean(titlePos || subtitlePos);
    // 2026-05-18: title/subtitle colors split into separate fields. The
    // editor picker writes both `titleColor` and `subtitleColor`; the
    // legacy `textColor` stays in the payload as a fallback so older
    // galleries that saved only the shared color still render with a
    // sensible value on both elements.
    const textColor = design.cover?.textColor || undefined;
    const titleColor = design.cover?.titleColor || textColor;
    const subtitleColor = design.cover?.subtitleColor || textColor;
    const textShadow = design.cover?.textShadow
      ? "var(--cover-text-shadow)"
      : undefined;
    const backdropStyle = textBackdropStyle(design.cover?.textBackdrop);
    const mediaMode = design.cover?.mediaMode || "single-photo";
    const enabledScenes = (design.sceneHeaders || []).filter(
      (scene) => scene.enabled,
    );
    const coverForGrid = resolvedDesignCoverAsset || legacyCoverAsset;
    const photoGridAssets = [
      coverForGrid,
      ...assets.filter((asset) => asset.id !== coverForGrid?.id),
    ]
      .filter((asset): asset is PublicAsset => Boolean(asset))
      .slice(0, 4);
    const showPhotoGrid =
      mediaMode === "photo-grid" && photoGridAssets.length > 1;
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
        {showPhotoGrid ? (
          <div
            className="absolute inset-0 grid grid-cols-2 grid-rows-2"
            data-testid="gallery-cover-photo-grid"
          >
            {photoGridAssets.map((asset, idx) => {
              const src =
                idx === 0
                  ? coverUrl || mediaUrlForAsset(asset)
                  : mediaUrlForAsset(asset);
              return (
                <div
                  key={`${asset.id}-${idx}`}
                  className="relative overflow-hidden"
                >
                  {src && (
                    <img
                      src={src}
                      alt={idx === 0 ? title : ""}
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{ objectPosition }}
                      loading={idx === 0 ? "eager" : "lazy"}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : showVideo && coverUrl ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={coverUrl}
            poster={mediaUrlForAsset(resolvedDesignCoverAsset)}
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
          coverUrl && (
            <img
              src={coverUrl}
              alt={title}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition }}
              loading="eager"
            />
          )
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
            {titlePos && (
              <h1
                className="absolute font-semibold tracking-tight"
                data-testid="gallery-cover-title"
                style={{
                  left: `${titlePos.x}%`,
                  top: `${titlePos.y}%`,
                  transform: "translate(-50%, -50%)",
                  fontFamily: headingFont
                    ? `'${headingFont}', serif`
                    : undefined,
                  fontSize: titleSize ? `${titleSize}px` : undefined,
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
                style={{
                  left: `${subtitlePos.x}%`,
                  top: `${subtitlePos.y}%`,
                  transform: "translate(-50%, -50%)",
                  fontFamily: bodyFont
                    ? `'${bodyFont}', sans-serif`
                    : undefined,
                  fontSize: subtitleSize ? `${subtitleSize}px` : undefined,
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
                  />
                )}
                {brandName && <span className="media-label">{brandName}</span>}
                {monogram && (
                  <span
                    className="cover-brand-mark inline-flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-sm font-semibold"
                    style={{ color: brandColor, borderColor: brandColor }}
                  >
                    {monogram}
                  </span>
                )}
              </div>
            )}
            {design.branding?.watermarkStyle &&
              design.branding.watermarkStyle !== "none" && (
                <span
                  className={`media-label pointer-events-none absolute left-6 font-semibold opacity-70 ${
                    enabledScenes.length > 0 ? "bottom-24" : "bottom-5"
                  }`}
                  style={{ color: brandColor, textShadow }}
                  aria-hidden
                >
                  {monogram || brandName}
                </span>
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
            <a
              href="#gallery-grid"
              className="absolute bottom-6 right-6 inline-block rounded-full border bg-surface-overlay px-6 py-2.5 text-sm font-medium text-text-primary glass-blur-medium transition-colors hover:bg-surface-raised"
              style={accent ? { borderColor: accent } : undefined}
            >
              View Gallery
            </a>
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
                  />
                )}
                {brandName && (
                  <span className="media-label text-text-inverse">
                    {brandName}
                  </span>
                )}
              </div>
            )}
            <h1
              className="font-semibold tracking-tight text-text-inverse"
              data-testid="gallery-cover-title"
              style={{
                fontFamily: headingFont ? `'${headingFont}', serif` : undefined,
                fontSize: titleSize ? `${titleSize}px` : undefined,
                color: titleColor || accent || undefined,
                textShadow,
                ...backdropStyle,
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className="mt-3 max-w-2xl text-text-inverse/85"
                data-testid="gallery-cover-subtitle"
                style={{
                  fontFamily: bodyFont
                    ? `'${bodyFont}', sans-serif`
                    : undefined,
                  fontSize: subtitleSize ? `${subtitleSize}px` : undefined,
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
              <a
                href="#gallery-grid"
                className="inline-block rounded-full border bg-surface-overlay px-6 py-2.5 text-sm font-medium text-text-primary glass-blur-medium transition-colors hover:bg-surface-raised"
                style={accent ? { borderColor: accent } : undefined}
              >
                View Gallery
              </a>
            </div>
          </div>
        )}
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
        <a
          href="#gallery-grid"
          className="mt-8 inline-block rounded-full border border-border-subtle bg-surface-overlay px-6 py-2.5 text-sm font-medium text-text-primary glass-blur-medium transition-colors hover:bg-surface-raised"
          style={accentColor ? { borderColor: accentColor } : undefined}
        >
          View Gallery
        </a>
      </div>
    </section>
  );
}
