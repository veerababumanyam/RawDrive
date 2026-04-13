import { getPublicGallery, getPublicGalleryAssets } from "@/lib/api/galleries";
import { listPublicBanners, listPublicProducts } from "@/lib/api/commerce";
import { notFound } from "next/navigation";
import { PublicGalleryEnhancements } from "@/components/gallery/public-gallery-enhancements";
import { PublicGalleryGrid } from "@/components/gallery/public-gallery-grid";
import { PublicGalleryProducts } from "@/components/gallery/public-gallery-products";
import { PublicGalleryBanners } from "@/components/gallery/public-gallery-banners";
import { GalleryPasswordGate } from "@/components/gallery/gallery-password-gate";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ album?: string }>;
}

export default async function PublicGalleryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const albumId = typeof query.album === "string" && query.album ? query.album : undefined;

  let gallery;
  let assets;
  try {
    gallery = await getPublicGallery(slug);
    assets = await getPublicGalleryAssets(slug, albumId);
  } catch (err) {
    // Distinguish between "gallery not found" and "gallery not published".
    // If the error message contains a 404, the slug is either invalid or
    // the gallery is in draft/unpublished state. Show a friendly message
    // rather than a raw 404.
    const msg = err instanceof Error ? err.message : "";
    // M19: Handle expired galleries (410 Gone)
    if (msg.includes("410") || msg.includes("expired")) {
      return (
        <div className="min-h-screen bg-surface flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-sunken flex items-center justify-center">
              <svg className="w-8 h-8 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-text-primary">Gallery Has Expired</h1>
            <p className="mt-2 text-sm text-text-secondary">
              This gallery is no longer available. Please contact the photographer if you need access.
            </p>
          </div>
        </div>
      );
    }
    if (msg.includes("404") || msg.includes("not found")) {
      return (
        <div className="min-h-screen bg-surface flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-sunken flex items-center justify-center">
              <svg className="w-8 h-8 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-text-primary">Gallery Not Yet Available</h1>
            <p className="mt-2 text-sm text-text-secondary">
              This gallery hasn&apos;t been published yet. Please check back soon or contact the photographer for access.
            </p>
          </div>
        </div>
      );
    }
    notFound();
  }

  // Products and banners are fetched best-effort — galleries without
  // a catalog or live banner return [] and the respective sections
  // render nothing.
  const [products, banners] = await Promise.all([
    listPublicProducts(slug),
    listPublicBanners(slug),
  ]);

  // M19: Resolve cover image URL from the first asset or cover_asset_id
  const coverImageUrl = (() => {
    if (gallery.cover_asset_id && assets.length > 0) {
      const coverAsset = assets.find(a => a.id === gallery.cover_asset_id);
      if (coverAsset) {
        return getStorageBackedUrl(coverAsset.thumbnail_urls?.display_webp ||
          coverAsset.thumbnail_urls?.thumb_lg_webp ||
          coverAsset.thumbnail_urls?.thumb_lg ||
          Object.values(coverAsset.thumbnail_urls || {})[0] || "");
      }
    }
    if (assets.length > 0) {
      return getStorageBackedUrl(assets[0].thumbnail_urls?.display_webp ||
        assets[0].thumbnail_urls?.thumb_lg_webp ||
        assets[0].thumbnail_urls?.thumb_lg ||
        Object.values(assets[0].thumbnail_urls || {})[0] || "");
    }
    return "";
  })();

  const hasCoverTemplate = gallery.cover_template && gallery.cover_template !== "none";
  const hasPassword = gallery.settings?.has_password === true;

  const galleryContent = (
    <div className="min-h-screen bg-surface">
      {/* M19 F-009: Cover page template rendering */}
      {hasCoverTemplate && coverImageUrl && (
        <section className="relative w-full min-h-[60vh] flex items-center justify-center overflow-hidden">
          {/* Cover background image */}
          <img
            src={coverImageUrl}
            alt={gallery.title}
            className="absolute inset-0 w-full h-full object-cover"
            loading="eager"
          />
          {/* Overlay based on template */}
          <div className={`absolute inset-0 ${
            gallery.cover_template === "full_bleed" ? "bg-black/30" :
            gallery.cover_template === "split_screen" ? "bg-gradient-to-r from-black/70 via-transparent to-transparent" :
            gallery.cover_template === "minimal_white" ? "bg-white/80" :
            gallery.cover_template === "classic_film" ? "bg-black/50 border-8 border-white/20 m-4 rounded-lg" :
            gallery.cover_template === "festive" ? "bg-gradient-to-br from-amber-900/40 to-rose-900/40" :
            "bg-black/30"
          }`} />
          {/* Cover content */}
          <div className="relative z-10 text-center px-6 py-12 max-w-2xl">
            <h1 className={`text-4xl md:text-5xl font-bold tracking-tight ${
              gallery.cover_template === "minimal_white" ? "text-text-primary" : "text-white"
            }`}>
              {gallery.title}
            </h1>
            {gallery.description && (
              <p className={`mt-4 text-lg ${
                gallery.cover_template === "minimal_white" ? "text-text-secondary" : "text-white/80"
              }`}>
                {gallery.description}
              </p>
            )}
            <p className={`mt-2 text-sm ${
              gallery.cover_template === "minimal_white" ? "text-text-tertiary" : "text-white/50"
            }`}>
              {assets.length} {assets.length === 1 ? "photo" : "photos"}
            </p>
            <a
              href="#gallery-grid"
              className="mt-8 inline-block px-6 py-2.5 rounded-full bg-white/20 backdrop-blur-md text-white text-sm font-medium hover:bg-white/30 transition-colors border border-white/20"
            >
              View Gallery
            </a>
          </div>
        </section>
      )}

      {/* M14 GAL-FR-157: live sale banners (impression/click tracked) */}
      <PublicGalleryBanners slug={slug} initialBanners={banners} />

      {/* Gallery header — hidden when cover page template is active (title is in the cover) */}
      {!hasCoverTemplate && (
        <header className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-semibold text-text-primary">{gallery.title}</h1>
          {gallery.description && (
            <p className="text-text-secondary mt-2 max-w-2xl">{gallery.description}</p>
          )}
          <p className="text-sm text-text-tertiary mt-1">
            {assets.length} {assets.length === 1 ? "photo" : "photos"}
          </p>
        </header>
      )}

      {/* Masonry grid + FaceID filter + Map toggle (client component so
          the face filter event listener and view toggle actually work). */}
      <div id="gallery-grid" className="max-w-6xl mx-auto px-4 pb-16">
        <PublicGalleryGrid
          slug={slug}
          assets={assets}
          galleryType={gallery.gallery_type}
          maxSelections={gallery.max_selections || 0}
          downloadEnabled={gallery.download_enabled !== false}
        />
      </div>

      {/* M14 GAL-FR-156: product catalog with add-to-cart. Renders nothing
          if the gallery has no active products. */}
      <PublicGalleryProducts slug={slug} products={products} />

      {/* M13 deferred-FR closure: registration prompt, FaceID, branding, view-as-client */}
      <PublicGalleryEnhancements
        slug={slug}
        faceIdEnabled={Boolean(gallery.faceid_enabled)}
      />
    </div>
  );

  // M19: Wrap with password gate when gallery has a password set
  if (hasPassword) {
    return <GalleryPasswordGate slug={slug}>{galleryContent}</GalleryPasswordGate>;
  }

  return galleryContent;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  try {
    const gallery = await getPublicGallery(slug);
    const description = gallery.description || `View ${gallery.title} on RawDrive`;
    return {
      title: gallery.title,
      description,
      openGraph: {
        title: gallery.title,
        description,
        type: "website",
      },
    };
  } catch {
    return { title: "Gallery Not Found" };
  }
}
