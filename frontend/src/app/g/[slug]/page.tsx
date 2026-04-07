import { getPublicGallery, getPublicGalleryAssets } from "@/lib/api/galleries";
import { notFound } from "next/navigation";

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

  return (
    <div className="min-h-screen bg-surface">
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

      {/* Masonry grid */}
      <div className="max-w-6xl mx-auto px-4 pb-16">
        {assets.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-text-secondary">This gallery is empty.</p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
            {assets.map((asset) => {
              const thumbUrl =
                asset.thumbnail_urls?.lg ||
                asset.thumbnail_urls?.md ||
                asset.thumbnail_urls?.sm;

              return (
                <div
                  key={asset.id}
                  className="break-inside-avoid rounded-xl overflow-hidden bg-surface-sunken"
                >
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={asset.filename}
                      width={asset.width || undefined}
                      height={asset.height || undefined}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-auto object-cover"
                      style={
                        asset.blurhash
                          ? { backgroundSize: "cover", backgroundPosition: "center" }
                          : undefined
                      }
                    />
                  ) : (
                    <div
                      className="w-full aspect-[4/3] bg-surface-sunken flex items-center justify-center"
                      role="img"
                      aria-label={asset.filename}
                    >
                      <span className="text-xs text-text-tertiary">Processing...</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
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
