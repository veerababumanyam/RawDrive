/**
 * Date Utilities
 * Helper functions for date formatting and manipulation
 */

import {
  formatDateISO as sharedFormatDateISO,
  formatDateTime as sharedFormatDateTime,
  formatRelativeDate as sharedFormatRelativeDate,
} from '@rawdrive/shared-utils';

/**
 * @deprecated Prefer importing directly from @rawdrive/shared-utils.
 * These exports alias the shared package for backward compatibility.
 */
export const formatRelativeDate = sharedFormatRelativeDate;
export const formatDateISO = sharedFormatDateISO;
export const formatDateTime = sharedFormatDateTime;

/**
 * Format a date to a localized string
 * @param dateString ISO date string
 * @param options Intl.DateTimeFormatOptions
 * @returns Formatted date string
 */
export function formatDate(
  dateString: string,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', options);
}

/**
 * Check if a date is in the past
 * @param dateString ISO date string
 * @returns true if date is in the past
 */
export function isPastDate(dateString: string): boolean {
  const date = new Date(dateString);
  return date < new Date();
}

/**
 * Check if a date is today
 * @param dateString ISO date string
 * @returns true if date is today
 */
export function isToday(dateString: string): boolean {
  const date = new Date(dateString);
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/**
 * Get time until a date in human-readable format
 * @param dateString ISO date string
 * @returns Formatted time until string (e.g., "in 2 days", "in 3 hours")
 */
export function getTimeUntil(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((date.getTime() - now.getTime()) / 1000);

  if (diffInSeconds < 0) {
    return 'passed';
  }

  if (diffInSeconds < 60) {
    return 'starting soon';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `in ${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''}`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `in ${diffInHours} hour${diffInHours !== 1 ? 's' : ''}`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) {
    return 'tomorrow';
  }
  if (diffInDays < 7) {
    return `in ${diffInDays} days`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `in ${diffInWeeks} week${diffInWeeks !== 1 ? 's' : ''}`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  return `in ${diffInMonths} month${diffInMonths !== 1 ? 's' : ''}`;
}
