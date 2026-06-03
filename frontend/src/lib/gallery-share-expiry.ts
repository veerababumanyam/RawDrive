type GalleryShareExpirySource = {
  expires_at?: string | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function galleryShareExpiryDays(
  gallery: GalleryShareExpirySource,
  now: Date = new Date(),
): number | undefined {
  if (!gallery.expires_at) return undefined;
  const expiresAtMs = Date.parse(gallery.expires_at);
  if (!Number.isFinite(expiresAtMs)) return undefined;

  const remainingMs = expiresAtMs - now.getTime();
  return Math.max(1, Math.ceil(remainingMs / MS_PER_DAY));
}
