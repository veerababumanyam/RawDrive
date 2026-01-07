/**
 * File Types and Upload Limits
 * Single source of truth for supported file types across frontend and backend
 */
/**
 * Supported image MIME types (standard formats)
 */
export declare const SUPPORTED_IMAGE_MIME_TYPES: readonly ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif", "image/bmp", "image/x-ms-bmp", "image/tiff", "image/tiff-fx", "image/gif", "image/avif"];
/**
 * Supported video MIME types
 */
export declare const SUPPORTED_VIDEO_MIME_TYPES: readonly ["video/mp4", "video/mov", "video/quicktime"];
/**
 * RAW file extensions (without leading dot for backend, with dot for frontend accept)
 * Note: RAW files typically have empty MIME types or 'application/octet-stream'
 */
export declare const SUPPORTED_RAW_EXTENSIONS: readonly ["cr2", "cr3", "nef", "arw", "raf", "orf", "rw2", "dng", "pef", "rwl", "srw", "x3f", "3fr"];
/**
 * Common MIME types for RAW files (browser-dependent)
 * Note: These are unreliable - always use extension fallback
 */
export declare const RAW_MIME_TYPES: readonly ["image/x-canon-cr2", "image/x-canon-cr3", "image/x-nikon-nef", "image/x-sony-arw", "image/x-fuji-raf", "image/x-olympus-orf", "image/x-panasonic-rw2", "image/x-adobe-dng", "image/x-pentax-pef", "image/x-leica-rwl", "image/x-samsung-srw", "image/x-sigma-x3f", "image/x-hasselblad-3fr", "application/octet-stream"];
/**
 * File size limits by type (in bytes)
 */
export declare const FILE_SIZE_LIMITS: {
    readonly PHOTO: number;
    readonly RAW: number;
    readonly VIDEO: number;
    readonly TIFF: number;
    readonly GIF: number;
};
/**
 * Consolidated file types export
 */
export declare const FILE_TYPES: {
    readonly IMAGE_MIME_TYPES: readonly ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif", "image/bmp", "image/x-ms-bmp", "image/tiff", "image/tiff-fx", "image/gif", "image/avif"];
    readonly VIDEO_MIME_TYPES: readonly ["video/mp4", "video/mov", "video/quicktime"];
    readonly RAW_EXTENSIONS: readonly ["cr2", "cr3", "nef", "arw", "raf", "orf", "rw2", "dng", "pef", "rwl", "srw", "x3f", "3fr"];
    readonly RAW_MIME_TYPES: readonly ["image/x-canon-cr2", "image/x-canon-cr3", "image/x-nikon-nef", "image/x-sony-arw", "image/x-fuji-raf", "image/x-olympus-orf", "image/x-panasonic-rw2", "image/x-adobe-dng", "image/x-pentax-pef", "image/x-leica-rwl", "image/x-samsung-srw", "image/x-sigma-x3f", "image/x-hasselblad-3fr", "application/octet-stream"];
    readonly SIZE_LIMITS: {
        readonly PHOTO: number;
        readonly RAW: number;
        readonly VIDEO: number;
        readonly TIFF: number;
        readonly GIF: number;
    };
};
/**
 * Type exports
 */
export type SupportedImageMimeType = typeof SUPPORTED_IMAGE_MIME_TYPES[number];
export type SupportedVideoMimeType = typeof SUPPORTED_VIDEO_MIME_TYPES[number];
export type SupportedRawExtension = typeof SUPPORTED_RAW_EXTENSIONS[number];
export type RawMimeType = typeof RAW_MIME_TYPES[number];
//# sourceMappingURL=file-types.d.ts.map