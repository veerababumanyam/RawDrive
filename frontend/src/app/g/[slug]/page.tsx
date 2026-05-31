import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import {
  getPublicGallery,
  getPublicGalleryAlbums,
  getPublicGalleryAssets,
  getPublicGalleryBranding,
} from "@/lib/api/galleries";
import { PublicGalleryAlbumChips } from "@/components/gallery/public-gallery-album-chips";
import { listPublicBanners, listPublicProducts } from "@/lib/api/commerce";
import { PublicGalleryEnhancements } from "@/components/gallery/public-gallery-enhancements";
import { PublicGalleryGrid } from "@/components/gallery/public-gallery-grid";
import { PublicGalleryProducts } from "@/components/gallery/public-gallery-products";
import { PublicGalleryBanners } from "@/components/gallery/public-gallery-banners";
import { GalleryPasswordGate } from "@/components/gallery/gallery-password-gate";
import { PublicGalleryHero } from "@/components/gallery/public-gallery-hero";
import { readPublicDesignConfig, readPublicCoverThumbnails } from "@/lib/gallery-design-config";
import { EmbeddedVideosPanel } from "@/components/gallery/embedded-videos-panel";
import { readEmbeddedVideos } from "@/lib/embedded-videos";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ album?: string; ws?: string }>;
}

function PublicGalleryUnavailable({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: "clock" | "photo";
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="max-w-md px-4 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-sunken">
          {icon === "clock" ? (
            <svg className="h-8 w-8 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="h-8 w-8 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
          )}
        </div>
        <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
        <p className="mt-2 text-sm text-text-secondary">{body}</p>
      </div>
    </div>
  );
}

