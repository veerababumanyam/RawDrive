/**
 * Storage size constants
 */
export declare const STORAGE: {
    readonly KB: 1024;
    readonly MB: number;
    readonly GB: number;
    readonly TB: number;
};
/**
 * File size limits
 */
export declare const FILE_LIMITS: {
    /** Maximum photo upload size (100MB) */
    readonly MAX_PHOTO_SIZE: number;
    /** Maximum video upload size (500MB) */
    readonly MAX_VIDEO_SIZE: number;
    /** Maximum document upload size (50MB) */
    readonly MAX_DOCUMENT_SIZE: number;
    /** Maximum avatar size (5MB) */
    readonly MAX_AVATAR_SIZE: number;
};
/**
 * Storage key prefixes
 */
export declare const STORAGE_KEYS: {
    readonly WORKSPACE_PREFIX: "workspaces";
    readonly ASSETS: "assets";
    readonly AVATARS: "avatars";
    readonly INVITATIONS: "invitations";
    readonly THUMBNAILS: "derived/thumbnails";
    readonly ORIGINALS: "original";
};
//# sourceMappingURL=storage.d.ts.map