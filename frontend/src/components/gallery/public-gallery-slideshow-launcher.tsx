"use client";

import { useState } from "react";
import { publicGalleryMusicUrl, type PublicAsset } from "@/lib/api/galleries";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";
import { LIGHTBOX_VARIANTS } from "@/lib/media-encryption/asset-media";
import { GallerySlideshow } from "./gallery-slideshow";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Play } from "@/components/icons";

/**
 * Renders one slideshow slide through the SAME client-side media-encryption
 * pipeline the grid/lightbox use, so encrypted galleries decrypt correctly and
 * non-encrypted ones resolve a plain storage URL. Only the current slide is
 * mounted, so a single hook per visible slide is all that is needed.
 */
function SlideshowSlide({
  asset,
  sessionToken,
  position,
  total,
}: {
  asset: PublicAsset;
  sessionToken: string | null;
  position: number;
  total: number;
}) {
  const media = useDecryptedAssetUrl(asset, LIGHTBOX_VARIANTS, null, sessionToken);
  return (
    <img
      src={media.src}
      alt={asset.filename || `Slide ${position} of ${total}`}
      className="max-h-full max-w-full object-contain"
    />
  );
}

interface PublicGallerySlideshowLauncherProps {
  slug: string;
  ws?: string | null;
  assets: PublicAsset[];
  hasMusic: boolean;
  gallerySessionToken?: string | null;
}

/**
 * "Play slideshow" launch control for the public gallery. Opens the full-screen
 * GallerySlideshow over all gallery photos, with the gallery's background music
 * when one is configured. Decoupled from the heavy grid component and mounted
 * at page level.
 */
export function PublicGallerySlideshowLauncher({
  slug,
  ws,
  assets,
  hasMusic,
  gallerySessionToken,
}: PublicGallerySlideshowLauncherProps) {
  const [open, setOpen] = useState(false);

  if (assets.length === 0) return null;

  const musicUrl = hasMusic ? publicGalleryMusicUrl(slug, ws, gallerySessionToken) : null;

  return (
    <>
      <GlassIconButton label="Play slideshow" onClick={() => setOpen(true)} size="md" variant="glass">
        <Play />
      </GlassIconButton>
      {open ? (
        <GallerySlideshow
          slideCount={assets.length}
          renderSlide={(i) => (
            <SlideshowSlide
              asset={assets[i]}
              sessionToken={gallerySessionToken ?? null}
              position={i + 1}
              total={assets.length}
            />
          )}
          musicUrl={musicUrl}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
