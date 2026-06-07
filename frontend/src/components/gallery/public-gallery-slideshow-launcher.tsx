"use client";

import { type PublicAsset } from "@/lib/api/galleries";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";
import { LIGHTBOX_VARIANTS } from "@/lib/media-encryption/asset-media";
import { publicMediaErrorMessage } from "@/lib/media-encryption/public-media-error";
import { LockedMediaFallback } from "@/components/gallery/media-key-recovery";
import { SlideshowImageFrame } from "@/components/gallery/gallery-slideshow";

/**
 * Renders one slideshow slide through the SAME client-side media-encryption
 * pipeline the grid/lightbox use, so encrypted galleries decrypt correctly and
 * non-encrypted ones resolve a plain storage URL. Only the current slide is
 * mounted (GallerySlideshow renders just the active index via renderSlide), so
 * a single hook per visible slide is all that is needed.
 *
 * The public slideshow itself is now hosted inside PublicGalleryHero — the
 * "Play" CTA sits next to "View Gallery" there. This module keeps the shared
 * per-slide renderer in one place so the hero can reuse it.
 */
export function SlideshowSlide({
  asset,
  assetAccessToken,
  viewerToken = null,
  position,
  total,
}: {
  asset: PublicAsset;
  assetAccessToken: string | null;
  viewerToken?: string | null;
  position: number;
  total: number;
}) {
  const media = useDecryptedAssetUrl(
    asset,
    LIGHTBOX_VARIANTS,
    viewerToken,
    assetAccessToken,
  );

  if (!media.src) {
    if (media.loading) {
      return <div className="gallery-slideshow__status">Loading photo...</div>;
    }
    return (
      <LockedMediaFallback
        asset={asset}
        error={media.error}
        message={publicMediaErrorMessage(media.error) || "Image unavailable"}
        mode="viewer"
        className="gallery-slideshow__status"
      />
    );
  }

  return (
    <SlideshowImageFrame
      src={media.src}
      alt={asset.filename || `Slide ${position} of ${total}`}
    />
  );
}
