// Pure helpers shared with unit tests.
// No SW globals (self, caches, fetch) here — this file is an ES module so
// vitest can import it directly. The service worker inlines byte-identical
// copies of these functions because classic workers cannot import ES modules.

const AUTH_QUERY_PARAMS = ["at", "gs", "gallery_session", "token", "access_token"];

/**
 * Strip rotating auth query params so the cache key is stable across token refreshes.
 * @param {string} rawUrl - Must be an absolute URL.
 * @returns {string} The URL with auth query params removed.
 */
export function normalizeGalleryCacheKey(rawUrl) {
  const url = new URL(rawUrl);
  for (const p of AUTH_QUERY_PARAMS) url.searchParams.delete(p);
  return url.toString();
}

/**
 * Return the stable, version-independent Cache Storage bucket name for a gallery.
 * @param {string} galleryId - Gallery slug or ID.
 * @returns {string} Cache bucket name of the form `rawdrive-offline-<galleryId>`.
 */
export function offlineBucketName(galleryId) {
  return `rawdrive-offline-${galleryId || "default"}`;
}
