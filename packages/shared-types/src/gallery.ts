/**
 * Status of a gallery
 */
export const GalleryStatus = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
} as const;
export type GalleryStatus = typeof GalleryStatus[keyof typeof GalleryStatus];

/**
 * Download policy for gallery assets
 * Aligned with galleries_client_portal spec (view_only, web_only, watermarked_only, original_allowed)
 */
export const DownloadPolicy = {
  VIEW_ONLY: 'view_only',
  WEB_ONLY: 'web_only',
  WATERMARKED_ONLY: 'watermarked_only',
  ORIGINAL_ALLOWED: 'original_allowed',
} as const;
export type DownloadPolicy = typeof DownloadPolicy[keyof typeof DownloadPolicy];

/**
 * Theme mode for gallery display
 */
export const ThemeMode = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const;
export type ThemeMode = typeof ThemeMode[keyof typeof ThemeMode];

/**
 * Layout style for gallery grid / portal navigation
 */
export const LayoutStyle = {
  TABS: 'tabs',
  CONTINUOUS: 'continuous',
  GRID: 'grid',
  MASONRY: 'masonry',
} as const;
export type LayoutStyle = typeof LayoutStyle[keyof typeof LayoutStyle];

/**
 * Asset processing status
 */
export const AssetStatus = {
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  AVAILABLE: 'available',
  FAILED: 'failed',
  DELETED: 'deleted',
} as const;
export type AssetStatus = typeof AssetStatus[keyof typeof AssetStatus];
