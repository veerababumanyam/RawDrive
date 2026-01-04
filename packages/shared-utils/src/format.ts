import { STORAGE } from '@rawdrive/shared-constants';

/**
 * Format bytes as human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes < STORAGE.KB) return `${bytes} B`;
  if (bytes < STORAGE.MB) return `${(bytes / STORAGE.KB).toFixed(1)} KB`;
  if (bytes < STORAGE.GB) return `${(bytes / STORAGE.MB).toFixed(1)} MB`;
  if (bytes < STORAGE.TB) return `${(bytes / STORAGE.GB).toFixed(2)} GB`;
  return `${(bytes / STORAGE.TB).toFixed(2)} TB`;
}

/**
 * Format number with thousands separators
 */
export function formatNumber(num: number, locale: string = 'en-US'): string {
  return num.toLocaleString(locale);
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.substring(0, maxLength - 3)}...`;
}
