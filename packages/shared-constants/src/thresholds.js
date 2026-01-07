/**
 * AI/ML thresholds
 */
export const AI_THRESHOLDS = {
    /** Minimum confidence for face detection (0-1) */
    FACE_DETECTION_CONFIDENCE: 0.7,
    /** Minimum similarity for face clustering (0-1) */
    FACE_CLUSTERING_SIMILARITY: 0.6,
    /** Minimum confidence for auto-tagging (0-1) */
    AUTO_TAG_CONFIDENCE: 0.8,
};
/**
 * Pagination defaults
 */
export const PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
};
/**
 * Rate limiting
 */
export const RATE_LIMITS = {
    /** API requests per minute */
    API_REQUESTS_PER_MINUTE: 100,
    /** Auth attempts per 15 minutes */
    AUTH_ATTEMPTS_PER_15_MIN: 5,
    /** Uploads per hour per workspace */
    UPLOADS_PER_HOUR: 1000,
    /** AI operations per minute per workspace */
    AI_OPS_PER_MINUTE: 30,
};
