/**
 * React hooks for face cache service integration.
 *
 * Provides convenient React hooks for:
 * - Checking biometric consent status
 * - Getting cache statistics
 * - Granting/withdrawing consent
 * - Cache management operations
 *
 * @module hooks/useFaceCache
 */

import { useState, useEffect, useCallback } from 'react';
import { faceCacheService, BiometricConsentStatus, FaceCacheStats } from '@/services/faceCacheService';
import type { GrantConsentRequest } from '@/services/faceCacheService';

// ============================================================================
// Types
// ============================================================================

export interface UseFaceCacheStatsResult {
  stats: FaceCacheStats | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  metrics: {
    hitRate: string;
    totalRequests: number;
    cacheHits: number;
    cacheMisses: number;
    performanceGain: string;
  } | null;
}

export interface UseBiometricConsentResult {
  status: BiometricConsentStatus | null;
  loading: boolean;
  error: Error | null;
  isAllowed: boolean;
  refetch: () => Promise<void>;
  grantConsent: (request?: GrantConsentRequest) => Promise<void>;
  withdrawConsent: (cascadeDelete?: boolean) => Promise<void>;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for accessing face cache statistics.
 *
 * Automatically fetches stats on mount and provides refetch capability.
 *
 * @param workspaceId - The workspace ID
 * @param autoFetch - Whether to automatically fetch on mount (default: true)
 * @returns Cache stats result
 */
export function useFaceCacheStats(
  workspaceId: string,
  autoFetch: boolean = true
): UseFaceCacheStatsResult {
  const [stats, setStats] = useState<FaceCacheStats | null>(null);
  const [loading, setLoading] = useState<boolean>(autoFetch);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = useCallback(async () => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await faceCacheService.getCacheStats(workspaceId);
      setStats(data);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch face cache stats:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (autoFetch) {
      fetchStats();
    }
  }, [autoFetch, fetchStats]);

  // Calculate metrics
  const metrics = stats
    ? {
        hitRate: `${stats.performance.hit_rate_percent.toFixed(1)}%`,
        totalRequests:
          stats.performance.l1_hits +
          stats.performance.l2_hits +
          stats.performance.l3_hits +
          stats.performance.misses,
        cacheHits:
          stats.performance.l1_hits +
          stats.performance.l2_hits +
          stats.performance.l3_hits,
        cacheMisses: stats.performance.misses,
        performanceGain: calculatePerformanceGain(stats),
      }
    : null;

  return {
    stats,
    loading,
    error,
    refetch: fetchStats,
    metrics,
  };
}

/**
 * Hook for managing biometric consent status.
 *
 * Provides consent status checking, granting, and withdrawal.
 *
 * @param workspaceId - The workspace ID
 * @param autoFetch - Whether to automatically fetch on mount (default: true)
 * @returns Consent status result with mutations
 */
export function useBiometricConsent(
  workspaceId: string,
  autoFetch: boolean = true
): UseBiometricConsentResult {
  const [status, setStatus] = useState<BiometricConsentStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(autoFetch);
  const [error, setError] = useState<Error | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      // Try cached status first
      const cached = faceCacheService.getCachedConsentStatus(workspaceId);
      if (cached) {
        setStatus(cached);
        setLoading(false);
        return;
      }

      const data = await faceCacheService.getConsentStatus(workspaceId);
      setStatus(data);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch consent status:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const grantConsent = useCallback(async (request?: GrantConsentRequest) => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await faceCacheService.grantConsent(workspaceId, request);
      setStatus(data);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const withdrawConsent = useCallback(async (cascadeDelete: boolean = false) => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await faceCacheService.withdrawConsent(workspaceId, cascadeDelete);
      setStatus(data);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (autoFetch) {
      fetchStatus();
    }
  }, [autoFetch, fetchStatus]);

  return {
    status,
    loading,
    error,
    isAllowed: status?.is_allowed ?? false,
    refetch: fetchStatus,
    grantConsent,
    withdrawConsent,
  };
}

/**
 * Hook for quick consent check without full state management.
 *
 * Use this for simple permission checks without UI loading states.
 *
 * @param workspaceId - The workspace ID
 * @returns Whether face detection is allowed
 */
export function useFaceDetectionAllowed(workspaceId: string): boolean {
  const [isAllowed, setIsAllowed] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    const checkAllowed = async () => {
      const allowed = await faceCacheService.isFaceDetectionAllowed(workspaceId);
      if (mounted) {
        setIsAllowed(allowed);
      }
    };

    checkAllowed();

    return () => {
      mounted = false;
    };
  }, [workspaceId]);

  return isAllowed;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate performance gain from caching.
 *
 * @param stats - Cache statistics
 * @returns Performance gain multiplier (e.g., "5.2x")
 */
function calculatePerformanceGain(stats: FaceCacheStats): string {
  const perf = stats.performance;
  const totalRequests = perf.l1_hits + perf.l2_hits + perf.l3_hits + perf.misses;
  const cacheHits = perf.l1_hits + perf.l2_hits + perf.l3_hits;

  if (totalRequests === 0) return '1.0x';

  // Weighted average latency
  // L1: ~50ms, L2: ~100ms, L3: ~200ms, Miss: ~5000ms
  const avgLatencyWithCache =
    (perf.l1_hits * 0.05 +
      perf.l2_hits * 0.1 +
      perf.l3_hits * 0.2 +
      perf.misses * 5) / totalRequests;

  const avgLatencyWithoutCache = 5; // 5 seconds for AI API call
  const gain = avgLatencyWithoutCache / avgLatencyWithCache;

  return `${gain.toFixed(1)}x`;
}

/**
 * Format consent status for display.
 *
 * @param status - Consent status
 * @returns Formatted status object
 */
export function formatConsentStatus(status: BiometricConsentStatus | null) {
  if (!status) {
    return {
      label: 'Unknown',
      color: 'gray',
      description: 'Unable to determine consent status',
    };
  }

  switch (status.consent_status) {
    case 'granted':
      return {
        label: 'Consent Granted',
        color: 'green',
        description: `Consent granted on ${new Date(status.consented_at || '').toLocaleDateString()}`,
      };
    case 'withdrawn':
      return {
        label: 'Consent Withdrawn',
        color: 'red',
        description: 'Biometric consent has been withdrawn',
      };
    case 'not_granted':
    default:
      return {
        label: 'Consent Required',
        color: 'orange',
        description: 'Biometric consent is required for face detection',
      };
  }
}

/**
 * Format cache hit rate for display with color coding.
 *
 * @param hitRate - Hit rate percentage (0-100)
 * @returns Formatted hit rate object
 */
export function formatHitRate(hitRate: number) {
  if (hitRate >= 80) {
    return {
      label: `${hitRate.toFixed(1)}%`,
      color: 'green',
      description: 'Excellent cache performance',
    };
  } else if (hitRate >= 50) {
    return {
      label: `${hitRate.toFixed(1)}%`,
      color: 'yellow',
      description: 'Good cache performance',
    };
  } else {
    return {
      label: `${hitRate.toFixed(1)}%`,
      color: 'orange',
      description: 'Cache warming recommended',
    };
  }
}
