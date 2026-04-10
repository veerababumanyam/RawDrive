import { getPublicGallery, getPublicGalleryAssets } from "@/lib/api/galleries";
import { listPublicBanners, listPublicProducts } from "@/lib/api/commerce";
import { notFound } from "next/navigation";
import { PublicGalleryEnhancements } from "@/components/gallery/public-gallery-enhancements";
import { PublicGalleryGrid } from "@/components/gallery/public-gallery-grid";
import { PublicGalleryProducts } from "@/components/gallery/public-gallery-products";
import { PublicGalleryBanners } from "@/components/gallery/public-gallery-banners";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function PublicGalleryPage({ params }: Props) {
  const { slug } = await params;

  let gallery;
  let assets;
  try {
    gallery = await getPublicGallery(slug);
    assets = await getPublicGalleryAssets(slug);
  } catch {
    notFound();
  }

  // Products and banners are fetched best-effort — galleries without
  // a catalog or live banner return [] and the respective sections
  // render nothing.
  const [products, banners] = await Promise.all([
    listPublicProducts(slug),
    listPublicBanners(slug),
  ]);

  return (
    <div className="min-h-screen bg-surface">
      {/* M14 GAL-FR-157: live sale banners (impression/click tracked) */}
      <PublicGalleryBanners slug={slug} initialBanners={banners} />

      {/* Gallery header */}
      <header className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-semibold text-text-primary">{gallery.title}</h1>
        {gallery.description && (
          <p className="text-text-secondary mt-2 max-w-2xl">{gallery.description}</p>
        )}
        <p className="text-sm text-text-tertiary mt-1">
          {assets.length} {assets.length === 1 ? "photo" : "photos"}
        </p>
      </header>

      {/* Masonry grid + FaceID filter + Map toggle (client component so
          the face filter event listener and view toggle actually work). */}
      <div className="max-w-6xl mx-auto px-4 pb-16">
        <PublicGalleryGrid slug={slug} assets={assets} />
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
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  try {
    const gallery = await getPublicGallery(slug);
    return {
      title: gallery.title,
      description: gallery.description || `View ${gallery.title} on RawDrive`,
    };
  } catch {
    return { title: "Gallery Not Found" };
  }
}
