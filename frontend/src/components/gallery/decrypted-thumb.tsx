"use client";

// DecryptedThumb — a small, reusable thumbnail that renders a gallery asset
// through the client-side decryption path (useDecryptedAssetUrl). On an E2EE
// gallery the raw /storage thumbnail bytes are ciphertext, so a plain
// <img src=/storage/...> shows a broken image; this component fetches the
// encrypted bytes and decrypts them in the browser with the gallery key (held
// globally in localStorage / the #rd_key fragment). For a non-encrypted
// (legacy/plaintext) gallery the hook returns the plaintext storage URL, so
// the same component works everywhere.
//
// Extracted from public-gallery-grid.tsx's PublicAssetTileImage so the People
// tab, per-person grid, and Find Me result grid render decrypted thumbnails the
// same way the main gallery grid does (epic: seamless Find Me on E2EE galleries,
// slice 3 / L2).

import type { EncryptedAssetLike } from "@/lib/media-encryption/asset-media";
import { GRID_VARIANTS } from "@/lib/media-encryption/asset-media";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";
import { publicMediaErrorMessage } from "@/lib/media-encryption/public-media-error";
import { LockedMediaFallback } from "@/components/gallery/media-key-recovery";

export function DecryptedThumb({
  asset,
  variants = GRID_VARIANTS,
  className,
  alt = "",
  assetAccessToken = null,
}: {
  asset: EncryptedAssetLike | null | undefined;
  variants?: readonly string[];
  className?: string;
  alt?: string;
  // Gated-gallery byte-auth token (?at=) for protected non-encrypted bytes.
  assetAccessToken?: string | null;
}) {
  const media = useDecryptedAssetUrl(asset ?? null, variants, null, assetAccessToken);

  if (media.loading) {
    return (
      <div
        className={`${className ?? ""} animate-pulse bg-surface-sunken`.trim()}
        aria-hidden
      />
    );
  }

  if (media.src) {
    return (
      <img
        src={media.src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={className}
      />
    );
  }

  return (
    <LockedMediaFallback
      asset={asset ?? null}
      error={media.error}
      message={publicMediaErrorMessage(media.error) || "Image unavailable"}
      className={className}
    />
  );
}
