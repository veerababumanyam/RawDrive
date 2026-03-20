/**
 * ExpirationCountdown Component
 * Shows a countdown pill for galleries with expiration dates.
 * Urgency styling increases as the deadline approaches.
 */
import React from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

export interface ExpirationCountdownProps {
  /** Number of days until gallery expires (null = no expiration) */
  daysUntilExpiry: number | null;
  /** ISO date string of when the gallery expires (null = no expiration) */
  expiresAt: string | null;
}

function getExpirationConfig(days: number): {
  text: string;
  className: string;
  icon: 'clock' | 'alert';
} {
  if (days === 0) {
    return {
      text: 'Expires today!',
      className: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
      icon: 'alert',
    };
  }
  if (days === 1) {
    return {
      text: 'Expires tomorrow!',
      className: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
      icon: 'alert',
    };
  }
  if (days <= 3) {
    return {
      text: `Expires in ${days} days!`,
      className: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
      icon: 'alert',
    };
  }
  if (days <= 7) {
    return {
      text: `Expires in ${days} days - download your photos`,
      className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
      icon: 'alert',
    };
  }
  // > 7 days: subtle
  const expiresDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return {
    text: `Expires ${expiresDate.toLocaleDateString()}`,
    className: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
    icon: 'clock',
  };
}

export const ExpirationCountdown: React.FC<ExpirationCountdownProps> = ({
  daysUntilExpiry,
  expiresAt,
}) => {
  if (daysUntilExpiry === null && expiresAt === null) {
    return null;
  }

  // If we have expiresAt but not daysUntilExpiry, compute it
  let days = daysUntilExpiry;
  if (days === null && expiresAt) {
    const diff = new Date(expiresAt).getTime() - Date.now();
    days = Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }
  if (days === null) return null;

  const config = getExpirationConfig(days);
  const IconComponent = config.icon === 'alert' ? AlertTriangle : Clock;

  return (
    <div
      data-testid="expiration-pill"
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium ${config.className}`}
    >
      <IconComponent size={14} />
      <span>{config.text}</span>
    </div>
  );
};
