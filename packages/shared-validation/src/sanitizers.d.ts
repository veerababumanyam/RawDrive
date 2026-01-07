/**
 * Sanitize string for XSS prevention
 * Escapes HTML entities
 */
export declare function sanitizeHtml(input: string): string;
/**
 * Sanitize filename for storage
 * Removes path traversal and special characters
 */
export declare function sanitizeFilename(filename: string): string;
/**
 * Sanitize URL path segment
 */
export declare function sanitizeSlug(input: string): string;
//# sourceMappingURL=sanitizers.d.ts.map