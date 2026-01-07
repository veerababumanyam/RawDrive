/**
 * Validation regex patterns
 */
export const PATTERNS = {
    /** Hex color: #RGB or #RRGGBB */
    HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
    /** UUID v4 format */
    UUID_V4: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    /** Email format (RFC 5322 simplified) */
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    /** Phone number (international format) */
    PHONE: /^\+?[1-9]\d{1,14}$/,
    /** URL (http/https) */
    URL: /^https?:\/\/[^\s/$.?#].[^\s]*$/i,
    /** Slug (lowercase alphanumeric with hyphens) */
    SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
};
/**
 * Validate hex color
 */
export function isValidHexColor(value) {
    return PATTERNS.HEX_COLOR.test(value);
}
/**
 * Validate UUID v4
 */
export function isValidUUID(value) {
    return PATTERNS.UUID_V4.test(value);
}
/**
 * Validate email
 */
export function isValidEmail(value) {
    return PATTERNS.EMAIL.test(value);
}
