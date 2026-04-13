import { notFound } from "next/navigation";
import {
  getPublicGallery,
  getPublicGalleryAssets,
  getPublicGalleryBranding,
} from "@/lib/api/galleries";
import { listPublicBanners, listPublicProducts } from "@/lib/api/commerce";
import { PublicGalleryEnhancements } from "@/components/gallery/public-gallery-enhancements";
import { PublicGalleryGrid } from "@/components/gallery/public-gallery-grid";
import { PublicGalleryProducts } from "@/components/gallery/public-gallery-products";
import { PublicGalleryBanners } from "@/components/gallery/public-gallery-banners";
import { GalleryPasswordGate } from "@/components/gallery/gallery-password-gate";
import { PublicGalleryHero } from "@/components/gallery/public-gallery-hero";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ album?: string }>;
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

  let gallery;
  let assets;
  try {
    gallery = await getPublicGallery(slug);
    assets = await getPublicGalleryAssets(slug, albumId);
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

  const [products, banners, branding] = await Promise.all([
    listPublicProducts(slug),
    listPublicBanners(slug),
    getPublicGalleryBranding(slug).catch(() => null),
  ]);

  const hasPassword = gallery.settings?.has_password === true;
  const studioBrandName = branding?.can_customize ? branding.brand_name : undefined;
  const studioLogoUrl = branding?.can_customize ? branding.logo_url : undefined;

  const galleryContent = (
    <div className="min-h-screen bg-surface">
      <PublicGalleryHero gallery={gallery} assets={assets} branding={branding} />

      <PublicGalleryBanners slug={slug} initialBanners={banners} />

      <div id="gallery-grid" className="mx-auto max-w-6xl px-4 pb-16">
        <PublicGalleryGrid
          slug={slug}
          assets={assets}
          galleryType={gallery.gallery_type}
          maxSelections={gallery.max_selections || 0}
          downloadEnabled={gallery.download_enabled !== false}
        />
      </div>

      <PublicGalleryProducts slug={slug} products={products} />

      <PublicGalleryEnhancements
        slug={slug}
        faceIdEnabled={Boolean(gallery.faceid_enabled)}
      />
    </div>
  );

  if (hasPassword) {
    return (
      <GalleryPasswordGate slug={slug} brandName={studioBrandName} logoUrl={studioLogoUrl}>
        {galleryContent}
      </GalleryPasswordGate>
    );
  }

  return galleryContent;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  try {
    const [gallery, branding] = await Promise.all([
      getPublicGallery(slug),
      getPublicGalleryBranding(slug).catch(() => null),
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
