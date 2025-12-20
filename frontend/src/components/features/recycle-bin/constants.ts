/**
 * Recycle Bin Constants
 * Centralized configuration values for the recycle bin feature
 */

export const RECYCLE_BIN_CONSTANTS = {
    /** TTL for signed thumbnail URLs in seconds (1 hour) */
    THUMBNAIL_TTL_SECONDS: 3600,

    /** Default retention period before permanent deletion (30 days) */
    DEFAULT_RETENTION_DAYS: 30,

    /** Default number of items per page */
    DEFAULT_PAGE_SIZE: 20,

    /** Days remaining threshold for warning status */
    WARNING_THRESHOLD_DAYS: 7,

    /** Days remaining threshold for critical status */
    CRITICAL_THRESHOLD_DAYS: 3,

    /** Minimum zoom level for lightbox */
    ZOOM_MIN: 0.5,

    /** Maximum zoom level for lightbox */
    ZOOM_MAX: 5,

    /** Zoom increment/decrement step */
    ZOOM_STEP: 0.25,
} as const;

export type RecycleBinConstants = typeof RECYCLE_BIN_CONSTANTS;
