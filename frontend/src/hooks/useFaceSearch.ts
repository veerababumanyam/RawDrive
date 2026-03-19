/**
 * useFaceSearch Hook
 *
 * Cross-gallery face search -- finds all photos of a person
 * across all galleries in the workspace.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  faceApiService,
  type PersonPhotoResult,
  type NormalizedPaginatedResponse,
} from '../services/faceApiService';

interface UseFaceSearchReturn {
  data: PersonPhotoResult[];
  total: number;
  loading: boolean;
  error: string | null;
  page: number;
  setPage: (page: number) => void;
  refetch: () => void;
}

export function useFaceSearch(
  workspaceId: string | undefined,
  personId: string | null,
  perPage = 50
): UseFaceSearchReturn {
  const [data, setData] = useState<PersonPhotoResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchResults = useCallback(async () => {
    if (!workspaceId || !personId) {
      setData([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await faceApiService.searchPhotosByPerson(
        workspaceId,
        personId,
        page,
        perPage
      );
      setData(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      console.error('Face search failed:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, personId, page, perPage]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // Reset page when person changes
  useEffect(() => {
    setPage(1);
  }, [personId]);

  return {
    data,
    total,
    loading,
    error,
    page,
    setPage,
    refetch: fetchResults,
  };
}

export default useFaceSearch;
