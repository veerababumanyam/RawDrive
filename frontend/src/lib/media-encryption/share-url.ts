import { appendGalleryKeyFragment, readGalleryKeyFromHash } from "./media-crypto";
import { galleryKeyId, getStoredExportedMediaKey } from "./media-key-store";

const ABSOLUTE_URL_RE = /^[a-z][a-z\d+\-.]*:/i;

export function appendStoredGalleryKeyFragment(
  url: string,
  galleryId: string | null | undefined,
): string {
  if (!url || !galleryId) return url;
  const key = getStoredExportedMediaKey(galleryKeyId(galleryId));
  return key ? appendGalleryKeyFragment(url, key) : url;
}

export function appendCurrentGalleryKeyFragment(url: string): string {
  if (!url || typeof window === "undefined") return url;
  const key = readGalleryKeyFromHash(window.location.hash);
  return key ? appendGalleryKeyFragment(url, key) : url;
}

export function setUrlSearchParamBeforeFragment(
  url: string,
  name: string,
  value: string | null | undefined,
): string {
  if (!url || !name) return url;
  const isAbsolute = ABSOLUTE_URL_RE.test(url);
  const base = typeof window !== "undefined" ? window.location.origin : "https://rawdrive.local";
  const parsed = new URL(url, base);
  if (value == null || value === "") {
    parsed.searchParams.delete(name);
  } else {
    parsed.searchParams.set(name, value);
  }
  if (isAbsolute) return parsed.toString();
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
