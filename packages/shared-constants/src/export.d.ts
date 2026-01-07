/**
 * Gallery Export Constants
 *
 * Constants for multi-format gallery export functionality.
 */
export { ExportFormat, ExportStatus, PDFLayoutStyle, PDFPageSize, SlideshowTransition, SlideshowQuality, ImageResolution, CloudSyncItemStatus, } from '@rawdrive/shared-types';
/**
 * Export rate limiting configuration
 */
export declare const EXPORT_RATE_LIMITS: {
    /** Minimum seconds between export requests for same gallery */
    readonly PER_GALLERY_COOLDOWN_SECONDS: 300;
    /** Maximum concurrent exports per workspace */
    readonly MAX_CONCURRENT_PER_WORKSPACE: 5;
    /** Maximum exports per gallery per day */
    readonly MAX_PER_GALLERY_PER_DAY: 10;
};
/**
 * Export size limits
 */
export declare const EXPORT_SIZE_LIMITS: {
    /** Maximum assets per single export */
    readonly MAX_ASSETS_PER_EXPORT: 10000;
    /** Maximum ZIP file size in bytes (10GB) */
    readonly MAX_ZIP_SIZE_BYTES: number;
    /** Maximum PDF file size in bytes (500MB) */
    readonly MAX_PDF_SIZE_BYTES: number;
    /** Maximum slideshow video size in bytes (2GB) */
    readonly MAX_SLIDESHOW_SIZE_BYTES: number;
};
/**
 * Export timing configuration
 */
export declare const EXPORT_TIMING: {
    /** Download URL expiry in hours */
    readonly DOWNLOAD_EXPIRY_HOURS: 72;
    /** Worker poll interval in seconds */
    readonly WORKER_POLL_INTERVAL_SECONDS: 5;
    /** Export job timeout in minutes */
    readonly JOB_TIMEOUT_MINUTES: 60;
    /** Frontend progress poll interval in milliseconds */
    readonly PROGRESS_POLL_INTERVAL_MS: 2000;
};
/**
 * Default ZIP export configuration
 */
export declare const DEFAULT_ZIP_CONFIG: {
    readonly resolution: "original";
    readonly includeMetadata: false;
    readonly preserveOriginalFilenames: true;
    readonly flattenStructure: false;
    readonly includeSubGalleryFolders: true;
};
/**
 * Default PDF album configuration
 */
export declare const DEFAULT_PDF_CONFIG: {
    readonly layoutStyle: "classic";
    readonly pageSize: "a4";
    readonly orientation: "portrait";
    readonly includeTitle: true;
    readonly includeCover: true;
    readonly includeTableOfContents: false;
    readonly includePageNumbers: true;
    readonly includeExifData: false;
    readonly includeDateTaken: false;
    readonly photoBorder: false;
    readonly photoBorderWidth: 2;
    readonly backgroundColor: "#ffffff";
    readonly fontFamily: "Helvetica";
    readonly quality: "print";
};
/**
 * Default slideshow configuration
 */
export declare const DEFAULT_SLIDESHOW_CONFIG: {
    readonly transition: "fade";
    readonly transitionDuration: 500;
    readonly displayDuration: 3000;
    readonly quality: "1080p";
    readonly aspectRatio: "16:9";
    readonly includeAudio: false;
    readonly audioFadeIn: true;
    readonly audioFadeOut: true;
    readonly loopAudio: true;
    readonly includeTitleSlide: true;
    readonly includeEndSlide: true;
    readonly backgroundColor: "#000000";
};
/**
 * Default cloud sync configuration
 */
export declare const DEFAULT_CLOUD_SYNC_CONFIG: {
    readonly createAlbum: true;
    readonly resolution: "high";
    readonly syncSubGalleries: true;
    readonly overwriteExisting: false;
};
/**
 * Image resolution max dimensions (longest edge)
 */
export declare const RESOLUTION_MAX_DIMENSIONS: {
    readonly original: number;
    readonly high: 4000;
    readonly web: 2048;
    readonly preview: 1200;
    readonly thumbnail: 400;
};
/**
 * Image quality settings by output type
 */