export default async function PublicGalleryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const albumId = typeof query.album === "string" && query.album ? query.album : undefined;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("gallery_session")?.value;
  // `ws` is set by middleware.ts when the request arrived via the per-business
  // subdomain `<biz>-<code>.rawdrive.in/<gallery-slug>`. Forwarded to the
  // backend API so the gallery lookup is scoped to that workspace; absence
  // means the request hit the apex `/g/<slug>` route and falls back to the
  // unscoped legacy lookup.
  const ws = typeof query.ws === "string" && query.ws ? query.ws : undefined;

  let gallery;
  try {
    gallery = await getPublicGallery(slug, ws);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("410") || msg.includes("expired")) {
      return (
        <PublicGalleryUnavailable
          title="Gallery Has Expired"
          body="This gallery is no longer available. Please contact the photographer if you need access."
          icon="clock"
        />
      );
    }
    if (msg.includes("404") || msg.includes("not found")) {
      return (
        <PublicGalleryUnavailable
          title="Gallery Not Yet Available"
          body="This gallery has not been published yet. Please check back soon or contact the photographer for access."
          icon="photo"
        />
      );
    }
    notFound();
  }

  const hasPassword = gallery.settings?.has_password === true;

  if (hasPassword && !sessionToken) {
    const branding = await getPublicGalleryBranding(slug, ws).catch(() => null);
    return (
      <GalleryPasswordGate
        slug={slug}
        brandName={branding?.can_customize ? branding.brand_name : undefined}
        logoUrl={branding?.can_customize ? branding.logo_url : undefined}
      >
        <></>
      </GalleryPasswordGate>
    );
  }

  let assets;
  try {
    assets = await getPublicGalleryAssets(slug, albumId, ws, sessionToken);
  } catch (err) {
    if (hasPassword) {
      const branding = await getPublicGalleryBranding(slug, ws).catch(() => null);
      return (
        <GalleryPasswordGate
          slug={slug}
          brandName={branding?.can_customize ? branding.brand_name : undefined}
          logoUrl={branding?.can_customize ? branding.logo_url : undefined}
        >
          <></>
        </GalleryPasswordGate>
      );
    }
    throw err;
  }

  // Fetch products, banners, branding, and the public album list in
  // parallel. Albums are best-effort — getPublicGalleryAlbums swallows
  // errors and returns [] so an album-service outage doesn't blow up
  // the whole public page; the chip strip simply hides itself.
  const [products, banners, branding, albums] = await Promise.all([
    listPublicProducts(slug),
    listPublicBanners(slug),
    getPublicGalleryBranding(slug, ws).catch(() => null),
    getPublicGalleryAlbums(slug, ws, sessionToken),
  ]);

  // For the "All Photos" chip count we need the gallery-wide asset
  // count, not just the currently-rendered (album-filtered) set.
  // Re-fetch only when an album filter is active; otherwise reuse the
  // already-loaded `assets` length to avoid a second round-trip.
  const totalAssetCount = albumId
    ? (await getPublicGalleryAssets(slug, undefined, ws, sessionToken).catch(() => [])).length
    : assets.length;

  const resolvedStudioBrandName = branding?.can_customize ? branding.brand_name : undefined;
  const resolvedStudioLogoUrl = branding?.can_customize ? branding.logo_url : undefined;

  // Design config saved by the Gallery Design Studio. The public viewer
  // needs this so the share link renders with the cover image, cover
  // style, typography, accent color, and grid layout the photographer
  // configured. Cover thumbnails are resolved server-side (see
  // backend/internal/handler/public_gallery_handler.go::GetBySlug) so the
  // saved cover image renders even when an album filter (?album=X) would
  // otherwise hide it from the asset list.
  const designConfig = readPublicDesignConfig(gallery.settings);
  const designCoverThumbnails = readPublicCoverThumbnails(gallery.settings);
  // 2026-05-18: embedded YouTube/Vimeo videos. Same shape the dashboard
  // editor writes — see frontend/src/lib/embedded-videos.ts. Empty list
  // makes the panel render nothing (read-only short-circuits).
  const embeddedVideos = readEmbeddedVideos(
    gallery.settings as Record<string, unknown> | undefined,
  );

  const galleryContent = (
    <div className="min-h-screen bg-surface">
      <PublicGalleryHero
        gallery={gallery}
        assets={assets}
        branding={branding}
        design={designConfig}
        designCoverThumbnails={designCoverThumbnails}
      />

      <PublicGalleryBanners slug={slug} initialBanners={banners} />

      <PublicGalleryAlbumChips
        slug={slug}
        albums={albums}
        totalAssetCount={totalAssetCount}
        activeAlbumId={albumId}
      />

      <div id="gallery-grid" className="mx-auto max-w-6xl space-y-6 px-4 pb-16">
        {/* Embedded YouTube/Vimeo videos in read-only mode. Shows the
            same iframe grid the photographer sees in the dashboard
            editor; the panel auto-hides when the gallery has none. */}
        {embeddedVideos.length > 0 && (
          <EmbeddedVideosPanel
            galleryId={gallery.id}
            initialVideos={embeddedVideos}
            readOnly
          />
        )}
        <PublicGalleryGrid
          slug={slug}
          assets={assets}
          galleryType={gallery.gallery_type}
          maxSelections={gallery.max_selections || 0}
          downloadEnabled={gallery.download_enabled !== false}
          design={designConfig}
          watermark={gallery.watermark_config as Record<string, unknown> | null}
        />
      </div>

      <PublicGalleryProducts slug={slug} products={products} />

      <PublicGalleryEnhancements
        slug={slug}
        faceIdEnabled={Boolean(gallery.faceid_enabled)}
        // face_detection_enabled defaults to true in the schema
        // (migration 046), so undefined → true. Only an explicit false
        // hides the Photo Search FAB.
        faceDetectionEnabled={gallery.face_detection_enabled !== false}
      />
    </div>
  );

  if (hasPassword) {
    return (
      <GalleryPasswordGate slug={slug} brandName={resolvedStudioBrandName} logoUrl={resolvedStudioLogoUrl}>
        {galleryContent}
      </GalleryPasswordGate>
    );
  }

  return galleryContent;
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { slug } = await params;
  // Read `ws` (set by middleware on requests via <biz>-<code>.rawdrive.in)
  // and forward it to both API calls — otherwise metadata would use the
  // unscoped lookup and leak the title of any same-slug gallery in a
  // different workspace, even when the body correctly 404s.
  const query = searchParams ? await searchParams : {};
  const ws = typeof query.ws === "string" && query.ws ? query.ws : undefined;
  try {
    const [gallery, branding] = await Promise.all([
      getPublicGallery(slug, ws),
      getPublicGalleryBranding(slug, ws).catch(() => null),
    ]);
    const brandName = branding?.can_customize ? branding.brand_name : "RawDrive";
    const description = gallery.description || `View ${gallery.title} by ${brandName}`;
    return {
      title: `${gallery.title} | ${brandName}`,
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
