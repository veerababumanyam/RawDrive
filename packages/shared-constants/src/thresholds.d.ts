/**
 * AI/ML thresholds
 */
export declare const AI_THRESHOLDS: {
    /** Minimum confidence for face detection (0-1) */
    readonly FACE_DETECTION_CONFIDENCE: 0.7;
    /** Minimum similarity for face clustering (0-1) */
    readonly FACE_CLUSTERING_SIMILARITY: 0.6;
    /** Minimum confidence for auto-tagging (0-1) */
    readonly AUTO_TAG_CONFIDENCE: 0.8;
};
/**
 * Pagination defaults
 */
export declare const PAGINATION: {
    readonly DEFAULT_PAGE: 1;
    readonly DEFAULT_LIMIT: 20;
    readonly MAX_LIMIT: 100;
};
/**
 * Rate limiting
 */
export declare const RATE_LIMITS: {
    /** API requests per minute */
    readonly API_REQUESTS_PER_MINUTE: 100;
    /** Auth attempts per 15 minutes */
    readonly AUTH_ATTEMPTS_PER_15_MIN: 5;
    /** Uploads per hour per workspace */
    readonly UPLOADS_PER_HOUR: 1000;
    /** AI operations per minute per workspace */
    readonly AI_OPS_PER_MINUTE: 30;
};
//# sourceMappingURL=thresholds.d.ts.map