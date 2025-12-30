/**
 * Shared Links Hook
 * Custom hooks for Security & Sharing Dashboard operations
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  sharedService,
  SharedLinksResponse,
  SharedLinkDetail,
  SharedStats,
  BulkRevokeResponse,
  ListLinksOptions,
} from '../services/sharedService';

/**
 * Hook for listing shared links with filtering and pagination
 */
export function useSharedLinks(
  workspaceId: string | undefined,
  options?: ListLinksOptions
) {
  const [data, setData] = useState<SharedLinksResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchLinks = useCallback(async () => {
    if (!workspaceId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await sharedService.listLinks(workspaceId, options);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch links'));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, options?.limit, options?.offset, options?.status, options?.exclude_revoked, options?.gallery_id, options?.search, options?.sort_by, options?.sort_order]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchLinks,
  };
}

/**
 * Hook for getting detailed link information
 */
export function useSharedLinkDetail(
  workspaceId: string | undefined,
  linkId: string | undefined
) {
  const [data, setData] = useState<SharedLinkDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!workspaceId || !linkId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await sharedService.getLinkDetail(workspaceId, linkId);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch link details'));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, linkId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchDetail,
  };
}

/**
 * Hook for getting sharing statistics
 */
export function useShareStats(workspaceId: string | undefined, days: number = 30) {
  const [data, setData] = useState<SharedStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = useCallback(async () => {
    if (!workspaceId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await sharedService.getStats(workspaceId, days);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch stats'));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, days]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchStats,
  };
}

/**
 * Hook for revoking links
 */
export function useRevokeLink(workspaceId: string | undefined) {
  const [isPending, setIsPending] = useState(false);

  const revokeLink = useCallback(
    async (linkId: string): Promise<void> => {
      if (!workspaceId) throw new Error('Workspace ID required');

      setIsPending(true);
      try {
        await sharedService.revokeLink(workspaceId, linkId);
      } finally {
        setIsPending(false);
      }
    },
    [workspaceId]
  );

  return { revokeLink, isPending };
}

/**
 * Hook for bulk revoking links (Kill Switch)
 */
export function useBulkRevoke(workspaceId: string | undefined) {
  const [isPending, setIsPending] = useState(false);

  const bulkRevoke = useCallback(
    async (linkIds: string[], reason?: string): Promise<BulkRevokeResponse> => {
      if (!workspaceId) throw new Error('Workspace ID required');

      setIsPending(true);
      try {
        return await sharedService.bulkRevoke(workspaceId, linkIds, reason);
      } finally {
        setIsPending(false);
      }
    },
    [workspaceId]
  );

  return { bulkRevoke, isPending };
}

/**
 * Hook for exporting sharing data
 */
export function useExportSharedData(workspaceId: string | undefined) {
  const [isExporting, setIsExporting] = useState(false);

  const exportData = useCallback(
    async (options?: { format?: 'csv' | 'json'; date_from?: string; date_to?: string }) => {
      if (!workspaceId) throw new Error('Workspace ID required');

      setIsExporting(true);
      try {
        await sharedService.downloadExport(workspaceId, options);
      } finally {
        setIsExporting(false);
      }
    },
    [workspaceId]
  );

  return { exportData, isExporting };
}

/**
 * Combined hook for shared dashboard state management
 */
export function useSharedDashboard(workspaceId: string | undefined) {
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<string>>(new Set());
  // Default to hiding revoked links (they're kept for 90 days for audit then auto-purged)
  const [hideRevoked, setHideRevoked] = useState(true);
  const [filterOptions, setFilterOptions] = useState<ListLinksOptions>({
    limit: 25,
    offset: 0,
    status: 'all', // Show all non-revoked by default, use exclude_revoked param
    sort_by: 'created_at',
    sort_order: 'desc',
  });

  // Merge hideRevoked into filterOptions for the API call
  const effectiveFilterOptions = useMemo(() => ({
    ...filterOptions,
    exclude_revoked: hideRevoked,
  }), [filterOptions, hideRevoked]);

  const { data: linksData, isLoading: isLoadingLinks, error: linksError, refetch } = useSharedLinks(
    workspaceId,
    effectiveFilterOptions
  );
  const { data: stats, isLoading: isLoadingStats, error: statsError } = useShareStats(workspaceId);
  const { revokeLink, isPending: isRevoking } = useRevokeLink(workspaceId);
  const { bulkRevoke, isPending: isBulkRevoking } = useBulkRevoke(workspaceId);
  const { exportData, isExporting } = useExportSharedData(workspaceId);

  const handleSelectionChange = useCallback((keys: Set<string | number>) => {
    setSelectedLinkIds(new Set(Array.from(keys).map(String)));
  }, []);

  const handleFilterChange = useCallback((newOptions: Partial<ListLinksOptions>) => {
    setFilterOptions((prev) => ({
      ...prev,
      ...newOptions,
      // Reset offset when filters change (except for pagination)
      offset: 'offset' in newOptions ? newOptions.offset! : 0,
    }));
  }, []);

  const handlePageChange = useCallback(
    (page: number) => {
      const limit = filterOptions.limit || 25;
      setFilterOptions((prev) => ({
        ...prev,
        offset: (page - 1) * limit,
      }));
    },
    [filterOptions.limit]
  );

  const clearSelection = useCallback(() => {
    setSelectedLinkIds(new Set());
  }, []);

  // Wrapper for revokeLink that triggers refetch
  const handleRevokeLink = useCallback(
    async (linkId: string): Promise<void> => {
      await revokeLink(linkId);
      refetch();
    },
    [revokeLink, refetch]
  );

  // Wrapper for bulkRevoke that triggers refetch
  const handleBulkRevoke = useCallback(
    async (params: { linkIds: string[]; reason?: string }): Promise<BulkRevokeResponse> => {
      const result = await bulkRevoke(params.linkIds, params.reason);
      refetch();
      return result;
    },
    [bulkRevoke, refetch]
  );

  // Toggle handler for hideRevoked
  const toggleHideRevoked = useCallback(() => {
    setHideRevoked((prev) => !prev);
  }, []);

  return {
    // Data
    links: linksData?.data || [],
    meta: linksData?.meta,
    stats,

    // Loading states
    isLoadingLinks,
    isLoadingStats,
    isRevoking,
    isBulkRevoking,
    isExporting,

    // Errors
    linksError,
    statsError,

    // Selection
    selectedLinkIds,
    handleSelectionChange,
    clearSelection,

    // Filters
    filterOptions,
    handleFilterChange,
    handlePageChange,
    hideRevoked,
    toggleHideRevoked,

    // Actions
    revokeLink: handleRevokeLink,
    bulkRevoke: handleBulkRevoke,
    exportData,
    refetch,
  };
}

export default useSharedDashboard;
