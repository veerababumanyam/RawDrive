/**
 * useAuditLogs Hook
 *
 * Custom hooks for managing audit logs in the compliance system.
 * Provides functionality for:
 * - Listing and searching audit logs with filtering
 * - Fetching individual audit log entries
 * - Creating and managing audit log exports
 * - Polling for export completion
 *
 * @module useAuditLogs
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui';
import {
  listAuditLogs,
  getAuditLogEntry,
  createAuditExport,
  getAuditExport,
  listAuditExports,
  getAuditExportDownloadUrl,
} from '../services/complianceService';
import type {
  AuditLogEntry,
  AuditLogSummary,
  AuditExport,
  ListAuditLogsQuery,
  CreateAuditExportRequest,
  AuditExportFormat,
  AuditExportStatus,
} from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// useAuditLogs Hook - List and search audit logs
// ---------------------------------------------------------------------------

export interface UseAuditLogsOptions extends ListAuditLogsQuery {
  /** Whether to automatically fetch on mount */
  autoFetch?: boolean;
  /** Interval in ms for auto-refresh (0 to disable) */
  refetchInterval?: number;
  /** Whether the hook is enabled */
  enabled?: boolean;
}

export interface UseAuditLogsReturn {
  /** Array of audit log summaries */
  logs: AuditLogSummary[];
  /** Pagination metadata */
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } | null;
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Whether a fetch is in progress */
  isFetching: boolean;
  /** Error if any occurred */
  error: Error | null;
  /** Refetch the logs */
  refetch: () => Promise<void>;
  /** Update filters and refetch */
  setFilters: (filters: ListAuditLogsQuery) => void;
  /** Go to a specific page */
  goToPage: (page: number) => void;
  /** Current active filters */
  filters: ListAuditLogsQuery;
}

export function useAuditLogs(options: UseAuditLogsOptions = {}): UseAuditLogsReturn {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const {
    autoFetch = true,
    refetchInterval = 0,
    enabled = true,
    ...initialFilters
  } = options;

  // State
  const [logs, setLogs] = useState<AuditLogSummary[]>([]);
  const [meta, setMeta] = useState<UseAuditLogsReturn['meta']>(null);
  const [filters, setFiltersState] = useState<ListAuditLogsQuery>(initialFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track mounted state
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch audit logs
  const fetchLogs = useCallback(async () => {
    if (!workspaceId || !enabled) {
      setIsLoading(false);
      return;
    }

    // Cancel previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setIsFetching(true);
    setError(null);

    try {
      const response = await listAuditLogs(workspaceId, filters);

      if (isMountedRef.current) {
        setLogs(response.data);
        setMeta(response.meta);
      }
    } catch (err) {
      if (isMountedRef.current && err instanceof Error && err.name !== 'AbortError') {
        setError(err);
        setLogs([]);
        setMeta(null);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsFetching(false);
      }
    }
  }, [workspaceId, enabled, filters]);

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;

    if (autoFetch) {
      fetchLogs();
    } else {
      setIsLoading(false);
    }

    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, [autoFetch, fetchLogs]);

  // Polling
  useEffect(() => {
    if (!refetchInterval || !enabled || !workspaceId) return;

    const intervalId = setInterval(fetchLogs, refetchInterval);
    return () => clearInterval(intervalId);
  }, [refetchInterval, enabled, workspaceId, fetchLogs]);

  // Update filters
  const setFilters = useCallback((newFilters: ListAuditLogsQuery) => {
    setFiltersState((prev) => ({
      ...prev,
      ...newFilters,
      page: newFilters.page ?? 1, // Reset to page 1 when filters change unless page is specified
    }));
  }, []);

  // Go to page
  const goToPage = useCallback((page: number) => {
    setFiltersState((prev) => ({
      ...prev,
      page,
    }));
  }, []);

  return {
    logs,
    meta,
    isLoading,
    isFetching,
    error,
    refetch: fetchLogs,
    setFilters,
    goToPage,
    filters,
  };
}