export declare const IMAGE_QUALITY: {
    /** JPEG quality (0-100) */
    readonly JPEG_PRINT: 95;
    readonly JPEG_WEB: 85;
    readonly JPEG_PREVIEW: 75;
    /** WebP quality (0-100) */
    readonly WEBP_QUALITY: 85;
    /** PNG compression (0-9) */
    readonly PNG_COMPRESSION: 6;
};
/**
 * PDF page dimensions in points (72 points = 1 inch)
 */
export declare const PDF_PAGE_DIMENSIONS: {
    readonly a4: {
        readonly width: 595;
        readonly height: 842;
    };
    readonly a3: {
        readonly width: 842;
        readonly height: 1191;
    };
    readonly letter: {
        readonly width: 612;
        readonly height: 792;
    };
    readonly legal: {
        readonly width: 612;
        readonly height: 1008;
    };
    readonly square_8x8: {
        readonly width: 576;
        readonly height: 576;
    };
    readonly square_10x10: {
        readonly width: 720;
        readonly height: 720;
    };
    readonly square_12x12: {
        readonly width: 864;
        readonly height: 864;
    };
};
/**
 * PDF layout photos per page
 */
export declare const PDF_PHOTOS_PER_PAGE: {
    readonly single_photo: 1;
    readonly two_column: 2;
    readonly three_column: 3;
    readonly collage: 4;
    readonly magazine: 3;
    readonly classic: 1;
};
/**
 * Slideshow video dimensions by quality
 */
export declare const SLIDESHOW_DIMENSIONS: {
    readonly '480p': {
        readonly width: 854;
        readonly height: 480;
    };
    readonly '720p': {
        readonly width: 1280;
        readonly height: 720;
    };
    readonly '1080p': {
        readonly width: 1920;
        readonly height: 1080;
    };
    readonly '4k': {
        readonly width: 3840;
        readonly height: 2160;
    };
};
/**
 * Slideshow aspect ratio dimensions
 */
export declare const SLIDESHOW_ASPECT_RATIOS: {
    readonly '16:9': {
        readonly width: 16;
        readonly height: 9;
    };
    readonly '4:3': {
        readonly width: 4;
        readonly height: 3;
    };
    readonly '1:1': {
        readonly width: 1;
        readonly height: 1;
    };
    readonly '9:16': {
        readonly width: 9;
        readonly height: 16;
    };
};
/**
 * Video encoding settings
 */
export declare const VIDEO_ENCODING: {
    /** Video bitrate by quality (kbps) */
    readonly BITRATE: {
        readonly '480p': 2500;
        readonly '720p': 5000;
        readonly '1080p': 8000;
        readonly '4k': 20000;
    };
    /** Frames per second */
    readonly FPS: 30;
    /** H.264 profile */
    readonly PROFILE: "high";
    /** H.264 preset */
    readonly PRESET: "medium";
};
/**
 * Cloud provider OAuth configuration
 */
export declare const CLOUD_OAUTH: {
    readonly google_photos: {
        readonly scopes: readonly ["https://www.googleapis.com/auth/photoslibrary", "https://www.googleapis.com/auth/photoslibrary.appendonly"];
        readonly authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth";
        readonly tokenEndpoint: "https://oauth2.googleapis.com/token";
    };
    readonly amazon_photos: {
        readonly scopes: readonly ["clouddrive:read_all", "clouddrive:write"];
        readonly authEndpoint: "https://www.amazon.com/ap/oa";
        readonly tokenEndpoint: "https://api.amazon.com/auth/o2/token";
    };
    readonly dropbox: {
        readonly scopes: readonly ["files.content.write", "files.content.read"];
        readonly authEndpoint: "https://www.dropbox.com/oauth2/authorize";
        readonly tokenEndpoint: "https://api.dropboxapi.com/oauth2/token";
    };
};
/**
 * Cloud provider rate limits
 */
export declare const CLOUD_RATE_LIMITS: {
    readonly google_photos: {
        readonly uploadsPerDay: 10000;
        readonly maxFileSizeMB: 200;
    };
    readonly amazon_photos: {
        readonly uploadsPerDay: 5000;
        readonly maxFileSizeMB: 2048;
    };
    readonly dropbox: {
        readonly uploadsPerDay: 100000;
        readonly maxFileSizeMB: 350;
    };
};
/**
 * Export API paths
 */
