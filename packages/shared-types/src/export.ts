/**
 * Gallery Export Types
 *
 * Types for multi-format gallery export functionality:
 * - Print-ready PDF albums
 * - Animated slideshows (MP4/WebM)
 * - Shareable ZIP archives
 * - Cloud sync (Google Photos, Amazon Photos, Dropbox)
 * - Batch export scheduling
 */

// ---------------------------------------------------------------------------
// Export Format Enums
// ---------------------------------------------------------------------------

/**
 * Export format types
 */
export const ExportFormat = {
  ZIP: 'zip',
  PDF_ALBUM: 'pdf_album',
  SLIDESHOW_MP4: 'slideshow_mp4',
  SLIDESHOW_WEBM: 'slideshow_webm',
  CLOUD_GOOGLE_PHOTOS: 'cloud_google_photos',
  CLOUD_AMAZON_PHOTOS: 'cloud_amazon_photos',
  CLOUD_DROPBOX: 'cloud_dropbox',
} as const;
export type ExportFormat = typeof ExportFormat[keyof typeof ExportFormat];

/**
 * Export job status
 */
export const ExportStatus = {
  PENDING: 'pending',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  UPLOADING: 'uploading',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const;
export type ExportStatus = typeof ExportStatus[keyof typeof ExportStatus];

/**
 * PDF layout styles for print-ready albums
 */
export const PDFLayoutStyle = {
  SINGLE_PHOTO: 'single_photo',
  TWO_COLUMN: 'two_column',
  THREE_COLUMN: 'three_column',
  COLLAGE: 'collage',
  MAGAZINE: 'magazine',
  CLASSIC: 'classic',
} as const;
export type PDFLayoutStyle = typeof PDFLayoutStyle[keyof typeof PDFLayoutStyle];

/**
 * PDF page sizes
 */
export const PDFPageSize = {
  A4: 'a4',
  A3: 'a3',
  LETTER: 'letter',
  LEGAL: 'legal',
  SQUARE_8X8: 'square_8x8',
  SQUARE_10X10: 'square_10x10',
  SQUARE_12X12: 'square_12x12',
} as const;
export type PDFPageSize = typeof PDFPageSize[keyof typeof PDFPageSize];

/**
 * Slideshow transition effects
 */
export const SlideshowTransition = {
  FADE: 'fade',
  DISSOLVE: 'dissolve',
  SLIDE_LEFT: 'slide_left',
  SLIDE_RIGHT: 'slide_right',
  ZOOM_IN: 'zoom_in',
  ZOOM_OUT: 'zoom_out',
  KEN_BURNS: 'ken_burns',
  NONE: 'none',
} as const;
export type SlideshowTransition = typeof SlideshowTransition[keyof typeof SlideshowTransition];

/**
 * Slideshow video quality
 */
export const SlideshowQuality = {
  SD_480P: '480p',
  HD_720P: '720p',
  FHD_1080P: '1080p',
  UHD_4K: '4k',
} as const;
export type SlideshowQuality = typeof SlideshowQuality[keyof typeof SlideshowQuality];

/**
 * Image resolution for ZIP exports
 */
export const ImageResolution = {
  ORIGINAL: 'original',
  HIGH: 'high',       // 4000px longest edge
  WEB: 'web',         // 2048px longest edge
  PREVIEW: 'preview', // 1200px longest edge
  THUMBNAIL: 'thumbnail', // 400px longest edge
} as const;
export type ImageResolution = typeof ImageResolution[keyof typeof ImageResolution];

/**
 * Cloud sync status for individual items
 */
export const CloudSyncItemStatus = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  SYNCED: 'synced',
  FAILED: 'failed',
  SKIPPED: 'skipped',
} as const;
export type CloudSyncItemStatus = typeof CloudSyncItemStatus[keyof typeof CloudSyncItemStatus];

// ---------------------------------------------------------------------------
// Export Configuration Interfaces
// ---------------------------------------------------------------------------

/**
 * ZIP export configuration
 */
export interface ZipExportConfig {
  resolution: ImageResolution;
  includeMetadata: boolean;
  preserveOriginalFilenames: boolean;
  flattenStructure: boolean;
  includeSubGalleryFolders: boolean;
}

/**
 * PDF album export configuration
 */
export interface PDFExportConfig {
  layoutStyle: PDFLayoutStyle;
  pageSize: PDFPageSize;
  orientation: 'portrait' | 'landscape';
  includeTitle: boolean;
  includeCover: boolean;
  includeTableOfContents: boolean;
  includePageNumbers: boolean;
  includeExifData: boolean;
  includeDateTaken: boolean;
  photoBorder: boolean;
  photoBorderWidth: number;
  backgroundColor: string;
  fontFamily: string;
  coverTitle?: string;
  coverSubtitle?: string;
  quality: 'print' | 'web' | 'screen';
}

/**
 * Slideshow export configuration
 */
export interface SlideshowExportConfig {
  transition: SlideshowTransition;
  transitionDuration: number;  // milliseconds
  displayDuration: number;     // milliseconds per photo
  quality: SlideshowQuality;
  aspectRatio: '16:9' | '4:3' | '1:1' | '9:16';
  includeAudio: boolean;
  audioTrackUrl?: string;
  audioFadeIn: boolean;
  audioFadeOut: boolean;
  loopAudio: boolean;
  includeTitleSlide: boolean;
  includeEndSlide: boolean;
  titleSlideText?: string;
  endSlideText?: string;
  backgroundColor: string;
}

/**
 * Cloud sync configuration
 */
