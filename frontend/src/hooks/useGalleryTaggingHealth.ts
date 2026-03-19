/**
 * useGalleryTaggingHealth Hook
 * Fetches and manages gallery tagging health data with auto-refresh
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { smartTaggingService, GalleryHealth, WorkspaceHealth } from '../services/metadataService';
import { TaggingHealthData } from '../components/features/gallery/TaggingHealthBadge';
import { getStoredTokens } from '../services/tokenStorage';

interface UseGalleryTaggingHealthOptions {
  workspaceId: string;
  galleryId: string;
  /** Auto-refresh interval in ms (default: 60000 = 1 minute) */
  refreshInterval?: number;
  /** Enable auto-refresh (default: true) */
  autoRefresh?: boolean;
  /** Disable fetching initially */
  enabled?: boolean;
}

interface UseGalleryTaggingHealthReturn {
  /** Transformed health data for badge display */
  health: TaggingHealthData | null;
  /** Full health data from API */
  fullHealth: GalleryHealth | null;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Manual refetch */
  refetch: () => Promise<void>;
  /** Refresh stats on server (triggers re-calculation) */
  refreshStats: () => Promise<void>;
  /** Is currently refreshing stats */
  isRefreshing: boolean;
}

/**
 * Convert raw health data to badge format
 */
function toBadgeData(health: GalleryHealth): TaggingHealthData {
  const visionPct = health.total_assets > 0
    ? Math.round((health.vision_completed / health.total_assets) * 100)
    : 0;
  const facePct = health.total_assets > 0
    ? Math.round((health.face_completed / health.total_assets) * 100)
    : 0;
  const tagPct = health.total_assets > 0
    ? Math.round((health.tagged_assets / health.total_assets) * 100)
    : 0;

  // Determine badge based on health.badge if available, or compute
  let badge: TaggingHealthData['badge'];
  if (health.badge?.badge) {
    badge = health.badge.badge as TaggingHealthData['badge'];
  } else {
    // Compute badge from metrics
    const overallPct = (visionPct + facePct + tagPct) / 3;
    if (overallPct >= 90) badge = 'excellent';
    else if (overallPct >= 70) badge = 'good';
    else if (overallPct >= 40) badge = 'needs_attention';
    else badge = 'poor';
  }

  return {
    badge,
    vision_pct: visionPct,
    face_pct: facePct,
    tag_pct: tagPct,
  };
}

export function useGalleryTaggingHealth({
  workspaceId,
  galleryId,
  refreshInterval = 60000,
  autoRefresh = true,
  enabled = true,
}: UseGalleryTaggingHealthOptions): UseGalleryTaggingHealthReturn {
  const [fullHealth, setFullHealth] = useState<GalleryHealth | null>(null);
  const [health, setHealth] = useState<TaggingHealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Track if component is mounted
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);

  const fetchHealth = useCallback(async () => {
    // Skip if missing required params or not enabled
    if (!workspaceId || !galleryId || !enabled) return;

    // Skip if not authenticated - avoid 401 errors
    const tokens = getStoredTokens();
    if (!tokens?.accessToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await smartTaggingService.getGalleryHealth(workspaceId, galleryId);
      if (mountedRef.current) {
        setFullHealth(data);
        setHealth(toBadgeData(data));
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        // Handle non-critical errors silently - tagging health is a UI enhancement
        // 401 = auth expired, 404 = endpoint not found (ai-service not deployed),
        // 502/503 = ai-service container not running
        const errorObj = err as { code?: string; status?: number; message?: string };
        const status = errorObj?.status;
        const isSilent =
          errorObj?.code === 'UNAUTHORIZED' ||
          status === 401 ||
          status === 404 ||
          status === 502 ||
          status === 503;
        if (isSilent) {
          // Silent fail - tagging health is non-critical
          setFullHealth(null);
          setHealth(null);
        } else {
          setError(err instanceof Error ? err : new Error('Failed to fetch health'));
          setFullHealth(null);
          setHealth(null);
        }
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [workspaceId, galleryId, enabled]);

  const refreshStats = useCallback(async () => {
    if (!workspaceId) return;

    setIsRefreshing(true);
    try {
      await smartTaggingService.refreshHealth(workspaceId);
      // Re-fetch after refresh
      await fetchHealth();
    } catch {
      // Ignore refresh errors, just re-fetch
      await fetchHealth();
    } finally {
      if (mountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [workspaceId, fetchHealth]);

  // Initial fetch
  useEffect(() => {
    if (enabled) {
      fetchHealth();
    }
  }, [fetchHealth, enabled]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh || !enabled || refreshInterval <= 0) {
      return;
    }

    intervalRef.current = globalThis.setInterval(fetchHealth, refreshInterval);

    return () => {
      if (intervalRef.current) {
        globalThis.clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, enabled, refreshInterval, fetchHealth]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        globalThis.clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    health,
    fullHealth,
    loading,
    error,
    refetch: fetchHealth,
    refreshStats,
    isRefreshing,
  };
}

/**
 * Hook for workspace-level tagging health (overview)
 */
interface UseWorkspaceTaggingHealthOptions {
  workspaceId: string;
  refreshInterval?: number;
  autoRefresh?: boolean;
  enabled?: boolean;
}

interface UseWorkspaceTaggingHealthReturn {
  health: WorkspaceHealth | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useWorkspaceTaggingHealth({
  workspaceId,
  refreshInterval = 60000,
  autoRefresh = true,
  enabled = true,
}: UseWorkspaceTaggingHealthOptions): UseWorkspaceTaggingHealthReturn {
  const [health, setHealth] = useState<WorkspaceHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);

  const fetchHealth = useCallback(async () => {
    if (!workspaceId || !enabled) return;

    // Skip if not authenticated - avoid 401 errors
    const tokens = getStoredTokens();
    if (!tokens?.accessToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await smartTaggingService.getWorkspaceHealth(workspaceId, true);
      if (mountedRef.current) {
        setHealth(data);
      }
    } catch (err) {
      if (mountedRef.current) {
        // Handle non-critical errors silently - tagging health is a UI enhancement
        // 401 = auth expired, 404 = ai-service not deployed, 502/503 = ai-service down
        const errorObj = err as { status?: number; message?: string };
        const errorMsg = err instanceof Error ? err.message : '';
        const isSilent =
          errorMsg.includes('401') ||
          errorMsg.includes('Unauthorized') ||
          errorObj?.status === 404 ||
          errorObj?.status === 502 ||
          errorObj?.status === 503 ||
          errorMsg.includes('404') ||
          errorMsg.includes('Not Found');
        if (isSilent) {
          setHealth(null);
        } else {
          const error = err instanceof Error ? err : new Error('Failed to fetch health');
          setError(error);
          setHealth(null);
        }
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [workspaceId, enabled]);

  useEffect(() => {
    if (enabled) {
      fetchHealth();
    }
  }, [fetchHealth, enabled]);

  useEffect(() => {
    if (!autoRefresh || !enabled || refreshInterval <= 0) {
      return;
    }

    intervalRef.current = globalThis.setInterval(fetchHealth, refreshInterval);

    return () => {
      if (intervalRef.current) {
        globalThis.clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, enabled, refreshInterval, fetchHealth]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        globalThis.clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    health,
    loading,
    error,
    refetch: fetchHealth,
  };
}

export default useGalleryTaggingHealth;
