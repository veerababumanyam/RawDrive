import type { Gallery, GalleryBranding, PublicAsset } from "@/lib/api/galleries";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function absoluteApiUrl(url?: string | null) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
}

export function resolvePublicCoverImage(gallery: Gallery, assets: PublicAsset[]) {
  const preferred = gallery.cover_asset_id
    ? assets.find((asset) => asset.id === gallery.cover_asset_id)
    : assets[0];
  const asset = preferred || assets[0];
  if (!asset) return "";
  return (
    getStorageBackedUrl(asset.thumbnail_urls?.display_webp ||
    asset.thumbnail_urls?.thumb_lg_webp ||
    asset.thumbnail_urls?.thumb_lg ||
    Object.values(asset.thumbnail_urls || {})[0] ||
    "")
  );
}

interface PublicGalleryHeroProps {
  gallery: Gallery;
  assets: PublicAsset[];
  branding?: GalleryBranding | null;
}

export function PublicGalleryHero({ gallery, assets, branding }: PublicGalleryHeroProps) {
  const coverImageUrl = resolvePublicCoverImage(gallery, assets);
  const hasCoverTemplate = Boolean(gallery.cover_template && gallery.cover_template !== "none" && coverImageUrl);
  const canUseStudioBrand = Boolean(branding?.can_customize && branding.public_branding_enabled !== false);
  const brandName = canUseStudioBrand ? branding?.brand_name || "RawDrive" : "RawDrive";
  const logoUrl = canUseStudioBrand ? absoluteApiUrl(branding?.logo_url) : "";
  const accentColor = canUseStudioBrand ? branding?.accent_color || "" : "";

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