export declare const EXPORT_API_PATHS: {
    /** Base path for export endpoints */
    readonly BASE: "/api/v1/workspaces/{workspaceId}/gallery-exports";
    /** Create export for gallery */
    readonly CREATE: "/api/v1/workspaces/{workspaceId}/gallery-exports/galleries/{galleryId}";
    /** List exports for gallery */
    readonly LIST_GALLERY: "/api/v1/workspaces/{workspaceId}/gallery-exports/galleries/{galleryId}";
    /** Get export by ID */
    readonly GET: "/api/v1/workspaces/{workspaceId}/gallery-exports/{exportId}";
    /** Cancel export */
    readonly CANCEL: "/api/v1/workspaces/{workspaceId}/gallery-exports/{exportId}/cancel";
    /** Retry export */
    readonly RETRY: "/api/v1/workspaces/{workspaceId}/gallery-exports/{exportId}/retry";
    /** Batch export */
    readonly BATCH: "/api/v1/workspaces/{workspaceId}/gallery-exports/batch";
    /** Export stats */
    readonly STATS: "/api/v1/workspaces/{workspaceId}/gallery-exports/stats";
    /** Cloud connections */
    readonly CLOUD_CONNECTIONS: "/api/v1/workspaces/{workspaceId}/gallery-exports/cloud/connections";
    /** Connect cloud provider */
    readonly CLOUD_CONNECT: "/api/v1/workspaces/{workspaceId}/gallery-exports/cloud/connect";
    /** Cloud callback */
    readonly CLOUD_CALLBACK: "/api/v1/workspaces/{workspaceId}/gallery-exports/cloud/callback";
};
/**
 * Export error messages
 */
export declare const EXPORT_ERROR_MESSAGES: {
    readonly RATE_LIMITED: "Export rate limit exceeded. Please wait before requesting another export.";
    readonly LIMIT_EXCEEDED: "Maximum concurrent exports exceeded. Please wait for existing exports to complete.";
    readonly TOO_MANY_ASSETS: "Too many assets selected for export. Please reduce the selection.";
    readonly CLOUD_NOT_CONNECTED: "Cloud provider is not connected. Please connect first.";
    readonly EXPORT_NOT_FOUND: "Export not found.";
    readonly EXPORT_NOT_CANCELLABLE: "This export cannot be cancelled.";
    readonly EXPORT_NOT_RETRYABLE: "Only failed exports can be retried.";
    readonly NO_ASSETS: "No assets found for export.";
    readonly GALLERY_NOT_FOUND: "Gallery not found.";
    readonly FORMAT_NOT_SUPPORTED: "Export format is not supported.";
};
/**
 * All export constants consolidated
 */
