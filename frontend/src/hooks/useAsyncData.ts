/**
 * useAsyncData Hook
 *
 * A unified hook for async data fetching patterns that eliminates duplication
 * across 50+ frontend hooks. Supports:
 * - Automatic error handling
 * - Configurable retries with exponential backoff
 * - Request cancellation via AbortController
 * - Stale-while-revalidate patterns
 * - Loading states (idle/loading/success/error)
 * - Polling/refetch intervals
 * - Optimistic updates
 *
 * @module useAsyncData
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// =============================================================================
// Types
// =============================================================================

/**
 * Async data fetch status
 */
export type AsyncDataStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * Options for configuring the useAsyncData hook
 */
export interface UseAsyncDataOptions<T> {
  /**
   * Whether to automatically fetch data on mount.
   * @default true
   */
  enabled?: boolean;

  /**
   * Initial data to use before first fetch completes.
   * Useful for SSR hydration or default values.
   */
  initialData?: T;

  /**
   * Auto-refetch interval in milliseconds.
   * Set to false or 0 to disable.
   * @default false
   */
  refetchInterval?: number | false;

  /**
   * Only refetch when window is focused (for polling).
   * @default false
   */
  refetchOnWindowFocus?: boolean;

  /**
   * Number of retry attempts on failure.
   * @default 0
   */
  retryCount?: number;

  /**
   * Base delay for exponential backoff in milliseconds.
   * Actual delay = retryDelay * 2^attemptNumber
   * @default 1000
   */
  retryDelay?: number;

  /**
   * Maximum retry delay in milliseconds.
   * @default 30000
   */
  maxRetryDelay?: number;

  /**
   * Callback when fetch is successful.
   */
  onSuccess?: (data: T) => void;

  /**
   * Callback when fetch fails.
   */
  onError?: (error: Error) => void;

  /**
   * Callback before fetch starts.
   */
  onSettled?: (data: T | undefined, error: Error | null) => void;

  /**
   * Keep previous data while refetching.
   * Enables stale-while-revalidate pattern.
   * @default true
   */
  keepPreviousData?: boolean;

  /**
   * Time in ms that data is considered fresh.
   * Prevents refetching within this window.
   * @default 0 (always fetch)
   */
  staleTime?: number;

  /**
   * Dependencies array that triggers refetch when changed.
   * Similar to useEffect deps.
   */
  deps?: unknown[];

  /**
   * Whether to deduplicate concurrent requests.
   * @default true
   */
  dedupe?: boolean;
}

/**
 * Return type of useAsyncData hook
 */
export interface UseAsyncDataReturn<T> {
  /** The fetched data (undefined initially) */
  data: T | undefined;

  /** Error if fetch failed */
  error: Error | null;

  /** Current status: idle, loading, success, or error */
  status: AsyncDataStatus;

  /** True during initial load (no data yet) */
  isLoading: boolean;

  /** True when any fetch is in progress (including refetch) */
  isFetching: boolean;

  /** True if fetch completed successfully */
  isSuccess: boolean;

  /** True if fetch failed with error */
  isError: boolean;

  /** True if no fetch has been attempted yet */
  isIdle: boolean;

  /** Manually trigger a refetch */
  refetch: (options?: RefetchOptions) => Promise<T | undefined>;

  /** Reset to initial state */
  reset: () => void;

  /** Optimistically update data */
  setData: (updater: T | ((prev: T | undefined) => T | undefined)) => void;

  /** Timestamp of last successful fetch */
  dataUpdatedAt: number | null;

  /** Number of failed attempts */
  failureCount: number;
}

/**
 * Options for refetch
 */
export interface RefetchOptions {
  /**
   * Force refetch even if data is fresh.
   * @default true
   */
  force?: boolean;

  /**
   * Skip setting loading state (background refetch).
   * @default false
   */
  silent?: boolean;
}

/**
 * Async function type that can be passed to useAsyncData
 */
export type AsyncFn<T> = (signal: AbortSignal) => Promise<T>;

// =============================================================================
// Request deduplication cache
// =============================================================================

// Global cache for deduplicating concurrent requests
const pendingRequests = new Map<string, Promise<unknown>>();

/**
 * Generate a stable key for deduplication based on the function
 */
function generateRequestKey(asyncFn: AsyncFn<unknown>, deps?: unknown[]): string {
  // Use function reference + deps as key
  const fnKey = asyncFn.toString().slice(0, 100);
  const depsKey = deps ? JSON.stringify(deps) : '';
  return `${fnKey}:${depsKey}`;
}

// =============================================================================
// Main Hook
// =============================================================================

