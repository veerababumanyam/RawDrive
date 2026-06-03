// Canonical client-side copies of the SW cache-key helpers. The classic service
// worker cannot import TS, so frontend/public/service-worker.js and
// service-worker-helpers.js keep byte-identical copies; the drift-guard test in
// service-worker-cache-policy.test.ts compares all three function BODIES.
export const AUTH_QUERY_PARAMS = ["at", "gs", "gallery_session", "token", "access_token"];

export function normalizeGalleryCacheKey(rawUrl: string): string {
  const url = new URL(rawUrl);
  for (const p of AUTH_QUERY_PARAMS) url.searchParams.delete(p);
  return url.toString();
}

export function offlineBucketName(galleryId: string): string {
  return `rawdrive-offline-${galleryId || "default"}`;
}
