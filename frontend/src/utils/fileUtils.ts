/**
 * File Utilities
 * Helper functions for file type detection and handling
 */

import { SUPPORTED_RAW_EXTENSIONS, RAW_MIME_TYPES } from '@rawdrive/shared-constants';

// Re-export for backwards compatibility
export const RAW_EXTENSIONS = SUPPORTED_RAW_EXTENSIONS;

/**
 * Check if a file is a RAW format based on filename
 */
export function isRawFile(filename: string): boolean {
  if (!filename) return false;
  const ext = filename.toLowerCase().split('.').pop();
  return ext ? SUPPORTED_RAW_EXTENSIONS.includes(ext as any) : false;
}

/**
 * Check if a file is a RAW format based on MIME type
 * Note: This is unreliable - browsers often return empty or generic MIME for RAW
 */
export function isRawMimeType(mimeType: string): boolean {
  if (!mimeType) return false;
  const mime = mimeType.toLowerCase();
  return RAW_MIME_TYPES.some(rawMime =>
    mime === rawMime || mime.includes('raw') || mime.includes(rawMime)
  );
}

/**
 * Check if a File object is a RAW file
 * Uses extension-based detection (more reliable than MIME type)
 */
export function isRawFileObject(file: File): boolean {
  return isRawFile(file.name);
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
      return 'preview'; // Download converted JPEG
    case 'view_only':
      return null; // No download allowed
    default:
      return null;
  }
}

/**
 * Check if file is an animated format (GIF, APNG, animated WebP)
 */
export function isAnimatedFormat(file: File): boolean {
  const animatedMimes = ['image/gif', 'image/apng', 'image/webp'];
  return animatedMimes.includes(file.type.toLowerCase());
}

/**
 * Check if file is AVIF format
 */
export function isAvifFile(file: File): boolean {
  return (
    file.type === 'image/avif' ||
    file.name.toLowerCase().endsWith('.avif')
  );
}

/**
 * Check if file is TIFF format
 */
export function isTiffFile(file: File): boolean {
  return (
    file.type === 'image/tiff' ||
    file.type === 'image/tiff-fx' ||
    file.name.toLowerCase().endsWith('.tiff') ||
    file.name.toLowerCase().endsWith('.tif')
  );
}

/**
 * Check if file is BMP format
 */
export function isBmpFile(file: File): boolean {
  return (
    file.type === 'image/bmp' ||
    file.type === 'image/x-ms-bmp' ||
    file.name.toLowerCase().endsWith('.bmp')
  );
}
