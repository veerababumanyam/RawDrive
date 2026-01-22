/**
 * DownloadQuotaIndicator - Shows remaining downloads and quota status
 *
 * Feature: 027-gallery-feature-completion
 * User Story: US2 - Daily Download Limits
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Clock, AlertCircle } from 'lucide-react';

export interface DownloadQuotaState {
  /** Daily download limit (null = unlimited) */
  dailyLimit: number | null;
  /** Current download count today */
  currentUsage: number;
  /** Remaining downloads (null = unlimited) */
  remaining: number | null;
  /** When the quota resets (midnight UTC) */
  resetAt: Date | null;
  /** Whether user is currently blocked */
  isBlocked: boolean;
}

interface DownloadQuotaIndicatorProps {
  quota: DownloadQuotaState;
  className?: string;
  /** Compact mode for inline display */
  compact?: boolean;
}

/**
 * Format time remaining until reset
 */
function formatTimeRemaining(resetAt: Date): string {
  const now = new Date();
  const diff = resetAt.getTime() - now.getTime();

  if (diff <= 0) return 'now';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function DownloadQuotaIndicator({
  quota,
  className = '',
  compact = false,
}: DownloadQuotaIndicatorProps) {
  const { t } = useTranslation('gallery');

  // Calculate derived state before early return (hooks must be called unconditionally)
  const hasLimit = quota.dailyLimit !== null && quota.dailyLimit > 0;
  const isLow = quota.remaining !== null && quota.remaining <= 3 && quota.remaining > 0;
  const isBlocked = quota.isBlocked || (quota.remaining !== null && quota.remaining <= 0);

  const statusColor = useMemo(() => {
    if (isBlocked) return 'text-red-600 dark:text-red-400';
    if (isLow) return 'text-amber-600 dark:text-amber-400';
    return 'text-gray-600 dark:text-gray-400';
  }, [isBlocked, isLow]);

  const bgColor = useMemo(() => {
    if (isBlocked) return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
    if (isLow) return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
    return 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700';
  }, [isBlocked, isLow]);

  // Don't show anything if there's no limit
  if (!hasLimit) {
    return null;
  }

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1.5 ${statusColor} ${className}`}>
        <Download size={14} />
        <span className="text-sm font-medium">
          {quota.remaining ?? '∞'}/{quota.dailyLimit}
        </span>
        {isBlocked && quota.resetAt && (
          <span className="text-xs opacity-75">
            ({formatTimeRemaining(quota.resetAt)})
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-3 ${bgColor} ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isBlocked ? (
            <AlertCircle size={18} className={statusColor} />
          ) : (
            <Download size={18} className={statusColor} />
          )}
          <div>
            <p className={`text-sm font-medium ${statusColor}`}>
              {isBlocked
                ? t('download.limitReached', 'Daily limit reached')
                : t('download.remaining', 'Downloads remaining')}
            </p>
            {!isBlocked && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {quota.remaining} of {quota.dailyLimit} today
              </p>
            )}
          </div>
        </div>

        {quota.resetAt && (
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <Clock size={12} />
            <span>
              {isBlocked
                ? t('download.resetsIn', 'Resets in {{time}}', { time: formatTimeRemaining(quota.resetAt) })
                : t('download.resetsAt', 'Resets at midnight UTC')}
            </span>
          </div>
        )}
      </div>

      {isBlocked && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          {t('download.limitMessage', "You've reached today's download limit. Please try again tomorrow.")}
        </p>
      )}
    </div>
  );
}

/**
 * Hook to manage download quota state
 */
export function useDownloadQuota(galleryId: string | null, dailyLimit: number | null) {
  // This would typically fetch from API and cache in state
  // For now, return a default state that can be updated
  const defaultState: DownloadQuotaState = {
    dailyLimit,
    currentUsage: 0,
    remaining: dailyLimit,
    resetAt: null,
    isBlocked: false,
  };

  return defaultState;
}

/**
 * Parse 429 error response to get quota details
 */
export function parseQuotaError(error: any): DownloadQuotaState | null {
  try {
    const detail = error?.detail || error?.response?.data?.detail;
    if (!detail || detail.code !== 'DAILY_DOWNLOAD_LIMIT_EXCEEDED') {
      return null;
    }

    return {
      dailyLimit: detail.daily_limit,
      currentUsage: detail.current_usage,
      remaining: 0,
      resetAt: detail.reset_at ? new Date(detail.reset_at) : null,
      isBlocked: true,
    };
  } catch {
    return null;
  }
}

export default DownloadQuotaIndicator;
