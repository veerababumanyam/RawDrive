import type { Gallery, PublicAsset } from "@/lib/api/galleries";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { galleryKeyId } from "@/lib/media-encryption/media-key-store";
import { variantManifest } from "@/lib/media-encryption/asset-media";
import type { EncryptedAssetLike } from "@/lib/media-encryption/asset-media";
import { saveGalleryMeta, listSaved, removeGallery, markValidated } from "./catalog";
import { requestPersistentStorage, enforceQuota } from "./storage";
import type { SavedAsset, SavedGalleryMeta } from "./types";
import { offlineBucketName, normalizeGalleryCacheKey, AUTH_QUERY_PARAMS } from "./cache-keys";

// SEC-1: the backend injects a rotating, short-lived asset-access credential into
// gallery.settings.asset_access_token (and the same family of names lives in
// AUTH_QUERY_PARAMS). These MUST NEVER be written to IndexedDB at rest. Strip the
// credential key plus every AUTH_QUERY_PARAM name, keeping all render-needed fields
// (design_config, cover_template, cover_config, cover_thumbnails, watermark_config,
// max_selections, …) untouched.
const FORBIDDEN_SETTINGS_KEYS = new Set<string>(["asset_access_token", ...AUTH_QUERY_PARAMS]);

// Pure: drop auth/credential keys from a gallery settings object before persisting
// it offline. Returns a new object; never mutates the input.
export function sanitizeGallerySettings(
  settings: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!settings || typeof settings !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(settings)) {
    if (FORBIDDEN_SETTINGS_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

// Pure: decide what to do with a saved gallery given a revalidation response.
export function purgeDecision(res: { ok: boolean; status: number }): "purge" | "keep" {
  if (res.ok) return "keep";
  return res.status === 403 || res.status === 404 || res.status === 410 ? "purge" : "keep";
}

function toSavedAsset(a: PublicAsset): SavedAsset {
  const displayKey = a.thumbnail_urls?.["display_webp"] ?? "";
  return {
    id: a.id,
    filename: a.filename,
    displayKey,
    thumbnailUrls: a.thumbnail_urls ?? {},
    // PublicAsset satisfies EncryptedAssetLike (both have thumbnail_urls,
    // is_encrypted, media_encryption as optional fields).
    manifest: variantManifest(a as EncryptedAssetLike, "display_webp"),
    width: a.width,
    height: a.height,
    blurhash: a.blurhash,
  };
}

async function deleteBucketViaSW(galleryId: string): Promise<void> {
  const reg = await navigator.serviceWorker?.ready;
  reg?.active?.postMessage({ type: "offline:deleteBucket", galleryId });
}

// Called after an online gallery render. Writes meta + prefetches display bytes.
export async function cacheGalleryForOffline(
  gallery: Gallery,
  assets: PublicAsset[],
  ws: string | null,
  assetAccessToken: string | null,
): Promise<void> {
  if (typeof navigator === "undefined" || typeof caches === "undefined") return;
  await requestPersistentStorage();
  const isEncrypted = assets.some((a) => a.is_encrypted);
  const savedAssets = assets.map(toSavedAsset);

  // galleryKeyId is synchronous — returns string directly.
  const meta: SavedGalleryMeta = {
    slug: gallery.slug,
    galleryId: gallery.id,
    ws,
    title: gallery.title,
    isEncrypted,
    keyId: isEncrypted ? galleryKeyId(gallery.id) : null,
    assets: savedAssets,
    gallerySettings: sanitizeGallerySettings(gallery.settings as Record<string, unknown>),
    etag: null,
    // Gallery.expires_at is string | undefined; SavedGalleryMeta.expiresAt is string | null.
    expiresAt: gallery.expires_at ?? null,
    lastViewedAt: Date.now(),
    lastValidatedAt: Date.now(),
    approxBytes: 0,
  };
  await saveGalleryMeta(meta);

  const cache = await caches.open(offlineBucketName(gallery.id));
  let bytes = 0;
  for (const a of savedAssets) {
    if (!a.displayKey) continue;
    const url = getStorageBackedUrl(a.displayKey, null, assetAccessToken);
    try {
      const res = await fetch(url, { credentials: "include", mode: "cors" });
      if (res.ok && res.type !== "opaque") {
        await cache.put(new Request(normalizeGalleryCacheKey(url), { method: "GET" }), res.clone());
        const len = Number(res.headers.get("content-length") || 0);
        bytes += len || 300 * 1024; // content-length is often absent on CORS/encrypted responses; estimate 300KB/display image
      }
    } catch { /* offline mid-prefetch — keep whatever we've cached so far */ }
  }
  await saveGalleryMeta({ ...meta, approxBytes: bytes });
  await enforceQuota(deleteBucketViaSW);
}

// Called on reconnect. Revalidates each saved gallery; purges revoked.
export async function revalidateSavedGalleries(
  check: (
    slug: string,
    ws: string | null,
  ) => Promise<{ ok: boolean; status: number; etag: string | null }>,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  for (const meta of await listSaved()) {
    let res: { ok: boolean; status: number; etag: string | null };
    try {
      res = await check(meta.slug, meta.ws);
    } catch {
      continue;
    }
    if (purgeDecision(res) === "purge") {
      await deleteBucketViaSW(meta.galleryId);
      await removeGallery(meta.slug);
    } else if (res.ok) {
      await markValidated(meta.slug, res.etag, Date.now());
    }
  }
}