export declare const EXPORT: {
    readonly RATE_LIMITS: {
        /** Minimum seconds between export requests for same gallery */
        readonly PER_GALLERY_COOLDOWN_SECONDS: 300;
        /** Maximum concurrent exports per workspace */
        readonly MAX_CONCURRENT_PER_WORKSPACE: 5;
        /** Maximum exports per gallery per day */
        readonly MAX_PER_GALLERY_PER_DAY: 10;
    };
    readonly SIZE_LIMITS: {
        /** Maximum assets per single export */
        readonly MAX_ASSETS_PER_EXPORT: 10000;
        /** Maximum ZIP file size in bytes (10GB) */
        readonly MAX_ZIP_SIZE_BYTES: number;
        /** Maximum PDF file size in bytes (500MB) */
        readonly MAX_PDF_SIZE_BYTES: number;
        /** Maximum slideshow video size in bytes (2GB) */
        readonly MAX_SLIDESHOW_SIZE_BYTES: number;
    };
    readonly TIMING: {
        /** Download URL expiry in hours */
        readonly DOWNLOAD_EXPIRY_HOURS: 72;
        /** Worker poll interval in seconds */
        readonly WORKER_POLL_INTERVAL_SECONDS: 5;
        /** Export job timeout in minutes */
        readonly JOB_TIMEOUT_MINUTES: 60;
        /** Frontend progress poll interval in milliseconds */
        readonly PROGRESS_POLL_INTERVAL_MS: 2000;
    };
    readonly DEFAULT_ZIP_CONFIG: {
        readonly resolution: "original";
        readonly includeMetadata: false;
        readonly preserveOriginalFilenames: true;
        readonly flattenStructure: false;
        readonly includeSubGalleryFolders: true;
    };
    readonly DEFAULT_PDF_CONFIG: {
        readonly layoutStyle: "classic";
        readonly pageSize: "a4";
        readonly orientation: "portrait";
        readonly includeTitle: true;
        readonly includeCover: true;
        readonly includeTableOfContents: false;
        readonly includePageNumbers: true;
        readonly includeExifData: false;
        readonly includeDateTaken: false;
        readonly photoBorder: false;
        readonly photoBorderWidth: 2;
        readonly backgroundColor: "#ffffff";
        readonly fontFamily: "Helvetica";
        readonly quality: "print";
    };
    readonly DEFAULT_SLIDESHOW_CONFIG: {
        readonly transition: "fade";
        readonly transitionDuration: 500;
        readonly displayDuration: 3000;
        readonly quality: "1080p";
        readonly aspectRatio: "16:9";
        readonly includeAudio: false;
        readonly audioFadeIn: true;
        readonly audioFadeOut: true;
        readonly loopAudio: true;
        readonly includeTitleSlide: true;
        readonly includeEndSlide: true;
        readonly backgroundColor: "#000000";
    };
    readonly DEFAULT_CLOUD_SYNC_CONFIG: {
        readonly createAlbum: true;
        readonly resolution: "high";
        readonly syncSubGalleries: true;
        readonly overwriteExisting: false;
    };
    readonly RESOLUTION_MAX_DIMENSIONS: {
        readonly original: number;
        readonly high: 4000;
        readonly web: 2048;
        readonly preview: 1200;
        readonly thumbnail: 400;
    };
    readonly IMAGE_QUALITY: {
        /** JPEG quality (0-100) */
        readonly JPEG_PRINT: 95;
        readonly JPEG_WEB: 85;
        readonly JPEG_PREVIEW: 75;
        /** WebP quality (0-100) */
        readonly WEBP_QUALITY: 85;
        /** PNG compression (0-9) */
        readonly PNG_COMPRESSION: 6;
    };
    readonly PDF_PAGE_DIMENSIONS: {
        readonly a4: {
            readonly width: 595;
            readonly height: 842;
        };
        readonly a3: {
            readonly width: 842;
            readonly height: 1191;
        };
        readonly letter: {
            readonly width: 612;
            readonly height: 792;
        };
        readonly legal: {
            readonly width: 612;
            readonly height: 1008;
        };
        readonly square_8x8: {
            readonly width: 576;
            readonly height: 576;
        };
        readonly square_10x10: {
            readonly width: 720;
            readonly height: 720;
        };
        readonly square_12x12: {
            readonly width: 864;
            readonly height: 864;
        };
    };
    readonly PDF_PHOTOS_PER_PAGE: {
        readonly single_photo: 1;
        readonly two_column: 2;
        readonly three_column: 3;
        readonly collage: 4;
        readonly magazine: 3;
        readonly classic: 1;
    };
    readonly SLIDESHOW_DIMENSIONS: {
        readonly '480p': {
            readonly width: 854;
            readonly height: 480;
        };
        readonly '720p': {
            readonly width: 1280;
            readonly height: 720;
        };
        readonly '1080p': {
            readonly width: 1920;
            readonly height: 1080;
        };
        readonly '4k': {
            readonly width: 3840;
            readonly height: 2160;
        };
    };
    readonly SLIDESHOW_ASPECT_RATIOS: {
        readonly '16:9': {
            readonly width: 16;
            readonly height: 9;
        };
        readonly '4:3': {
            readonly width: 4;
            readonly height: 3;
        };
        readonly '1:1': {
            readonly width: 1;
            readonly height: 1;
        };
        readonly '9:16': {
            readonly width: 9;
            readonly height: 16;
        };
    };
    readonly VIDEO_ENCODING: {
        /** Video bitrate by quality (kbps) */
        readonly BITRATE: {
            readonly '480p': 2500;
            readonly '720p': 5000;
            readonly '1080p': 8000;
            readonly '4k': 20000;
        };
        /** Frames per second */
        readonly FPS: 30;
        /** H.264 profile */
        readonly PROFILE: "high";
        /** H.264 preset */
        readonly PRESET: "medium";
    };
    readonly CLOUD_OAUTH: {
        readonly google_photos: {
            readonly scopes: readonly ["https://www.googleapis.com/auth/photoslibrary", "https://www.googleapis.com/auth/photoslibrary.appendonly"];
            readonly authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth";
            readonly tokenEndpoint: "https://oauth2.googleapis.com/token";
        };
        readonly amazon_photos: {
            readonly scopes: readonly ["clouddrive:read_all", "clouddrive:write"];
            readonly authEndpoint: "https://www.amazon.com/ap/oa";
            readonly tokenEndpoint: "https://api.amazon.com/auth/o2/token";
        };
        readonly dropbox: {
            readonly scopes: readonly ["files.content.write", "files.content.read"];
            readonly authEndpoint: "https://www.dropbox.com/oauth2/authorize";
            readonly tokenEndpoint: "https://api.dropboxapi.com/oauth2/token";
        };
    };
    readonly CLOUD_RATE_LIMITS: {
        readonly google_photos: {
            readonly uploadsPerDay: 10000;
            readonly maxFileSizeMB: 200;
        };
        readonly amazon_photos: {
            readonly uploadsPerDay: 5000;
            readonly maxFileSizeMB: 2048;
        };
        readonly dropbox: {
            readonly uploadsPerDay: 100000;
            readonly maxFileSizeMB: 350;
        };
    };
    readonly API_PATHS: {
        /** Base path for export endpoints */
        readonly BASE: "/api/v1/workspaces/{workspaceId}/gallery-exports";
        /** Create export for gallery */
        readonly CREATE: "/api/v1/workspaces/{workspaceId}/gallery-exports/galleries/{galleryId}";
        /** List exports for gallery */
        readonly LIST_GALLERY: "/api/v1/workspaces/{workspaceId}/gallery-exports/galleries/{galleryId}";
        /** Get export by ID */
        readonly GET: "/api/v1/workspaces/{workspaceId}/gallery-exports/{exportId}";
        /** Cancel export */
        readonly CANCEL: "/api/v1/workspaces/{workspaceId}/gallery-exports/{exportId}/cancel";
        /** Retry export */
        readonly RETRY: "/api/v1/workspaces/{workspaceId}/gallery-exports/{exportId}/retry";
        /** Batch export */
        readonly BATCH: "/api/v1/workspaces/{workspaceId}/gallery-exports/batch";
        /** Export stats */
        readonly STATS: "/api/v1/workspaces/{workspaceId}/gallery-exports/stats";
        /** Cloud connections */
        readonly CLOUD_CONNECTIONS: "/api/v1/workspaces/{workspaceId}/gallery-exports/cloud/connections";
        /** Connect cloud provider */
        readonly CLOUD_CONNECT: "/api/v1/workspaces/{workspaceId}/gallery-exports/cloud/connect";
        /** Cloud callback */
        readonly CLOUD_CALLBACK: "/api/v1/workspaces/{workspaceId}/gallery-exports/cloud/callback";
    };
    readonly ERROR_MESSAGES: {
        readonly RATE_LIMITED: "Export rate limit exceeded. Please wait before requesting another export.";
        readonly LIMIT_EXCEEDED: "Maximum concurrent exports exceeded. Please wait for existing exports to complete.";
        readonly TOO_MANY_ASSETS: "Too many assets selected for export. Please reduce the selection.";
        readonly CLOUD_NOT_CONNECTED: "Cloud provider is not connected. Please connect first.";
        readonly EXPORT_NOT_FOUND: "Export not found.";
        readonly EXPORT_NOT_CANCELLABLE: "This export cannot be cancelled.";
        readonly EXPORT_NOT_RETRYABLE: "Only failed exports can be retried.";
        readonly NO_ASSETS: "No assets found for export.";
        readonly GALLERY_NOT_FOUND: "Gallery not found.";
        readonly FORMAT_NOT_SUPPORTED: "Export format is not supported.";
    };
};
//# sourceMappingURL=export.d.ts.map