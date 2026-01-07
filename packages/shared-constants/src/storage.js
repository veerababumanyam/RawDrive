/**
 * Storage size constants
 */
export const STORAGE = {
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
};
/**
 * File size limits
 */
export const FILE_LIMITS = {
    /** Maximum photo upload size (100MB) */
    MAX_PHOTO_SIZE: 100 * STORAGE.MB,
    /** Maximum video upload size (500MB) */
    MAX_VIDEO_SIZE: 500 * STORAGE.MB,
    /** Maximum document upload size (50MB) */
    MAX_DOCUMENT_SIZE: 50 * STORAGE.MB,
    /** Maximum avatar size (5MB) */
    MAX_AVATAR_SIZE: 5 * STORAGE.MB,
};
/**
 * Storage key prefixes
 */
export const STORAGE_KEYS = {
    WORKSPACE_PREFIX: 'workspaces',
    ASSETS: 'assets',
    AVATARS: 'avatars',
    INVITATIONS: 'invitations',
    THUMBNAILS: 'derived/thumbnails',
    ORIGINALS: 'original',
};