export interface CloudSyncConfig {
  createAlbum: boolean;
  albumName?: string;
  resolution: ImageResolution;
  syncSubGalleries: boolean;
  overwriteExisting: boolean;
}

// ---------------------------------------------------------------------------
// Export Job Interfaces
// ---------------------------------------------------------------------------

/**
 * Gallery export job
 */
export interface GalleryExport {
  exportId: string;
  workspaceId: string;
  galleryId: string;
  userId: string;
  format: ExportFormat;
  status: ExportStatus;
  progress: number;
  progressMessage?: string;
  totalAssets: number;
  processedAssets: number;
  failedAssets: number;
  skippedAssets: number;
  fileSizeBytes?: number;
  downloadUrl?: string;
  expiresAt?: string;
  errorMessage?: string;
  errorCode?: string;
  config: ZipExportConfig | PDFExportConfig | SlideshowExportConfig | CloudSyncConfig;
  subGalleryIds?: string[];
  assetIds?: string[];
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Summary version for list views
 */
export interface GalleryExportSummary {
  exportId: string;
  galleryId: string;
  galleryTitle: string;
  format: ExportFormat;
  status: ExportStatus;
  progress: number;
  totalAssets: number;
  processedAssets: number;
  fileSizeBytes?: number;
  downloadUrl?: string;
  expiresAt?: string;
  createdAt: string;
}

/**
 * Cloud sync item status
 */
export interface CloudSyncItem {
  assetId: string;
  filename: string;
  status: CloudSyncItemStatus;
  remoteId?: string;
  remotePath?: string;
  errorMessage?: string;
  syncedAt?: string;
}

/**
 * Cloud provider connection
 */
export interface CloudProviderConnection {
  connectionId: string;
  provider: 'google_photos' | 'amazon_photos' | 'dropbox';
  accountEmail?: string;
  accountName?: string;
  connected: boolean;
  connectedAt?: string;
  expiresAt?: string;
  scopes: string[];
}

// ---------------------------------------------------------------------------
// API Request/Response Interfaces
// ---------------------------------------------------------------------------

/**
 * Request to create a new export job
 */
export interface CreateExportRequest {
  format: ExportFormat;
  config: ZipExportConfig | PDFExportConfig | SlideshowExportConfig | CloudSyncConfig;
  subGalleryIds?: string[];
  assetIds?: string[];
  scheduledAt?: string;
}

/**
 * Response after creating an export job
 */
export interface CreateExportResponse {
  export: GalleryExport;
  estimatedDuration?: number;
  estimatedSize?: number;
  queuePosition?: number;
}

/**
 * Request to list exports
 */
export interface ListExportsQuery {
  galleryId?: string;
  format?: ExportFormat;
  status?: ExportStatus;
  page?: number;
  limit?: number;
}

/**
 * Response for list exports
 */
export interface ListExportsResponse {
  data: GalleryExportSummary[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Request to cancel an export
 */
export interface CancelExportRequest {
  reason?: string;
}

/**
 * Request to retry a failed export
 */
export interface RetryExportRequest {
  modifiedConfig?: Partial<ZipExportConfig | PDFExportConfig | SlideshowExportConfig | CloudSyncConfig>;
}

/**
 * Batch export request for multiple galleries
 */
export interface BatchExportRequest {
  galleryIds: string[];
  format: ExportFormat;
  config: ZipExportConfig | PDFExportConfig | SlideshowExportConfig | CloudSyncConfig;
  scheduledAt?: string;
}

/**
 * Batch export response
 */
export interface BatchExportResponse {
  exports: GalleryExport[];
  totalQueued: number;
  estimatedTotalDuration?: number;
}

/**
 * Cloud provider OAuth start request
 */
export interface ConnectCloudProviderRequest {
  provider: 'google_photos' | 'amazon_photos' | 'dropbox';
  redirectUri: string;
}

/**
 * Cloud provider OAuth start response
 */
export interface ConnectCloudProviderResponse {
  authUrl: string;
  state: string;
}

/**
 * Cloud provider OAuth callback request
 */
export interface CloudProviderCallbackRequest {
  provider: 'google_photos' | 'amazon_photos' | 'dropbox';
  code: string;
  state: string;
}

/**
 * List cloud connections response
 */
export interface ListCloudConnectionsResponse {
  connections: CloudProviderConnection[];
}

/**
 * Export statistics for a workspace
 */
export interface ExportStats {
  totalExports: number;
  completedExports: number;
  failedExports: number;
  pendingExports: number;
  totalStorageUsedBytes: number;
  exportsByFormat: Record<ExportFormat, number>;
  last30DaysExports: number;
}

// ---------------------------------------------------------------------------
// WebSocket Message Types
// ---------------------------------------------------------------------------

/**
 * Export progress update via WebSocket
 */
export interface ExportProgressMessage {
  type: 'export_progress';
  exportId: string;
  status: ExportStatus;
  progress: number;
  progressMessage?: string;
  processedAssets: number;
  totalAssets: number;
}

/**
 * Export completed message
 */
export interface ExportCompletedMessage {
  type: 'export_completed';
  exportId: string;
  downloadUrl: string;
  fileSizeBytes: number;
  expiresAt: string;
}

/**
 * Export failed message
 */
export interface ExportFailedMessage {
  type: 'export_failed';
  exportId: string;
  errorMessage: string;
  errorCode?: string;
}

/**
 * Union type for all export WebSocket messages
 */
export type ExportWebSocketMessage =
  | ExportProgressMessage
  | ExportCompletedMessage
  | ExportFailedMessage;
