/**
 * Validation regex patterns
 */
export declare const PATTERNS: {
    /** Hex color: #RGB or #RRGGBB */
    readonly HEX_COLOR: RegExp;
    /** UUID v4 format */
    readonly UUID_V4: RegExp;
    /** Email format (RFC 5322 simplified) */
    readonly EMAIL: RegExp;
    /** Phone number (international format) */
    readonly PHONE: RegExp;
    /** URL (http/https) */
    readonly URL: RegExp;
    /** Slug (lowercase alphanumeric with hyphens) */
    readonly SLUG: RegExp;
};
/**
 * Validate hex color
 */
export declare function isValidHexColor(value: string): boolean;
/**
 * Validate UUID v4
 */
export declare function isValidUUID(value: string): boolean;
/**
 * Validate email
 */
export declare function isValidEmail(value: string): boolean;
//# sourceMappingURL=patterns.d.ts.map