// ---------------------------------------------------------------------------
// useAuditLogEntry Hook - Fetch a single audit log entry
// ---------------------------------------------------------------------------

export interface UseAuditLogEntryOptions {
  /** Event ID to fetch */
  eventId?: string;
  /** Whether to automatically fetch on mount */
  autoFetch?: boolean;
  /** Whether the hook is enabled */
  enabled?: boolean;
}

export interface UseAuditLogEntryReturn {
  /** The audit log entry */
  entry: AuditLogEntry | null;
  /** Whether loading is in progress */
  isLoading: boolean;
  /** Error if any occurred */
  error: Error | null;
  /** Refetch the entry */
  refetch: () => Promise<void>;
}

export function useAuditLogEntry(options: UseAuditLogEntryOptions = {}): UseAuditLogEntryReturn {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const { eventId, autoFetch = true, enabled = true } = options;

  // State
  const [entry, setEntry] = useState<AuditLogEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Track mounted state
  const isMountedRef = useRef(true);

  // Fetch entry
  const fetchEntry = useCallback(async () => {
    if (!workspaceId || !eventId || !enabled) {
      setIsLoading(false);
      setEntry(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await getAuditLogEntry(workspaceId, eventId);

      if (isMountedRef.current) {
        setEntry(data);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error('Failed to fetch audit log entry'));
        setEntry(null);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [workspaceId, eventId, enabled]);

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;

    if (autoFetch && eventId) {
      fetchEntry();
    } else {
      setIsLoading(false);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [autoFetch, eventId, fetchEntry]);

  return {
    entry,
    isLoading,
    error,
    refetch: fetchEntry,
  };
}

// ---------------------------------------------------------------------------
// useAuditExports Hook - List and manage audit exports
// ---------------------------------------------------------------------------

export interface UseAuditExportsOptions {
  /** Page number */
  page?: number;
  /** Items per page */
  limit?: number;
  /** Whether to automatically fetch on mount */
  autoFetch?: boolean;
  /** Interval in ms for auto-refresh (0 to disable) */
  refetchInterval?: number;
  /** Whether the hook is enabled */
  enabled?: boolean;
}

export interface UseAuditExportsReturn {
  /** Array of audit exports */
  exports: AuditExport[];
  /** Pagination metadata */
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } | null;
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Whether a fetch is in progress */
  isFetching: boolean;
  /** Error if any occurred */
  error: Error | null;
  /** Refetch the exports */
  refetch: () => Promise<void>;
  /** Create a new export */
  createExport: (request?: CreateAuditExportRequest) => Promise<AuditExport>;
  /** Whether export creation is in progress */
  isCreating: boolean;
  /** Get download URL for an export */
  getDownloadUrl: (exportId: string) => Promise<{ download_url: string; expires_at: string }>;
}

export function useAuditExports(options: UseAuditExportsOptions = {}): UseAuditExportsReturn {
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const workspaceId = workspace?.workspace_id;

  const {
    page = 1,
    limit = 20,
    autoFetch = true,
    refetchInterval = 0,
    enabled = true,
  } = options;

  // State
  const [exports, setExports] = useState<AuditExport[]>([]);
  const [meta, setMeta] = useState<UseAuditExportsReturn['meta']>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track mounted state
  const isMountedRef = useRef(true);

  // Fetch exports
  const fetchExports = useCallback(async () => {
    if (!workspaceId || !enabled) {
      setIsLoading(false);
      return;
    }

    setIsFetching(true);
    setError(null);

    try {
      const response = await listAuditExports(workspaceId, { page, limit });

      if (isMountedRef.current) {
        setExports(response.data);
        setMeta(response.meta);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error('Failed to fetch audit exports'));
        setExports([]);
        setMeta(null);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsFetching(false);
      }
    }
  }, [workspaceId, enabled, page, limit]);

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;

    if (autoFetch) {
      fetchExports();
    } else {
      setIsLoading(false);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [autoFetch, fetchExports]);

  // Polling
  useEffect(() => {
    if (!refetchInterval || !enabled || !workspaceId) return;

    const intervalId = setInterval(fetchExports, refetchInterval);
    return () => clearInterval(intervalId);
  }, [refetchInterval, enabled, workspaceId, fetchExports]);

  // Create export
  const createExportFn = useCallback(
    async (request?: CreateAuditExportRequest): Promise<AuditExport> => {
      if (!workspaceId) {
        throw new Error('Workspace ID is required');
      }

      setIsCreating(true);
      try {
        const newExport = await createAuditExport(workspaceId, request);

        addToast({
          variant: 'success',
          title: 'Export Started',
          message: 'Your audit log export is being generated. This may take a few minutes.',
          duration: 5000,
        });

        // Refresh exports list
        await fetchExports();

        return newExport;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create export';
        addToast({
          variant: 'error',
          title: 'Export Failed',
          message: errorMessage,
          duration: 5000,
        });
        throw err;
      } finally {
        setIsCreating(false);
      }
    },
    [workspaceId, addToast, fetchExports]
  );

  // Get download URL
  const getDownloadUrl = useCallback(
    async (exportId: string): Promise<{ download_url: string; expires_at: string }> => {
      if (!workspaceId) {
        throw new Error('Workspace ID is required');
      }

      return getAuditExportDownloadUrl(workspaceId, exportId);
    },
    [workspaceId]
  );

  return {
    exports,
    meta,
    isLoading,
    isFetching,
    error,
    refetch: fetchExports,
    createExport: createExportFn,
    isCreating,
    getDownloadUrl,
  };
}

// ---------------------------------------------------------------------------
// useAuditExport Hook - Fetch a single export with polling for completion
// ---------------------------------------------------------------------------

export interface UseAuditExportOptions {
  /** Export ID to fetch */
  exportId?: string;
  /** Whether to automatically fetch on mount */
  autoFetch?: boolean;
  /** Whether to poll while export is processing */
  pollWhileProcessing?: boolean;
  /** Polling interval in ms */
  pollInterval?: number;
  /** Whether the hook is enabled */
  enabled?: boolean;
}

export interface UseAuditExportReturn {
  /** The audit export */
  auditExport: AuditExport | null;
  /** Whether loading is in progress */
  isLoading: boolean;
  /** Whether polling is active */
  isPolling: boolean;
  /** Error if any occurred */
  error: Error | null;
  /** Refetch the export */
  refetch: () => Promise<void>;
  /** Get download URL */
  getDownloadUrl: () => Promise<{ download_url: string; expires_at: string }>;
  /** Whether download is ready */
  isReady: boolean;
  /** Whether export failed */
  isFailed: boolean;
}

export function useAuditExport(options: UseAuditExportOptions = {}): UseAuditExportReturn {
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const workspaceId = workspace?.workspace_id;

  const {
    exportId,
    autoFetch = true,
    pollWhileProcessing = true,
    pollInterval = 5000,
    enabled = true,
  } = options;

  // State
  const [auditExport, setAuditExport] = useState<AuditExport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track mounted state
  const isMountedRef = useRef(true);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Determine status
  const isReady = auditExport?.status === 'completed';
  const isFailed = auditExport?.status === 'failed';
  const isProcessing = auditExport?.status === 'pending' || auditExport?.status === 'processing';

  // Fetch export
  const fetchExport = useCallback(async () => {
    if (!workspaceId || !exportId || !enabled) {
      setIsLoading(false);
      setAuditExport(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await getAuditExport(workspaceId, exportId);

      if (isMountedRef.current) {
        setAuditExport(data);

        // Notify when export completes
        if (data.status === 'completed' && isPolling) {
          addToast({
            variant: 'success',
            title: 'Export Complete',
            message: 'Your audit log export is ready for download.',
            duration: 5000,
          });
        } else if (data.status === 'failed' && isPolling) {
          addToast({
            variant: 'error',
            title: 'Export Failed',
            message: data.error_message || 'The export could not be completed.',
            duration: 5000,
          });
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error('Failed to fetch audit export'));
        setAuditExport(null);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [workspaceId, exportId, enabled, isPolling, addToast]);

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;

    if (autoFetch && exportId) {
      fetchExport();
    } else {
      setIsLoading(false);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [autoFetch, exportId, fetchExport]);

  // Polling for processing exports
  useEffect(() => {
    if (!pollWhileProcessing || !isProcessing || !enabled || !exportId) {
      setIsPolling(false);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    setIsPolling(true);
    pollIntervalRef.current = setInterval(fetchExport, pollInterval);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [pollWhileProcessing, isProcessing, enabled, exportId, pollInterval, fetchExport]);

  // Get download URL
  const getDownloadUrlFn = useCallback(async (): Promise<{ download_url: string; expires_at: string }> => {
    if (!workspaceId || !exportId) {
      throw new Error('Export ID is required');
    }

    if (!isReady) {
      throw new Error('Export is not ready for download');
    }

    return getAuditExportDownloadUrl(workspaceId, exportId);
  }, [workspaceId, exportId, isReady]);

  return {
    auditExport,
    isLoading,
    isPolling,
    error,
    refetch: fetchExport,
    getDownloadUrl: getDownloadUrlFn,
    isReady,
    isFailed,
  };
}

// ---------------------------------------------------------------------------
// useAuditLogSearch Hook - Convenience hook for searching audit logs
// ---------------------------------------------------------------------------

export interface UseAuditLogSearchOptions {
  /** Initial search query */
  initialSearch?: string;
  /** Debounce delay in ms */
  debounceMs?: number;
  /** Default filters */
  defaultFilters?: Omit<ListAuditLogsQuery, 'search' | 'page'>;
  /** Whether the hook is enabled */
  enabled?: boolean;
}

export interface UseAuditLogSearchReturn extends Omit<UseAuditLogsReturn, 'setFilters'> {
  /** Current search query */
  search: string;
  /** Update search query (debounced) */
  setSearch: (query: string) => void;
  /** Clear search and reset to defaults */
  clearSearch: () => void;
  /** Update individual filter */
  setFilter: <K extends keyof ListAuditLogsQuery>(key: K, value: ListAuditLogsQuery[K]) => void;
}

export function useAuditLogSearch(options: UseAuditLogSearchOptions = {}): UseAuditLogSearchReturn {
  const {
    initialSearch = '',
    debounceMs = 300,
    defaultFilters = {},
    enabled = true,
  } = options;

  // Local search state for debouncing
  const [search, setSearchLocal] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [search, debounceMs]);

  // Use the main audit logs hook with debounced search
  const auditLogs = useAuditLogs({
    ...defaultFilters,
    search: debouncedSearch || undefined,
    enabled,
  });

  // Set search
  const setSearch = useCallback((query: string) => {
    setSearchLocal(query);
  }, []);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchLocal('');
    auditLogs.setFilters({
      ...defaultFilters,
      search: undefined,
      page: 1,
    });
  }, [auditLogs, defaultFilters]);

  // Set individual filter
  const setFilter = useCallback(<K extends keyof ListAuditLogsQuery>(
    key: K,
    value: ListAuditLogsQuery[K]
  ) => {
    auditLogs.setFilters({
      ...auditLogs.filters,
      [key]: value,
      page: key === 'page' ? value as number : 1,
    });
  }, [auditLogs]);

  return {
    ...auditLogs,
    search,
    setSearch,
    clearSearch,
    setFilter,
  };
}

// ---------------------------------------------------------------------------
// Export types
// ---------------------------------------------------------------------------

export type {
  AuditLogEntry,
  AuditLogSummary,
  AuditExport,
  ListAuditLogsQuery,
  CreateAuditExportRequest,
  AuditExportFormat,
  AuditExportStatus,
};
