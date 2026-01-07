/**
 * Format a date as relative time (e.g., "2 hours ago")
 */
export function formatRelativeDate(date) {
    const now = Date.now();
    const timestamp = new Date(date).getTime();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
    if (years > 0)
        return `${years} year${years > 1 ? 's' : ''} ago`;
    if (months > 0)
        return `${months} month${months > 1 ? 's' : ''} ago`;
    if (days > 0)
        return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0)
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0)
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
}
/**
 * Format date as ISO string (YYYY-MM-DD)
 */
export function formatDateISO(date) {
    return new Date(date).toISOString().split('T')[0];
}
/**
 * Format date with time (locale-aware)
 */
export function formatDateTime(date, locale = 'en-US') {
    return new Date(date).toLocaleString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
