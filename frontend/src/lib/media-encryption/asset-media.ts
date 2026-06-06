import type { MediaEncryptionManifest } from "./media-crypto";
export type { MediaEncryptionManifest };

export type EncryptedAssetLike = {
  id?: string;
  filename?: string;
  storage_key?: string;
  download_url?: string;
  is_encrypted?: boolean;
  thumbnail_urls?: Record<string, string> | null;
  media_encryption?: Record<string, unknown> | null;
};

export const GRID_VARIANTS = [
  "thumb_md_webp",
  "thumb_sm_webp",
  "thumb_lg_webp",
  "display_webp",
] as const;

export const FILMSTRIP_VARIANTS = [
  "thumb_sm_webp",
  "thumb_md_webp",
  "thumb_lg_webp",
  "display_webp",
] as const;

export const LIGHTBOX_VARIANTS = [
  "display_webp",
  "thumb_lg_webp",
  "thumb_md_webp",
  "thumb_sm_webp",
] as const;

export type PickedAssetMedia = {
  variant: string;
  key: string;
  manifest: MediaEncryptionManifest | null;
};

export function assetUsesClientMediaEncryption(asset: EncryptedAssetLike | null | undefined): boolean {
  return Boolean(asset?.is_encrypted && asset.media_encryption?.scheme === "rawdrive-e2ee-v1");
}

export function mediaKeyIdsForAsset(asset: EncryptedAssetLike | null | undefined): string[] {
  if (!asset?.media_encryption) return [];
  const ids = new Set<string>();
  const add = (manifest: unknown) => {
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return;
    const keyId = (manifest as Record<string, unknown>).key_id;
    if (typeof keyId === "string" && keyId) ids.add(keyId);
  };

  add(asset.media_encryption);
  const variants = asset.media_encryption.variants;
  if (variants && typeof variants === "object" && !Array.isArray(variants)) {
    for (const manifest of Object.values(variants)) add(manifest);
  }

  return Array.from(ids);
}

export function pickAssetMedia(
  asset: EncryptedAssetLike | null | undefined,
  variants: readonly string[],
): PickedAssetMedia | null {
  return pickAssetMediaCandidates(asset, variants)[0] ?? null;
}

export function pickAssetMediaCandidates(
  asset: EncryptedAssetLike | null | undefined,
  variants: readonly string[],
): PickedAssetMedia[] {
  if (!asset) return [];
  const picked: PickedAssetMedia[] = [];
  const seen = new Set<string>();
  for (const variant of variants) {
    const key = asset.thumbnail_urls?.[variant];
    if (key && isWebPDisplayVariant(variant, key)) {
      picked.push({
        variant,
        key,
        manifest: variantManifest(asset, variant),
      });
      seen.add(`${variant}\0${key}`);
    }
  }
  for (const [variant, key] of Object.entries(asset.thumbnail_urls ?? {})) {
    if (!isWebPDisplayVariant(variant, key)) continue;
    const dedupeKey = `${variant}\0${key}`;
    if (seen.has(dedupeKey)) continue;
    picked.push({
      variant,
      key,
      manifest: variantManifest(asset, variant),
    });
    seen.add(dedupeKey);
  }
  return picked;
}

function isWebPDisplayVariant(variant: string, key: string): boolean {
  const normalizedVariant = variant.toLowerCase();
  const normalizedKey = key.toLowerCase().split("?", 1)[0];
  return (
    normalizedVariant.endsWith("_webp") ||
    normalizedVariant.includes("webp") ||
    normalizedKey.endsWith(".webp") ||
    normalizedKey.endsWith(".webp.enc")
  );
}

export function originalManifest(asset: EncryptedAssetLike): MediaEncryptionManifest | null {
  const manifest = asset.media_encryption;
  if (!manifest || manifest.scheme !== "rawdrive-e2ee-v1") return null;
  return manifest as MediaEncryptionManifest;
}

export function variantManifest(asset: EncryptedAssetLike, variant: string): MediaEncryptionManifest | null {
  const variants = asset.media_encryption?.variants;
  if (!variants || typeof variants !== "object" || Array.isArray(variants)) return null;
  const manifest = (variants as Record<string, unknown>)[variant];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return null;
  if ((manifest as Record<string, unknown>).scheme !== "rawdrive-e2ee-v1") return null;
  return manifest as MediaEncryptionManifest;
}
