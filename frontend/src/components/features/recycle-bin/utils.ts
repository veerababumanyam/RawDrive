/**
 * Recycle Bin Utilities
 * Shared helper functions for the recycle bin feature
 */

import type { RecycleBinItem } from '../../../types/recycleBin';

// Use VITE_API_URL if set (even if empty string for relative URLs), otherwise default to localhost for dev
const API_BASE_URL = import.meta.env.VITE_API_URL !== undefined
  ? import.meta.env.VITE_API_URL
  : 'http://localhost:8000';

/**
 * Build a full asset URL from a thumbnail URL
 * Handles both absolute URLs and relative paths
 */
export function buildAssetUrl(thumbnailUrl: string | undefined | null): string | null {
    if (!thumbnailUrl) return null;
    if (thumbnailUrl.startsWith('http')) return thumbnailUrl;
    return `${API_BASE_URL}${thumbnailUrl}`;
}

/**
 * Determine the type of items in a collection
 * Returns 'galleries' if all items are galleries,
 * 'photos' if all are photos, or 'mixed' otherwise
 */
export function determineItemType(
    items: RecycleBinItem[]
): 'galleries' | 'photos' | 'mixed' {
    if (items.length === 0) return 'mixed';

    const hasGalleries = items.some(item => item.type === 'gallery');
    const hasPhotos = items.some(item => item.type === 'photo');

    if (hasGalleries && !hasPhotos) return 'galleries';
    if (hasPhotos && !hasGalleries) return 'photos';
    return 'mixed';
}

/**
 * Format days until permanent deletion as a human-readable string
 */
export function formatDaysRemaining(days: number): string {
    if (days <= 0) return 'Pending deletion';
    if (days === 1) return '1 day left';
    return `${days} days left`;
}

/**
 * Determine warning level based on days remaining and delete status
 */
export function getWarningLevel(
    daysRemaining: number,
    deleteStatus?: string
): 'failed' | 'critical' | 'warning' | 'normal' {
    if (deleteStatus === 'delete_failed') return 'failed';
    if (daysRemaining <= 3) return 'critical';
    if (daysRemaining <= 7) return 'warning';
    return 'normal';
}
