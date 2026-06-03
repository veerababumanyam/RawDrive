import {
  BROWSER_DECODE_STILL_IMAGE_MIME_TYPES,
  DESKTOP_REQUIRED_STILL_IMAGE_MIME_TYPES,
  isBrowserDecodableStillImageName,
  isDesktopRequiredStillImageName,
} from "@/lib/still-image-formats";

export const BROWSER_E2EE_MAX_ORIGINAL_BYTES = 256 * 1024 * 1024;

const BROWSER_DECODE_MIME_TYPES = new Set<string>(
  BROWSER_DECODE_STILL_IMAGE_MIME_TYPES,
);
const DESKTOP_REQUIRED_MIME_TYPES = new Set<string>(
  DESKTOP_REQUIRED_STILL_IMAGE_MIME_TYPES,
);

export function browserE2EEMaxUploadSizeLabel(): string {
  return formatBytes(BROWSER_E2EE_MAX_ORIGINAL_BYTES);
}

export function getBrowserE2EEUploadBlockReason(file: File): string | null {
  if (file.size > BROWSER_E2EE_MAX_ORIGINAL_BYTES) {
    return `Files over ${browserE2EEMaxUploadSizeLabel()} require RawDrive Desktop for streaming source-side encryption.`;
  }

  const type = file.type.trim().toLowerCase();
  // CD4 — browser-decodable check FIRST (and by name, so it wins over the
  // `image/x-*` blanket reject below). HEIC/HEIF/AVIF + the cr2/nef/arw/dng/
  // orf/raf/rw2 RAW families now decode in-browser; many of those RAW files
  // carry an `image/x-<vendor>` MIME, so a name-based allow must run before the
  // `image/x-*` block or they'd be falsely routed to desktop.
  if (
    BROWSER_DECODE_MIME_TYPES.has(type) ||
    isBrowserDecodableStillImageName(file.name)
  ) {
    return null;
  }

  // CR3, exotic/proprietary RAW, TIFF, and any other `image/x-*` still image
  // remain desktop-only. The `image/x-*` glob is now reached ONLY for formats
  // the in-browser decoders cannot handle, because every browser-decodable
  // family returned null above.
  if (
    DESKTOP_REQUIRED_MIME_TYPES.has(type) ||
    type.startsWith("image/x-") ||
    isDesktopRequiredStillImageName(file.name)
  ) {
    return "RAW, TIFF, HEIC/HEIF, and AVIF require RawDrive Desktop so WebP derivatives can be created and encrypted at source.";
  }

  if (type.startsWith("image/")) {
    return "This image format is not browser-decodable for source-side WebP encryption. Use RawDrive Desktop for this file.";
  }

  return "Photo galleries accept still-image files only.";
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024 * 1024))}GB`;
  }
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}
