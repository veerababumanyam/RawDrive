/**
 * File Types and Upload Limits
 * Single source of truth for supported file types across frontend and backend
 */
/**
 * Supported image MIME types (standard formats)
 */
export const SUPPORTED_IMAGE_MIME_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    // Standard desktop/web formats
    'image/bmp',
    'image/x-ms-bmp', // Alternative BMP MIME
    'image/tiff',
    'image/tiff-fx', // Alternative TIFF MIME
    'image/gif',
    // Next-gen formats
    'image/avif',
];
/**
 * Supported video MIME types
 */
export const SUPPORTED_VIDEO_MIME_TYPES = [
    'video/mp4',
    'video/mov',
    'video/quicktime',
];
/**
 * RAW file extensions (without leading dot for backend, with dot for frontend accept)
 * Note: RAW files typically have empty MIME types or 'application/octet-stream'
 */
export const SUPPORTED_RAW_EXTENSIONS = [
    'cr2', // Canon Raw 2
    'cr3', // Canon Raw 3
    'nef', // Nikon Electronic Format
    'arw', // Sony Alpha Raw
    'raf', // Fujifilm Raw
    'orf', // Olympus Raw Format
    'rw2', // Panasonic Raw 2
    'dng', // Adobe Digital Negative
    // Additional professional RAW formats
    'pef', // Pentax Electronic File
    'rwl', // Leica Raw
    'srw', // Samsung Raw
    'x3f', // Sigma X3F
    '3fr', // Hasselblad 3FR
];
/**
 * Common MIME types for RAW files (browser-dependent)
 * Note: These are unreliable - always use extension fallback
 */
export const RAW_MIME_TYPES = [
    'image/x-canon-cr2',
    'image/x-canon-cr3',
    'image/x-nikon-nef',
    'image/x-sony-arw',
    'image/x-fuji-raf',
    'image/x-olympus-orf',
    'image/x-panasonic-rw2',
    'image/x-adobe-dng',
    // Additional RAW MIME types
    'image/x-pentax-pef',
    'image/x-leica-rwl',
    'image/x-samsung-srw',
    'image/x-sigma-x3f',
    'image/x-hasselblad-3fr',
    'application/octet-stream', // Generic fallback many browsers use
];
/**
 * File size limits by type (in bytes)
 */
export const FILE_SIZE_LIMITS = {
    PHOTO: 100 * 1024 * 1024, // 100MB for images
    RAW: 200 * 1024 * 1024, // 200MB for RAW files (typically larger)
    VIDEO: 500 * 1024 * 1024, // 500MB for videos
    TIFF: 150 * 1024 * 1024, // 150MB for TIFF (can be large with layers)
    GIF: 50 * 1024 * 1024, // 50MB for GIF (animations)
};
/**
 * Consolidated file types export
 */
export const FILE_TYPES = {
    IMAGE_MIME_TYPES: SUPPORTED_IMAGE_MIME_TYPES,
    VIDEO_MIME_TYPES: SUPPORTED_VIDEO_MIME_TYPES,
    RAW_EXTENSIONS: SUPPORTED_RAW_EXTENSIONS,
    RAW_MIME_TYPES: RAW_MIME_TYPES,
    SIZE_LIMITS: FILE_SIZE_LIMITS,
};
