/**
 * Sanitize string for XSS prevention
 * Escapes HTML entities
 */
export function sanitizeHtml(input) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
    };
    return input.replace(/[&<>"'/]/g, (char) => map[char]);
}
/**
 * Sanitize filename for storage
 * Removes path traversal and special characters
 */
export function sanitizeFilename(filename) {
    return filename
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/\.{2,}/g, '.')
        .substring(0, 255);
}
/**
 * Sanitize URL path segment
 */
export function sanitizeSlug(input) {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}
