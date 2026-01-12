/**
 * useClientCommunications Hook
 * Manages client communications data fetching and state with pagination
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { clientService } from '../services/clientService';
import type {
  ClientCommunication,
  CommunicationListParams,
  ClientCommunicationListResponse,
} from '../types/client';

interface UseClientCommunicationsOptions {
  workspaceId: string;
  clientId: string;
  params?: CommunicationListParams;
  autoFetch?: boolean;
}

interface UseClientCommunicationsReturn {
  communications: ClientCommunication[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  totalCount: number;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
  setParams: (params: CommunicationListParams) => void;
}

export const useClientCommunications = ({
  workspaceId,
  clientId,
  params: initialParams = {},
  autoFetch = true,
}: UseClientCommunicationsOptions): UseClientCommunicationsReturn => {
  const [communications, setCommunications] = useState<ClientCommunication[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [params, setParams] = useState<CommunicationListParams>(initialParams);
  const [currentPage, setCurrentPage] = useState(1);

  // Track abort controller to cancel in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchCommunications = useCallback(
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
        const requestParams: CommunicationListParams = {
          ...params,
          page,
          limit: params.limit || 20,
        };

        const response: ClientCommunicationListResponse = await clientService.getCommunications(
          workspaceId,
          clientId,
          requestParams
        );



        if (reset) {
          setCommunications(response.communications);
        } else {
          setCommunications((prev) => [...prev, ...response.communications]);
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
        setError(err instanceof Error ? err : new Error('Failed to fetch communications'));
        setLoading(false);
      }
    },
    [workspaceId, clientId, params]
  );

  // Initial fetch
  useEffect(() => {
    if (autoFetch && clientId && workspaceId) {
      fetchCommunications(1, true);
    }

    // Cleanup: abort any in-flight request on unmount
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [autoFetch, clientId, workspaceId, params]);

  // Refetch from beginning
  const refetch = useCallback(async () => {
    await fetchCommunications(1, true);
  }, [fetchCommunications]);

  // Load next page
  const loadMore = useCallback(async () => {
    if (!loading && hasMore) {
      await fetchCommunications(currentPage + 1, false);
    }
  }, [loading, hasMore, currentPage, fetchCommunications]);

  // Update params (triggers refetch via useEffect)
  const updateParams = useCallback((newParams: CommunicationListParams) => {
    setParams(newParams);
    setCurrentPage(1);
  }, []);

  return {
    communications,
    loading,
    error,
    hasMore,
    totalCount,
    refetch,
    loadMore,
    setParams: updateParams,
  };
};
