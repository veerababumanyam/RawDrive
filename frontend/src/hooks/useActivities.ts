/**
 * useActivities Hook
 * Custom hook for fetching workspace activities
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import activityService, { GetActivitiesParams } from '../services/activityService';
import type { Activity, ActivitySummary } from '../types/activity';

// ---------------------------------------------------------------------------
// useActivities Hook
// ---------------------------------------------------------------------------

export interface UseActivitiesOptions extends GetActivitiesParams {
  enabled?: boolean;
  refetchInterval?: number | false;
}

export function useActivities(options: UseActivitiesOptions = {}) {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const {
    enabled = true,
    refetchInterval = 30000, // Refetch every 30 seconds
    ...params
  } = options;

  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  // Track mounted state to avoid setting state after unmount
  const isMountedRef = useRef(true);

  const fetchActivities = useCallback(async () => {
    if (!workspaceId || !enabled) {
      setIsLoading(false);
      return;
    }

    setIsFetching(true);
    try {
      const data = await activityService.getRecentActivities(workspaceId, params);
      if (isMountedRef.current) {
        setActivities(data);
        setIsError(false);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setIsError(true);
        setError(err instanceof Error ? err : new Error('Failed to fetch activities'));
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsFetching(false);
      }
    }
  }, [workspaceId, enabled, params.limit, params.activity_type, params.actor_type, params.gallery_id]);

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    fetchActivities();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchActivities]);

  // Polling
  useEffect(() => {
    if (!refetchInterval || !enabled || !workspaceId) return;

    const intervalId = setInterval(fetchActivities, refetchInterval);
    return () => clearInterval(intervalId);
  }, [refetchInterval, enabled, workspaceId, fetchActivities]);

  // Listen for WebSocket events
  useEffect(() => {
    if (!workspaceId) return;

    const handleActivityCreated = (event: CustomEvent<{ activity: Activity }>) => {
      const newActivity = event.detail.activity;

      // Only update if this activity matches our filters
      if (params.activity_type && newActivity.activity_type !== params.activity_type) {
        return;
      }
      if (params.actor_type && newActivity.actor.type !== params.actor_type) {
        return;
      }
      if (params.gallery_id && newActivity.gallery?.id !== params.gallery_id) {
        return;
      }

      // Add the new activity to the front
      setActivities((prev) => {
        const limit = params.limit || 10;
        return [newActivity, ...prev].slice(0, limit);
      });
    };

    window.addEventListener(
      'ws:activity:created' as keyof WindowEventMap,
      handleActivityCreated as EventListener
    );

    return () => {
      window.removeEventListener(
        'ws:activity:created' as keyof WindowEventMap,
        handleActivityCreated as EventListener
      );
    };
  }, [workspaceId, params.activity_type, params.actor_type, params.gallery_id, params.limit]);

  return {
    activities,
    isLoading,
    isError,
    error,
    refetch: fetchActivities,
    isFetching,
  };
}

// ---------------------------------------------------------------------------
// useActivitySummary Hook
// ---------------------------------------------------------------------------

export interface UseActivitySummaryOptions {
  days?: number;
  enabled?: boolean;
}

export function useActivitySummary(options: UseActivitySummaryOptions = {}) {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const { days = 30, enabled = true } = options;

  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!workspaceId || !enabled) {
      setIsLoading(false);
      return;
    }

    try {
      const data = await activityService.getActivitySummary(workspaceId, days);
      setSummary(data);
      setIsError(false);
      setError(null);
    } catch (err) {
      setIsError(true);
      setError(err instanceof Error ? err : new Error('Failed to fetch activity summary'));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, days, enabled]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return {
    summary,
    isLoading,
    isError,
    error,
    refetch: fetchSummary,
  };
}
