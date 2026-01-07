/**
 * Gallery Export Constants
 *
 * Constants for multi-format gallery export functionality.
 */
// Re-export enums from shared-types for convenience
export { ExportFormat, ExportStatus, PDFLayoutStyle, PDFPageSize, SlideshowTransition, SlideshowQuality, ImageResolution, CloudSyncItemStatus, } from '@rawdrive/shared-types';
// ---------------------------------------------------------------------------
// Export Limits
// ---------------------------------------------------------------------------
/**
 * Export rate limiting configuration
 */
export const EXPORT_RATE_LIMITS = {
    /** Minimum seconds between export requests for same gallery */
    PER_GALLERY_COOLDOWN_SECONDS: 300, // 5 minutes
    /** Maximum concurrent exports per workspace */
    MAX_CONCURRENT_PER_WORKSPACE: 5,
    /** Maximum exports per gallery per day */
    MAX_PER_GALLERY_PER_DAY: 10,
};
/**
 * Export size limits
 */
export const EXPORT_SIZE_LIMITS = {
    /** Maximum assets per single export */
    MAX_ASSETS_PER_EXPORT: 10000,
    /** Maximum ZIP file size in bytes (10GB) */
    MAX_ZIP_SIZE_BYTES: 10 * 1024 * 1024 * 1024,
    /** Maximum PDF file size in bytes (500MB) */
    MAX_PDF_SIZE_BYTES: 500 * 1024 * 1024,
    /** Maximum slideshow video size in bytes (2GB) */
    MAX_SLIDESHOW_SIZE_BYTES: 2 * 1024 * 1024 * 1024,
};
/**
 * Export timing configuration
 */
export const EXPORT_TIMING = {
    /** Download URL expiry in hours */
    DOWNLOAD_EXPIRY_HOURS: 72, // 3 days
    /** Worker poll interval in seconds */
    WORKER_POLL_INTERVAL_SECONDS: 5,
    /** Export job timeout in minutes */
    JOB_TIMEOUT_MINUTES: 60,
    /** Frontend progress poll interval in milliseconds */
    PROGRESS_POLL_INTERVAL_MS: 2000,
};
// ---------------------------------------------------------------------------
// Export Configuration Defaults
// ---------------------------------------------------------------------------
/**
 * Default ZIP export configuration
 */
export const DEFAULT_ZIP_CONFIG = {
    resolution: 'original',
    includeMetadata: false,
    preserveOriginalFilenames: true,
    flattenStructure: false,
    includeSubGalleryFolders: true,
};
/**
 * Default PDF album configuration
 */
export const DEFAULT_PDF_CONFIG = {
    layoutStyle: 'classic',
    pageSize: 'a4',
    orientation: 'portrait',
    includeTitle: true,
    includeCover: true,
    includeTableOfContents: false,
    includePageNumbers: true,
    includeExifData: false,
    includeDateTaken: false,
    photoBorder: false,
    photoBorderWidth: 2,
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica',
    quality: 'print',
};
/**
 * Default slideshow configuration
 */
export const DEFAULT_SLIDESHOW_CONFIG = {
    transition: 'fade',
    transitionDuration: 500, // ms
    displayDuration: 3000, // ms
    quality: '1080p',
    aspectRatio: '16:9',
    includeAudio: false,
    audioFadeIn: true,
    audioFadeOut: true,
    loopAudio: true,
    includeTitleSlide: true,
    includeEndSlide: true,
    backgroundColor: '#000000',
};
/**
 * Default cloud sync configuration
 */
export const DEFAULT_CLOUD_SYNC_CONFIG = {
    createAlbum: true,
    resolution: 'high',
    syncSubGalleries: true,
    overwriteExisting: false,
};
// ---------------------------------------------------------------------------
// Image Resolution Settings
// ---------------------------------------------------------------------------
/**
 * Image resolution max dimensions (longest edge)
 */
export const RESOLUTION_MAX_DIMENSIONS = {
    original: Infinity, // No resize
    high: 4000,
    web: 2048,
    preview: 1200,
    thumbnail: 400,
};
/**
 * Image quality settings by output type
 */
export const IMAGE_QUALITY = {
    /** JPEG quality (0-100) */
    JPEG_PRINT: 95,
    JPEG_WEB: 85,
    JPEG_PREVIEW: 75,
    /** WebP quality (0-100) */
    WEBP_QUALITY: 85,
    /** PNG compression (0-9) */
    PNG_COMPRESSION: 6,
};
// ---------------------------------------------------------------------------
// PDF Layout Settings
// ---------------------------------------------------------------------------
/**
 * PDF page dimensions in points (72 points = 1 inch)
 */
export const PDF_PAGE_DIMENSIONS = {
    a4: { width: 595, height: 842 },
    a3: { width: 842, height: 1191 },
    letter: { width: 612, height: 792 },
    legal: { width: 612, height: 1008 },
    square_8x8: { width: 576, height: 576 },
    square_10x10: { width: 720, height: 720 },
    square_12x12: { width: 864, height: 864 },
};
/**
 * PDF layout photos per page
 */
export const PDF_PHOTOS_PER_PAGE = {
    single_photo: 1,
    two_column: 2,
    three_column: 3,
    collage: 4,
    magazine: 3,
    classic: 1,
};
// ---------------------------------------------------------------------------
// Slideshow Settings
// ---------------------------------------------------------------------------
/**
 * Slideshow video dimensions by quality
 */
export const SLIDESHOW_DIMENSIONS = {
    '480p': { width: 854, height: 480 },
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '4k': { width: 3840, height: 2160 },
};
/**
 * Slideshow aspect ratio dimensions
 */
