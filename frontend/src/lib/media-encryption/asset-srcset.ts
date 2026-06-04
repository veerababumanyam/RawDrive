/**
 * buildAssetSrcSet — responsive image candidates for public gallery <img>s.
 *
 * The backend generates WebP derivatives at fixed bounding boxes
 * (thumbnail_service.go): thumb_sm_webp 200px, thumb_md_webp 600px,
 * thumb_lg_webp 1200px, display_webp 2400px. Serving a single `src` made
 * phones download desktop-size files; this helper exposes the full ladder
 * via `srcSet` so the browser picks the smallest sufficient variant.
 *
 * Returns null when a srcset is not safe to build:
 *  - client-encrypted assets (rendered from decrypted blob: URLs), or
 *  - any candidate key that is itself an encrypted (.enc) object, or
 *  - bearer-fetched media (the <img> element cannot attach the header).
 */

import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import {
  assetUsesClientMediaEncryption,
  type EncryptedAssetLike,
} from "./asset-media";

const VARIANT_WIDTHS: ReadonlyArray<readonly [variant: string, width: number]> =
  [
    ["thumb_sm_webp", 200],
    ["thumb_md_webp", 600],
    ["thumb_lg_webp", 1200],
    ["display_webp", 2400],
  ];

function keyLooksEncrypted(key: string): boolean {
  return key.toLowerCase().split("?", 1)[0].endsWith(".enc");
}

export function buildAssetSrcSet(
  asset: EncryptedAssetLike | null | undefined,
  token?: string | null,
  assetAccessToken?: string | null,
): string | null {
  if (!asset || assetUsesClientMediaEncryption(asset)) return null;
  // Bearer-fetched storage media is loaded via fetch+blob, not <img src>.
  if (token && !assetAccessToken) return null;

  const entries: string[] = [];
  for (const [variant, width] of VARIANT_WIDTHS) {
    const key = asset.thumbnail_urls?.[variant];
    if (!key || keyLooksEncrypted(key)) continue;
    entries.push(
      `${getStorageBackedUrl(key, token, assetAccessToken)} ${width}w`,
    );
  }
  return entries.length > 1 ? entries.join(", ") : null;
}

/** Default sizes for the public gallery grid (1-col phones → multi-col). */
export const GRID_SIZES =
  "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw";
