/**
 * useClientActivities Hook
 * Manages client activity timeline data fetching and state with pagination
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { clientService } from '../services/clientService';
import type {
  ClientActivity,
  ActivityListParams,
  ClientActivityListResponse,
} from '../types/client';

interface UseClientActivitiesOptions {
  workspaceId: string;
  clientId: string;
  params?: ActivityListParams;
  autoFetch?: boolean;
}

interface UseClientActivitiesReturn {
  activities: ClientActivity[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  totalCount: number;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
  setParams: (params: ActivityListParams) => void;
}

export const useClientActivities = ({
  workspaceId,
  clientId,
  params: initialParams = {},
  autoFetch = true,
}: UseClientActivitiesOptions): UseClientActivitiesReturn => {
  const [activities, setActivities] = useState<ClientActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [params, setParams] = useState<ActivityListParams>(initialParams);
  const [currentPage, setCurrentPage] = useState(1);

  // Track abort controller to cancel in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchActivities = useCallback(
    async (page: number, reset = false) => {
      if (!clientId || !workspaceId) {
        return;
      }

      // Cancel any previous request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setLoading(true);
      setError(null);

      try {
        const requestParams: ActivityListParams = {
          ...params,
          page,
          limit: params.limit || 20,
        };

        const response: ClientActivityListResponse = await clientService.getActivities(
          workspaceId,
          clientId,
          requestParams
        );



        if (reset) {
          setActivities(response.activities);
        } else {
          setActivities((prev) => [...prev, ...response.activities]);
        }



        setHasMore(response.meta.total > page * (params.limit || 20));
        setTotalCount(response.meta.total);
        setCurrentPage(page);
        setLoading(false);
      } catch (err) {
        // Ignore AbortError - component unmounted or request was cancelled
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err : new Error('Failed to fetch activities'));
        setLoading(false);
      }
    },
    [workspaceId, clientId, params]
  );

  // Initial fetch
  useEffect(() => {
    if (autoFetch && clientId && workspaceId) {
      fetchActivities(1, true);
    }

    // Cleanup: abort any in-flight request on unmount
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [autoFetch, clientId, workspaceId, params]);

  // Refetch from beginning
  const refetch = useCallback(async () => {
    await fetchActivities(1, true);
  }, [fetchActivities]);

  // Load next page
  const loadMore = useCallback(async () => {
    if (!loading && hasMore) {
      await fetchActivities(currentPage + 1, false);
    }
  }, [loading, hasMore, currentPage, fetchActivities]);

  // Update params (triggers refetch via useEffect)
  const updateParams = useCallback((newParams: ActivityListParams) => {
    setParams(newParams);
    setCurrentPage(1);
  }, []);

  return {
    activities,
    loading,
    error,
    hasMore,
    totalCount,
    refetch,
    loadMore,
    setParams: updateParams,
  };
};
