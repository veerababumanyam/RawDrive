/**
 * useStorageUsage Hook
 *
 * Manages storage usage and subscription data fetching.
 * Caches data and provides auto-refresh functionality.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getStorageUsage,
  getSubscriptionStatus,
  refreshStorageCache,
  checkUploadAllowed,
} from '../services/storageService';
import type { StorageUsage, SubscriptionStatus, UploadCheckResult } from '../types/storage';

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

// Auto-refresh interval (5 minutes)
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000;

interface UseStorageUsageOptions {
  /** Workspace ID to fetch storage for */
  workspaceId: string;
  /** Whether to auto-fetch on mount */
  autoFetch?: boolean;
  /** Enable auto-refresh interval */
  autoRefresh?: boolean;
  /** Include subscription status */
  includeSubscription?: boolean;
}

interface UseStorageUsageReturn {
  /** Storage usage data */
  storageUsage: StorageUsage | null;
  /** Subscription status (if includeSubscription is true) */
  subscriptionStatus: SubscriptionStatus | null;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Refresh storage data */
  refetch: (forceRefresh?: boolean) => Promise<void>;
  /** Force refresh from database (bypasses cache) */
  forceRefresh: () => Promise<void>;
  /** Check if a file can be uploaded */
  canUpload: (fileSizeBytes: number) => Promise<UploadCheckResult>;
  /** Formatted storage used string (e.g., "2.5 GB") */
  storageUsedFormatted: string;
  /** Formatted storage limit string (e.g., "5 GB") */
  storageLimitFormatted: string;
  /** Usage percentage (0-100) */
  usagePercent: number;
  /** Whether storage is near limit (> 80%) */
  isNearLimit: boolean;
  /** Whether storage is at limit (>= 100%) */
  isAtLimit: boolean;
}

// In-memory cache for storage data
const storageCache = new Map<string, { data: StorageUsage; timestamp: number }>();

export const useStorageUsage = ({
  workspaceId,
  autoFetch = true,
  autoRefresh = true,
  includeSubscription = false,
}: UseStorageUsageOptions): UseStorageUsageReturn => {
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const intervalRef = useRef<number | null>(null);
  // Track if we should stop fetching (e.g., due to 401 auth error)
  const shouldStopFetching = useRef(false);

  // Get cached data if available and not stale
  const getCachedStorage = useCallback(() => {
    const cached = storageCache.get(workspaceId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    return null;
  }, [workspaceId]);

  // Fetch storage usage
  const fetchStorage = useCallback(
    async (forceRefresh = false) => {
      if (!workspaceId) return;
      
      // Don't fetch if we've encountered an auth error
      if (shouldStopFetching.current) return;

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCachedStorage();
        if (cached) {
          setStorageUsage(cached);
          // Continue to fetch subscription if needed
          if (!includeSubscription) return;
        }
      }

      setLoading(true);
      setError(null);

      try {
        // Fetch storage usage (use API's cache unless forcing refresh)
        const storage = await getStorageUsage(workspaceId, forceRefresh);
        setStorageUsage(storage);

        // Update local cache
        storageCache.set(workspaceId, {
          data: storage,
          timestamp: Date.now(),
        });

        // Fetch subscription if requested (may fail with 403 if user lacks billing:read)
        if (includeSubscription) {
          try {
            const subscription = await getSubscriptionStatus(workspaceId);
            setSubscriptionStatus(subscription);
          } catch (subscriptionErr) {
            // Don't fail the entire hook if subscription fetch fails (permission issue)
            // Just log and continue - storage usage will still work
            console.warn('Could not fetch subscription status (permission may be missing):', subscriptionErr);
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        
        // Check for 401 Unauthorized - stop further fetches silently
        if (errorMessage.includes('401') || errorMessage.toLowerCase().includes('unauthorized')) {
          shouldStopFetching.current = true;
          // Don't log or set error - this is expected when user logs out
          setLoading(false);
          return;
        }
        
        setError(err instanceof Error ? err : new Error('Failed to fetch storage usage'));
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, getCachedStorage, includeSubscription]
  );

  // Force refresh from database
  const forceRefresh = useCallback(async () => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      const storage = await refreshStorageCache(workspaceId);
      setStorageUsage(storage);

      // Update local cache
      storageCache.set(workspaceId, {
        data: storage,
        timestamp: Date.now(),
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to refresh storage'));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  // Check if upload is allowed
  const canUpload = useCallback(
    async (fileSizeBytes: number): Promise<UploadCheckResult> => {
      if (!workspaceId) {
        return {
          allowed: false,
          error_message: 'No workspace selected',
          current_usage_bytes: 0,
          limit_bytes: 0,
          remaining_bytes: 0,
          file_size_bytes: fileSizeBytes,
          would_exceed_by: 0,
        };
      }

      return checkUploadAllowed(workspaceId, fileSizeBytes);
    },
    [workspaceId]
  );

  // Initial fetch
  useEffect(() => {
    if (autoFetch && workspaceId) {
      fetchStorage();
    }
  }, [autoFetch, workspaceId, fetchStorage]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefresh && workspaceId) {
      intervalRef.current = window.setInterval(() => {
        fetchStorage();
      }, AUTO_REFRESH_INTERVAL);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [autoRefresh, workspaceId, fetchStorage]);

  // Derived values
  const storageUsedFormatted = storageUsage?.storage_used_formatted || '0 B';
  const storageLimitFormatted = storageUsage?.storage_limit_formatted || '0 B';
  const usagePercent = storageUsage?.usage_percent || 0;
  const isNearLimit = storageUsage?.is_near_limit || false;
  const isAtLimit = storageUsage?.is_at_limit || false;

  return {
    storageUsage,
    subscriptionStatus,
    loading,
    error,
    refetch: fetchStorage,
    forceRefresh,
    canUpload,
    storageUsedFormatted,
    storageLimitFormatted,
    usagePercent,
    isNearLimit,
    isAtLimit,
  };
};

/**
 * Invalidate the storage cache for a workspace.
 * Call this after upload/delete operations.
 */
export const invalidateStorageCache = (workspaceId: string): void => {
  storageCache.delete(workspaceId);
};

export default useStorageUsage;
