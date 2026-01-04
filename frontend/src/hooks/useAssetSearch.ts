/**
 * useAssetSearch Hook
 * Provides debounced search and filtering for gallery assets
 * Supports filtering by tags, people (face groups), and tag source
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getStoredTokens } from '../services/auth';

export type TagSource = 'manual' | 'ai_vision' | 'ai_gemini' | 'ai_local';

export interface SearchFilters {
  query?: string;
  tagIds?: string[];
  faceGroupIds?: string[];
  tagSource?: TagSource;
  picksOnly?: boolean;
  favoritesOnly?: boolean;
}

export interface TagSuggestion {
  tag_id: string;
  name: string;
  source: TagSource;
  usage_count: number;
}

export interface PersonSuggestion {
  face_group_id: string;
  display_name: string | null;
  face_count: number;
  representative_thumbnail_url?: string;
}

interface UseAssetSearchOptions {
  galleryId: string;
  debounceMs?: number;
  enabled?: boolean;
}

interface UseAssetSearchResult {
  /** Current search filters */
  filters: SearchFilters;
  /** Update filters (merges with existing) */
  setFilters: (filters: Partial<SearchFilters>) => void;
  /** Clear all filters */
  clearFilters: () => void;
  /** Whether any filters are active */
  hasActiveFilters: boolean;
  /** Debounced query string for API calls */
  debouncedQuery: string;
  /** Tag suggestions for autocomplete */
  tagSuggestions: TagSuggestion[];
  /** Person suggestions for autocomplete */
  personSuggestions: PersonSuggestion[];
  /** Loading state for suggestions */
  loadingSuggestions: boolean;
  /** Fetch tag suggestions for autocomplete */
  fetchTagSuggestions: (query: string) => Promise<void>;
  /** Fetch person suggestions for autocomplete */
  fetchPersonSuggestions: (query: string) => Promise<void>;
  /** Build query params for API call */
  buildQueryParams: () => URLSearchParams;
}

export const useAssetSearch = ({
  galleryId,
  debounceMs = 300,
  enabled = true,
}: UseAssetSearchOptions): UseAssetSearchResult => {
  const { workspace } = useAuth();
  const [filters, setFiltersState] = useState<SearchFilters>({});
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [personSuggestions, setPersonSuggestions] = useState<PersonSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the query string
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(filters.query || '');
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [filters.query, debounceMs]);

  // Update filters (merge with existing)
  const setFilters = useCallback((newFilters: Partial<SearchFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...newFilters }));
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFiltersState({});
    setDebouncedQuery('');
  }, []);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.query ||
      (filters.tagIds && filters.tagIds.length > 0) ||
      (filters.faceGroupIds && filters.faceGroupIds.length > 0) ||
      filters.tagSource ||
      filters.picksOnly ||
      filters.favoritesOnly
    );
  }, [filters]);

  // Fetch tag suggestions for autocomplete
  const fetchTagSuggestions = useCallback(
    async (query: string) => {
      if (!workspace?.workspace_id || !getStoredTokens()?.accessToken || !enabled || query.length < 2) {
        setTagSuggestions([]);
        return;
      }

      setLoadingSuggestions(true);
      try {
        const response = await fetch(
          `/api/v1/workspaces/${workspace.workspace_id}/tags?search=${encodeURIComponent(query)}&limit=10`,
          {
            headers: {
              Authorization: `Bearer ${getStoredTokens()?.accessToken}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setTagSuggestions(data.tags || []);
        } else {
          setTagSuggestions([]);
        }
      } catch (error) {
        console.error('Failed to fetch tag suggestions:', error);
        setTagSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    },
    [workspace?.workspace_id, getStoredTokens()?.accessToken, enabled]
  );

  // Fetch person suggestions for autocomplete
  const fetchPersonSuggestions = useCallback(
    async (query: string) => {
      if (!workspace?.workspace_id || !getStoredTokens()?.accessToken || !enabled) {
        setPersonSuggestions([]);
        return;
      }

      setLoadingSuggestions(true);
      try {
        // Use face groups endpoint with gallery filter
        const url = galleryId
          ? `/api/v1/workspaces/${workspace.workspace_id}/galleries/${galleryId}/face-groups?search=${encodeURIComponent(query)}&limit=10`
          : `/api/v1/workspaces/${workspace.workspace_id}/face-groups?search=${encodeURIComponent(query)}&limit=10`;

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${getStoredTokens()?.accessToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setPersonSuggestions(data.face_groups || []);
        } else {
          setPersonSuggestions([]);
        }
      } catch (error) {
        console.error('Failed to fetch person suggestions:', error);
        setPersonSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    },
    [workspace?.workspace_id, getStoredTokens()?.accessToken, enabled, galleryId]
  );

  // Build query params for API call
  const buildQueryParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams();

    if (debouncedQuery) {
      params.set('search_query', debouncedQuery);
    }

    if (filters.tagIds && filters.tagIds.length > 0) {
      filters.tagIds.forEach((id) => params.append('tag_ids', id));
    }

    if (filters.faceGroupIds && filters.faceGroupIds.length > 0) {
      filters.faceGroupIds.forEach((id) => params.append('face_group_ids', id));
    }

    if (filters.tagSource) {
      params.set('tag_source', filters.tagSource);
    }

    if (filters.picksOnly) {
      params.set('picks_only', 'true');
    }

    if (filters.favoritesOnly) {
      params.set('favorites_only', 'true');
    }

    return params;
  }, [debouncedQuery, filters]);

  return {
    filters,
    setFilters,
    clearFilters,
    hasActiveFilters,
    debouncedQuery,
    tagSuggestions,
    personSuggestions,
    loadingSuggestions,
    fetchTagSuggestions,
    fetchPersonSuggestions,
    buildQueryParams,
  };
};

export default useAssetSearch;
