/**
 * useSearch Hook
 * Provides unified search functionality with debouncing and caching
 *
 * Feature: AI & Search Features (GEO)
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { searchService, type SearchResponse, type EntityType } from '../services/searchService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseSearchOptions {
  workspaceId: string;
  debounceMs?: number;
  minQueryLength?: number;
  entityTypes?: EntityType[];
  galleryId?: string;
  cacheResults?: boolean;
}

export interface UseSearchReturn {
  /** Current search query */
  query: string;
  /** Set the search query */
  setQuery: (query: string) => void;
  /** Search results */
  results: SearchResponse | null;
  /** Whether a search is in progress */
  loading: boolean;
  /** Error from the last search */
  error: Error | null;
  /** Execute search immediately (bypasses debounce) */
  search: (query?: string) => Promise<void>;
  /** Clear search results */
  clear: () => void;
  /** Whether results are from cache */
  isCached: boolean;
  /** Total results count */
  totalCount: number;
  /** Recent search queries (session-only) */
  recentQueries: string[];
  /** Clear recent queries */
  clearRecentQueries: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_MIN_QUERY_LENGTH = 2;
const MAX_RECENT_QUERIES = 10;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: SearchResponse;
  timestamp: number;
}

const searchCache = new Map<string, CacheEntry>();

function getCacheKey(
  workspaceId: string,
  query: string,
  entityTypes?: EntityType[],
  galleryId?: string
): string {
  return `${workspaceId}:${query}:${entityTypes?.join(',') || 'all'}:${galleryId || 'all'}`;
}

function getCachedResult(key: string): SearchResponse | null {
  const entry = searchCache.get(key);
  if (!entry) return null;

  // Check if cache is still valid
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }

  return entry.data;
}

function setCachedResult(key: string, data: SearchResponse): void {
  searchCache.set(key, { data, timestamp: Date.now() });

  // Limit cache size
  if (searchCache.size > 100) {
    const firstKey = searchCache.keys().next().value;
    if (firstKey) {
      searchCache.delete(firstKey);
    }
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSearch({
  workspaceId,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  minQueryLength = DEFAULT_MIN_QUERY_LENGTH,
  entityTypes,
  galleryId,
  cacheResults = true,
}: UseSearchOptions): UseSearchReturn {
  const [query, setQueryState] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  // Refs for debouncing and cancellation
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef<string>('');

  // Add to recent queries
  const addToRecentQueries = useCallback((q: string) => {
    if (!q.trim()) return;
    setRecentQueries((prev) => {
      const filtered = prev.filter((p) => p !== q);
      return [q, ...filtered].slice(0, MAX_RECENT_QUERIES);
    });
  }, []);

  // Execute search
  const executeSearch = useCallback(
    async (searchQuery: string) => {
      if (searchQuery.length < minQueryLength) {
        setResults(null);
        setIsCached(false);
        return;
      }

      // Check cache first
      if (cacheResults) {
        const cacheKey = getCacheKey(workspaceId, searchQuery, entityTypes, galleryId);
        const cached = getCachedResult(cacheKey);
        if (cached) {
          setResults(cached);
          setIsCached(true);
          setError(null);
          addToRecentQueries(searchQuery);
          return;
        }
      }

      // Cancel any previous request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setLoading(true);
      setError(null);
      setIsCached(false);

      try {
        const response = await searchService.quickSearch(workspaceId, searchQuery, {
          types: entityTypes,
          galleryId,
        });

        setResults(response);
        lastQueryRef.current = searchQuery;
        addToRecentQueries(searchQuery);

        // Cache result
        if (cacheResults) {
          const cacheKey = getCacheKey(workspaceId, searchQuery, entityTypes, galleryId);
          setCachedResult(cacheKey, response);
        }
      } catch (err) {
        // Ignore AbortError
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err : new Error('Search failed'));
        setResults(null);
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, entityTypes, galleryId, minQueryLength, cacheResults, addToRecentQueries]
  );

  // Debounced search
  const debouncedSearch = useCallback(
    (searchQuery: string) => {
      // Clear existing debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        executeSearch(searchQuery);
      }, debounceMs);
    },
    [executeSearch, debounceMs]
  );

  // Set query and trigger debounced search
  const setQuery = useCallback(
    (newQuery: string) => {
      setQueryState(newQuery);
      debouncedSearch(newQuery);
    },
    [debouncedSearch]
  );

  // Immediate search (bypasses debounce)
  const search = useCallback(
    async (searchQuery?: string) => {
      const q = searchQuery ?? query;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      await executeSearch(q);
    },
    [query, executeSearch]
  );

  // Clear results
  const clear = useCallback(() => {
    setQueryState('');
    setResults(null);
    setError(null);
    setIsCached(false);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    abortControllerRef.current?.abort();
  }, []);

  // Clear recent queries
  const clearRecentQueries = useCallback(() => {
    setRecentQueries([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      abortControllerRef.current?.abort();
    };
  }, []);

  // Calculate total count
  const totalCount = useMemo(() => {
    return results?.total ?? 0;
  }, [results]);

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    search,
    clear,
    isCached,
    totalCount,
    recentQueries,
    clearRecentQueries,
  };
}

export default useSearch;