/**
 * Unified hook for async data fetching with comprehensive features.
 *
 * @example Basic usage
 * ```tsx
 * const { data, isLoading, error, refetch } = useAsyncData(
 *   (signal) => fetchUsers(signal),
 *   { enabled: true }
 * );
 * ```
 *
 * @example With retry and polling
 * ```tsx
 * const { data, isFetching } = useAsyncData(
 *   (signal) => fetchStatus(signal),
 *   {
 *     retryCount: 3,
 *     refetchInterval: 5000,
 *   }
 * );
 * ```
 *
 * @example With stale-while-revalidate
 * ```tsx
 * const { data } = useAsyncData(
 *   (signal) => fetchDashboard(signal),
 *   {
 *     staleTime: 30000,
 *     keepPreviousData: true,
 *   }
 * );
 * ```
 *
 * @example With dependencies
 * ```tsx
 * const { data } = useAsyncData(
 *   (signal) => fetchGallery(galleryId, signal),
 *   {
 *     deps: [galleryId],
 *     enabled: !!galleryId,
 *   }
 * );
 * ```
 */
export function useAsyncData<T>(
  asyncFn: AsyncFn<T>,
  options: UseAsyncDataOptions<T> = {}
): UseAsyncDataReturn<T> {
  const {
    enabled = true,
    initialData,
    refetchInterval = false,
    refetchOnWindowFocus = false,
    retryCount = 0,
    retryDelay = 1000,
    maxRetryDelay = 30000,
    onSuccess,
    onError,
    onSettled,
    keepPreviousData = true,
    staleTime = 0,
    deps = [],
    dedupe = true,
  } = options;

  // State
  const [data, setData] = useState<T | undefined>(initialData);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<AsyncDataStatus>(initialData ? 'success' : 'idle');
  const [isFetching, setIsFetching] = useState(false);
  const [dataUpdatedAt, setDataUpdatedAt] = useState<number | null>(
    initialData ? Date.now() : null
  );
  const [failureCount, setFailureCount] = useState(0);

  // Refs for cleanup and tracking
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const asyncFnRef = useRef(asyncFn);

  // Keep asyncFn ref up to date
  asyncFnRef.current = asyncFn;

  // Derived state
  const isLoading = status === 'loading' && data === undefined;
  const isSuccess = status === 'success';
  const isError = status === 'error';
  const isIdle = status === 'idle';

  // Check if data is stale
  const isStale = useCallback(() => {
    if (!dataUpdatedAt || staleTime === 0) return true;
    return Date.now() - dataUpdatedAt > staleTime;
  }, [dataUpdatedAt, staleTime]);

  // Calculate retry delay with exponential backoff
  const getRetryDelay = useCallback(
    (attempt: number): number => {
      const delay = retryDelay * Math.pow(2, attempt);
      return Math.min(delay, maxRetryDelay);
    },
    [retryDelay, maxRetryDelay]
  );

  // Reset state
  const reset = useCallback(() => {
    // Cancel any in-flight request
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    // Clear any pending retry
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Reset state
    setData(initialData);
    setError(null);
    setStatus(initialData ? 'success' : 'idle');
    setIsFetching(false);
    setDataUpdatedAt(initialData ? Date.now() : null);
    setFailureCount(0);
  }, [initialData]);

  // Main fetch function
  const fetchData = useCallback(
    async (fetchOptions: RefetchOptions = {}): Promise<T | undefined> => {
      const { force = true, silent = false } = fetchOptions;

      // Skip if not enabled
      if (!enabled) {
        return data;
      }

      // Skip if data is fresh and not forced
      if (!force && !isStale()) {
        return data;
      }

      // Cancel any previous request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;

      // Set loading state (unless silent refetch)
      if (!silent) {
        if (!keepPreviousData || data === undefined) {
          setStatus('loading');
        }
      }
      setIsFetching(true);

      // Deduplication
      const requestKey = dedupe ? generateRequestKey(asyncFnRef.current as AsyncFn<unknown>, deps) : '';

      try {
        let result: T;

        if (dedupe && pendingRequests.has(requestKey)) {
          // Reuse existing request
          result = (await pendingRequests.get(requestKey)) as T;
        } else {
          // Create new request
          const promise = asyncFnRef.current(signal);

          if (dedupe) {
            pendingRequests.set(requestKey, promise);
          }

          try {
            result = await promise;
          } finally {
            if (dedupe) {
              pendingRequests.delete(requestKey);
            }
          }
        }

        // Check if still mounted
        if (!isMountedRef.current) {
          return undefined;
        }

        // Check if request was aborted
        if (signal.aborted) {
          return data;
        }

        // Success
        setData(result);
        setError(null);
        setStatus('success');
        setDataUpdatedAt(Date.now());
        setFailureCount(0);

        // Callbacks
        onSuccess?.(result);
        onSettled?.(result, null);

        return result;
      } catch (err) {
        // Ignore AbortError
        if (err instanceof Error && err.name === 'AbortError') {
          return data;
        }

        // Check if still mounted
        if (!isMountedRef.current) {
          return undefined;
        }

        const error = err instanceof Error ? err : new Error(String(err));
        const newFailureCount = failureCount + 1;

        // Check if we should retry
        if (newFailureCount <= retryCount) {
          setFailureCount(newFailureCount);

          // Schedule retry with backoff
          const delay = getRetryDelay(newFailureCount - 1);
          retryTimeoutRef.current = window.setTimeout(() => {
            if (isMountedRef.current) {
              fetchData(fetchOptions);
            }
          }, delay);

          return undefined;
        }

        // Max retries exceeded - set error state
        setError(error);
        setStatus('error');
        setFailureCount(newFailureCount);

        // Callbacks
        onError?.(error);
        onSettled?.(data, error);

        return undefined;
      } finally {
        if (isMountedRef.current) {
          setIsFetching(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      enabled,
      data,
      isStale,
      keepPreviousData,
      dedupe,
      retryCount,
      failureCount,
      getRetryDelay,
      onSuccess,
      onError,
      onSettled,
      // Include stringified deps to trigger refetch when they change
      JSON.stringify(deps),
    ]
  );

  // Initial fetch on mount and when deps change
  useEffect(() => {
    if (enabled) {
      fetchData({ force: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, JSON.stringify(deps)]);

  // Polling interval
  useEffect(() => {
    if (!refetchInterval || !enabled) {
      return;
    }

    intervalRef.current = window.setInterval(() => {
      if (isMountedRef.current) {
        fetchData({ silent: true });
      }
    }, refetchInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [refetchInterval, enabled, fetchData]);

  // Refetch on window focus
  useEffect(() => {
    if (!refetchOnWindowFocus || !enabled) {
      return;
    }

    const handleFocus = () => {
      if (isMountedRef.current && isStale()) {
        fetchData({ silent: true });
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [refetchOnWindowFocus, enabled, fetchData, isStale]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      // Cancel any in-flight request
      abortControllerRef.current?.abort();

      // Clear any pending retry
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }

      // Clear polling interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Memoize return value to prevent unnecessary re-renders
  return useMemo(
    () => ({
      data,
      error,
      status,
      isLoading,
      isFetching,
      isSuccess,
      isError,
      isIdle,
      refetch: fetchData,
      reset,
      setData: (updater: T | ((prev: T | undefined) => T | undefined)) => {
        setData((prev) =>
          typeof updater === 'function'
            ? (updater as (prev: T | undefined) => T | undefined)(prev)
            : updater
        );
      },
      dataUpdatedAt,
      failureCount,
    }),
    [
      data,
      error,
      status,
      isLoading,
      isFetching,
      isSuccess,
      isError,
      isIdle,
      fetchData,
      reset,
      dataUpdatedAt,
      failureCount,
    ]
  );
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * A simpler version of useAsyncData for one-time fetches.
 * Does not support polling or retries.
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useAsyncOnce(
 *   (signal) => fetchInitialConfig(signal)
 * );
 * ```
 */
export function useAsyncOnce<T>(
  asyncFn: AsyncFn<T>,
  options: Pick<UseAsyncDataOptions<T>, 'enabled' | 'initialData' | 'onSuccess' | 'onError' | 'deps'> = {}
): Pick<UseAsyncDataReturn<T>, 'data' | 'error' | 'isLoading' | 'isFetching' | 'isSuccess' | 'isError' | 'refetch'> {
  const result = useAsyncData(asyncFn, {
    ...options,
    refetchInterval: false,
    retryCount: 0,
    keepPreviousData: false,
  });

  return {
    data: result.data,
    error: result.error,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isSuccess: result.isSuccess,
    isError: result.isError,
    refetch: result.refetch,
  };
}

/**
 * Hook for async operations with manual triggering (mutations).
 * Does not auto-fetch on mount.
 *
 * @example
 * ```tsx
 * const { execute, isLoading, error, data } = useAsyncMutation(
 *   (signal, userId: string) => deleteUser(userId, signal)
 * );
 *
 * const handleDelete = async (userId: string) => {
 *   await execute(userId);
 * };
 * ```
 */
export function useAsyncMutation<T, TArgs extends unknown[] = []>(
  asyncFn: (signal: AbortSignal, ...args: TArgs) => Promise<T>,
  options: Pick<UseAsyncDataOptions<T>, 'onSuccess' | 'onError' | 'onSettled' | 'retryCount' | 'retryDelay'> = {}
): {
  execute: (...args: TArgs) => Promise<T | undefined>;
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  reset: () => void;
} {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const execute = useCallback(
    async (...args: TArgs): Promise<T | undefined> => {
      // Cancel any previous request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;

      setIsLoading(true);
      setStatus('loading');
      setError(null);

      try {
        const result = await asyncFn(signal, ...args);

        if (!isMountedRef.current || signal.aborted) {
          return undefined;
        }

        setData(result);
        setStatus('success');
        options.onSuccess?.(result);
        options.onSettled?.(result, null);

        return result;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return undefined;
        }

        if (!isMountedRef.current) {
          return undefined;
        }

        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setStatus('error');
        options.onError?.(error);
        options.onSettled?.(undefined, error);

        return undefined;
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [asyncFn, options]
  );

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setData(undefined);
    setError(null);
    setIsLoading(false);
    setStatus('idle');
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    execute,
    data,
    error,
    isLoading,
    isSuccess: status === 'success',
    isError: status === 'error',
    reset,
  };
}

// =============================================================================
// Export default
// =============================================================================

export default useAsyncData;