export const SLIDESHOW_ASPECT_RATIOS = {
    '16:9': { width: 16, height: 9 },
    '4:3': { width: 4, height: 3 },
    '1:1': { width: 1, height: 1 },
    '9:16': { width: 9, height: 16 }, // Vertical/mobile
};
/**
 * Video encoding settings
 */
export const VIDEO_ENCODING = {
    /** Video bitrate by quality (kbps) */
    BITRATE: {
        '480p': 2500,
        '720p': 5000,
        '1080p': 8000,
        '4k': 20000,
    },
    /** Frames per second */
    FPS: 30,
    /** H.264 profile */
    PROFILE: 'high',
    /** H.264 preset */
    PRESET: 'medium',
};
// ---------------------------------------------------------------------------
// Cloud Provider Settings
// ---------------------------------------------------------------------------
/**
 * Cloud provider OAuth configuration
 */
export const CLOUD_OAUTH = {
    google_photos: {
        scopes: [
            'https://www.googleapis.com/auth/photoslibrary',
            'https://www.googleapis.com/auth/photoslibrary.appendonly',
        ],
        authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
    },
    amazon_photos: {
        scopes: ['clouddrive:read_all', 'clouddrive:write'],
        authEndpoint: 'https://www.amazon.com/ap/oa',
        tokenEndpoint: 'https://api.amazon.com/auth/o2/token',
    },
    dropbox: {
        scopes: ['files.content.write', 'files.content.read'],
        authEndpoint: 'https://www.dropbox.com/oauth2/authorize',
        tokenEndpoint: 'https://api.dropboxapi.com/oauth2/token',
    },
};
/**
 * Cloud provider rate limits
 */
export const CLOUD_RATE_LIMITS = {
    google_photos: {
        uploadsPerDay: 10000,
        maxFileSizeMB: 200,
    },
    amazon_photos: {
        uploadsPerDay: 5000,
        maxFileSizeMB: 2048,
    },
    dropbox: {
        uploadsPerDay: 100000,
        maxFileSizeMB: 350,
    },
};
// ---------------------------------------------------------------------------
// API Paths
// ---------------------------------------------------------------------------
/**
 * Export API paths
 */
export const EXPORT_API_PATHS = {
    /** Base path for export endpoints */
    BASE: '/api/v1/workspaces/{workspaceId}/gallery-exports',
    /** Create export for gallery */
    CREATE: '/api/v1/workspaces/{workspaceId}/gallery-exports/galleries/{galleryId}',
    /** List exports for gallery */
    LIST_GALLERY: '/api/v1/workspaces/{workspaceId}/gallery-exports/galleries/{galleryId}',
    /** Get export by ID */
    GET: '/api/v1/workspaces/{workspaceId}/gallery-exports/{exportId}',
    /** Cancel export */
    CANCEL: '/api/v1/workspaces/{workspaceId}/gallery-exports/{exportId}/cancel',
    /** Retry export */
    RETRY: '/api/v1/workspaces/{workspaceId}/gallery-exports/{exportId}/retry',
    /** Batch export */
    BATCH: '/api/v1/workspaces/{workspaceId}/gallery-exports/batch',
    /** Export stats */
    STATS: '/api/v1/workspaces/{workspaceId}/gallery-exports/stats',
    /** Cloud connections */
    CLOUD_CONNECTIONS: '/api/v1/workspaces/{workspaceId}/gallery-exports/cloud/connections',
    /** Connect cloud provider */
    CLOUD_CONNECT: '/api/v1/workspaces/{workspaceId}/gallery-exports/cloud/connect',
    /** Cloud callback */
    CLOUD_CALLBACK: '/api/v1/workspaces/{workspaceId}/gallery-exports/cloud/callback',
};
// ---------------------------------------------------------------------------
// Error Messages
// ---------------------------------------------------------------------------
/**
 * Export error messages
 */
export const EXPORT_ERROR_MESSAGES = {
    RATE_LIMITED: 'Export rate limit exceeded. Please wait before requesting another export.',
    LIMIT_EXCEEDED: 'Maximum concurrent exports exceeded. Please wait for existing exports to complete.',
    TOO_MANY_ASSETS: 'Too many assets selected for export. Please reduce the selection.',
    CLOUD_NOT_CONNECTED: 'Cloud provider is not connected. Please connect first.',
    EXPORT_NOT_FOUND: 'Export not found.',
    EXPORT_NOT_CANCELLABLE: 'This export cannot be cancelled.',
    EXPORT_NOT_RETRYABLE: 'Only failed exports can be retried.',
    NO_ASSETS: 'No assets found for export.',
    GALLERY_NOT_FOUND: 'Gallery not found.',
    FORMAT_NOT_SUPPORTED: 'Export format is not supported.',
};
// ---------------------------------------------------------------------------
// Consolidated Export
// ---------------------------------------------------------------------------
/**
 * All export constants consolidated
 */
export const EXPORT = {
    RATE_LIMITS: EXPORT_RATE_LIMITS,
    SIZE_LIMITS: EXPORT_SIZE_LIMITS,
    TIMING: EXPORT_TIMING,
    DEFAULT_ZIP_CONFIG,
    DEFAULT_PDF_CONFIG,
    DEFAULT_SLIDESHOW_CONFIG,
    DEFAULT_CLOUD_SYNC_CONFIG,
    RESOLUTION_MAX_DIMENSIONS,
    IMAGE_QUALITY,
    PDF_PAGE_DIMENSIONS,
    PDF_PHOTOS_PER_PAGE,
    SLIDESHOW_DIMENSIONS,
    SLIDESHOW_ASPECT_RATIOS,
    VIDEO_ENCODING,
    CLOUD_OAUTH,
    CLOUD_RATE_LIMITS,
    API_PATHS: EXPORT_API_PATHS,
    ERROR_MESSAGES: EXPORT_ERROR_MESSAGES,
};
