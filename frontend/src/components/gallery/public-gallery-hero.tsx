import type { Gallery, GalleryBranding, PublicAsset } from "@/lib/api/galleries";
import type { PublicDesignConfig } from "@/lib/gallery-design-config";
import { getCoverStyleById } from "@/components/gallery/cover-styles";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function absoluteApiUrl(url?: string | null) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
}

function pickFromThumbnails(urls: Record<string, string> | undefined | null): string {
  if (!urls) return "";
  return (
    getStorageBackedUrl(
      urls.display_webp ||
        urls.thumb_lg_webp ||
        urls.thumb_lg ||
        Object.values(urls)[0] ||
        "",
    )
  );
}

export function resolvePublicCoverImage(gallery: Gallery, assets: PublicAsset[]) {
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

interface PublicGalleryHeroProps {
  gallery: Gallery;
  assets: PublicAsset[];
  branding?: GalleryBranding | null;
  // Design studio output. When present, the hero renders the saved cover
  // style, typography, accent color, title, and subtitle. When null,
  // falls back to the M19 legacy `cover_template` path so existing
  // galleries that never used the studio still render correctly.
  design?: PublicDesignConfig | null;
  designCoverThumbnails?: Record<string, string> | null;
}

// Maps the studio's overlay/scrim variant to a CSS color string. `light`
// keeps the cover photo bright with no overlay so dark text reads against
// it; `dark` and `auto` add increasing levels of dim so light text reads
// against a busy cover. Same mapping the Gallery Design Studio preview
// uses, so what-you-see-is-what-clients-see.
function variantScrim(variant: "light" | "dark" | "auto" | undefined): string | null {
  if (variant === "dark") return "rgba(0,0,0,0.35)";
  if (variant === "auto") return "rgba(0,0,0,0.15)";
  return null;
}

// Builds a fonts.googleapis.com URL for the heading and body fonts the
// design studio picked. The studio injects fonts at design time via
// dynamic <link>; on the public viewer we add a static <link> in the
// rendered output so first paint already has the right family. Falls
// back silently when no design is present.
function googleFontsHref(headingFont: string | undefined, bodyFont: string | undefined): string | null {
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
  designCoverThumbnails,
}: PublicGalleryHeroProps) {
  const canUseStudioBrand = Boolean(branding?.can_customize && branding.public_branding_enabled !== false);
  const brandName = canUseStudioBrand ? branding?.brand_name || "RawDrive" : "RawDrive";
  const logoUrl = canUseStudioBrand ? absoluteApiUrl(branding?.logo_url) : "";
  const studioAccent = canUseStudioBrand ? branding?.accent_color || "" : "";

  // Design-driven path — runs when the studio has saved anything we can
  // act on. We check `design?.cover?.styleId` rather than just "design
  // exists" so an entirely-empty design_config (e.g. a gallery that was
  // saved with all defaults intact) still falls through to the legacy
  // path for predictability.
  const designStyleId = design?.cover?.styleId;
  const designStyle = designStyleId ? getCoverStyleById(designStyleId) : undefined;

  if (design && designStyle) {
    const coverUrl = resolveDesignCoverImage(gallery, assets, design, designCoverThumbnails ?? null);
    const accent = design.theme?.accentColor || studioAccent || "";
    const variant = design.theme?.variant;
    const scrim = variantScrim(variant);
    const focal = design.cover?.focalPoint;
    const objectPosition = focal
      ? `${focal.x}% ${focal.y}%`
      : designStyle.objectPosition;
    const title = design.cover?.title?.trim() || gallery.title;
    const subtitle = design.cover?.subtitle?.trim() || gallery.description || "";
    const titleSize = design.typography?.titleSize;
    const subtitleSize = design.typography?.subtitleSize;
    const headingFont = design.typography?.headingFont;
    const bodyFont = design.typography?.bodyFont;
    const fontsHref = googleFontsHref(headingFont, bodyFont);
    const textAlignClass =
      designStyle.textAlign === "left"
        ? "text-left items-start"
        : designStyle.textAlign === "right"
          ? "text-right items-end"
          : "text-center items-center";

    return (
      <section
        className="relative flex min-h-[60vh] w-full overflow-hidden"
        data-cover-style={designStyle.id}
      >
        {fontsHref && <link rel="stylesheet" href={fontsHref} />}
        {coverUrl && (
          <img
            src={coverUrl}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition }}
            loading="eager"
          />
        )}
        {designStyle.overlay && (
          <div className="absolute inset-0" style={{ background: designStyle.overlay }} />
        )}
        {scrim && <div className="absolute inset-0" style={{ background: scrim }} />}

        <div className={`relative z-10 mx-auto flex w-full max-w-3xl flex-col justify-center px-6 py-16 ${textAlignClass}`}>
          {(logoUrl || brandName) && (
            <div className="mb-6 flex items-center gap-3" style={{ justifyContent: designStyle.textAlign === "center" ? "center" : designStyle.textAlign === "right" ? "flex-end" : "flex-start" }}>
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt={`${brandName} logo`}
                  className="h-10 w-10 rounded-full bg-surface-raised object-contain p-1"
                />
              )}
              <span className="text-xs uppercase tracking-[0.18em] text-text-inverse">
                {brandName}
              </span>
            </div>
          )}
          <h1
            className="font-semibold tracking-tight text-text-inverse"
            style={{
              fontFamily: headingFont ? `'${headingFont}', serif` : undefined,
              fontSize: titleSize ? `${titleSize}px` : undefined,
              color: accent || undefined,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className="mt-3 max-w-2xl text-text-inverse/85"
              style={{
                fontFamily: bodyFont ? `'${bodyFont}', sans-serif` : undefined,
                fontSize: subtitleSize ? `${subtitleSize}px` : undefined,
              }}
            >
              {subtitle}
            </p>
          )}
          <p className="mt-3 text-sm text-text-inverse/70">
            {assets.length} {assets.length === 1 ? "photo" : "photos"}
          </p>
          <div className="mt-8" style={{ alignSelf: designStyle.textAlign === "center" ? "center" : designStyle.textAlign === "right" ? "flex-end" : "flex-start" }}>
            <a
              href="#gallery-grid"
              className="inline-block rounded-full border bg-surface-overlay px-6 py-2.5 text-sm font-medium text-text-primary backdrop-blur-md transition-colors hover:bg-surface-raised"
              style={accent ? { borderColor: accent } : undefined}
            >
              View Gallery
            </a>
          </div>
        </div>
      </section>
    );
  }

  // Legacy fallback — keeps the M19 `cover_template` path working for any
  // gallery that hasn't been touched by the design studio. Same code as
  // before this fix, modulo the early-return shape above.
  const coverImageUrl = resolvePublicCoverImage(gallery, assets);
  const hasCoverTemplate = Boolean(gallery.cover_template && gallery.cover_template !== "none" && coverImageUrl);
  const accentColor = studioAccent;

  if (!hasCoverTemplate) {
    return (
      <header className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {logoUrl && <img src={logoUrl} alt={`${brandName} logo`} className="h-10 w-10 rounded-full object-contain" />}
          <span className="text-xs uppercase tracking-[0.18em] text-text-tertiary">{brandName}</span>
        </div>
        <h1 className="text-3xl font-semibold text-text-primary">{gallery.title}</h1>
        {gallery.description && (
          <p className="mt-2 max-w-2xl text-text-secondary">{gallery.description}</p>
        )}
        <p className="mt-1 text-sm text-text-tertiary">
          {assets.length} {assets.length === 1 ? "photo" : "photos"}
        </p>
      </header>
    );
  }

  return (
    <section className="relative flex min-h-[60vh] w-full items-center justify-center overflow-hidden">
      <img
        src={coverImageUrl}
        alt={gallery.title}
        className="absolute inset-0 h-full w-full object-cover"
        loading="eager"
      />
      <div className="absolute inset-0 bg-surface-overlay/80" />
      <div className="relative z-10 max-w-2xl px-6 py-12 text-center">
        <div className="mb-6 flex items-center justify-center gap-3">
          {logoUrl && <img src={logoUrl} alt={`${brandName} logo`} className="h-12 w-12 rounded-full bg-surface-raised object-contain p-2" />}
          <span className="text-xs uppercase tracking-[0.18em] text-text-inverse">{brandName}</span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-text-inverse md:text-5xl">
          {gallery.title}
        </h1>
        {gallery.description && (
          <p className="mt-4 text-lg text-text-inverse/80">{gallery.description}</p>
        )}
        <p className="mt-2 text-sm text-text-inverse/70">
          {assets.length} {assets.length === 1 ? "photo" : "photos"}
        </p>
        <a
          href="#gallery-grid"
          className="mt-8 inline-block rounded-full border border-border-subtle bg-surface-overlay px-6 py-2.5 text-sm font-medium text-text-primary backdrop-blur-md transition-colors hover:bg-surface-raised"
          style={accentColor ? { borderColor: accentColor } : undefined}
        >
          View Gallery
        </a>
      </div>
    </section>
  );
}
