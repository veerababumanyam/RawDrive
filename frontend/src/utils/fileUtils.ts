/**
 * File Utilities
 * Helper functions for file type detection and handling
 */

// RAW file extensions
const RAW_EXTENSIONS = [
  'cr2', 'cr3', // Canon
  'nef',        // Nikon
  'arw',        // Sony
  'raf',        // Fujifilm
  'orf',        // Olympus
  'rw2',        // Panasonic
  'dng',        // Adobe DNG
];

/**
 * Check if a file is a RAW format based on filename
 */
export function isRawFile(filename: string): boolean {
  if (!filename) return false;
  const ext = filename.toLowerCase().split('.').pop();
  return ext ? RAW_EXTENSIONS.includes(ext) : false;
}

/**
 * Check if a file is a RAW format based on MIME type
 */
export function isRawMimeType(mimeType: string): boolean {
  if (!mimeType) return false;
  const mime = mimeType.toLowerCase();
  // Common RAW MIME types (may vary by browser/system)
  return (
    mime.includes('raw') ||
    mime.includes('cr2') ||
    mime.includes('nef') ||
    mime.includes('arw') ||
    mime.includes('raf') ||
    mime.includes('orf') ||
    mime.includes('rw2') ||
    mime.includes('dng') ||
    mime === 'image/x-canon-cr2' ||
    mime === 'image/x-nikon-nef' ||
    mime === 'image/x-sony-arw' ||
    mime === 'image/x-fuji-raf' ||
    mime === 'image/x-olympus-orf' ||
    mime === 'image/x-panasonic-rw2' ||
    mime === 'image/x-adobe-dng'
  );
}

/**
 * Check if an asset is a RAW file
 */
export function isRawAsset(filename?: string, mimeType?: string): boolean {
  if (filename && isRawFile(filename)) return true;
  if (mimeType && isRawMimeType(mimeType)) return true;
  return false;
}

/**
 * Get appropriate download variant for RAW files based on download policy
 * RAW files don't have WebP previews, so we need to handle them differently
 */
export function getRawDownloadVariant(
  downloadPolicy: 'view_only' | 'web_only' | 'watermarked_only' | 'original_allowed'
): 'original' | 'preview' | null {
  switch (downloadPolicy) {
    case 'original_allowed':
      return 'original'; // Download original RAW file
    case 'web_only':
    case 'watermarked_only':
      // For RAW files, "preview" should be converted JPEG
      // Backend should handle this by converting RAW to JPEG on-the-fly
      return 'preview'; // Download converted JPEG
    case 'view_only':
      return null; // No download allowed
    default:
      return null;
  }
}

