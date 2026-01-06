/**
 * useGalleryExport Hook
 *
 * React hook for managing gallery exports with polling support.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  galleryExportService,
  type CreateGalleryExportParams,
  type ListGalleryExportsParams,
  type BatchExportParams,
} from '@/services/galleryExportService';
import type {
  GalleryExport,
  ExportFormat,
  ExportStatus,
  ZipExportConfig,
  PDFExportConfig,
  SlideshowExportConfig,
  CloudSyncConfig,
  ExportStats,
  CloudProviderConnection,
} from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const exportQueryKeys = {
  all: ['exports'] as const,
  lists: () => [...exportQueryKeys.all, 'list'] as const,
  list: (params: ListGalleryExportsParams) => [...exportQueryKeys.lists(), params] as const,
  details: () => [...exportQueryKeys.all, 'detail'] as const,
  detail: (workspaceId: string, exportId: string) =>
    [...exportQueryKeys.details(), workspaceId, exportId] as const,
  stats: (workspaceId: string) => [...exportQueryKeys.all, 'stats', workspaceId] as const,
  cloudConnections: (workspaceId: string) =>
    [...exportQueryKeys.all, 'cloud', workspaceId] as const,
};

// ---------------------------------------------------------------------------
// useExportsList Hook
// ---------------------------------------------------------------------------

interface UseExportsListOptions {
  workspaceId: string;
  galleryId?: string;
  format?: ExportFormat;
  status?: ExportStatus;
  page?: number;
  limit?: number;
  enabled?: boolean;
  pollInterval?: number;
}

export function useExportsList(options: UseExportsListOptions) {
  const {
    workspaceId,
    galleryId,
    format,
    status,
    page = 1,
    limit = 20,
    enabled = true,
    pollInterval = 0,
  } = options;

  const params: ListGalleryExportsParams = {
    workspaceId,
    galleryId,
    format,
    status,
    page,
    limit,
  };

  return useQuery({
    queryKey: exportQueryKeys.list(params),
    queryFn: () => galleryExportService.listExports(params),
    enabled,
    refetchInterval: pollInterval > 0 ? pollInterval : undefined,
    staleTime: 10000,
  });
}

// ---------------------------------------------------------------------------
// useExportDetail Hook
// ---------------------------------------------------------------------------

interface UseExportDetailOptions {
  workspaceId: string;
  exportId: string;
  enabled?: boolean;
  pollWhileProcessing?: boolean;
}

export function useExportDetail(options: UseExportDetailOptions) {
  const {
    workspaceId,
    exportId,
    enabled = true,
    pollWhileProcessing = true,
  } = options;

  const query = useQuery({
    queryKey: exportQueryKeys.detail(workspaceId, exportId),
    queryFn: () => galleryExportService.getExport(workspaceId, exportId),
    enabled: enabled && !!exportId,
    staleTime: 5000,
  });

  // Poll while processing
  const isProcessing = query.data && !galleryExportService.isExportComplete(query.data.status as ExportStatus);

  useEffect(() => {
    if (!pollWhileProcessing || !isProcessing) return;

    const interval = setInterval(() => {
      query.refetch();
    }, 2000);

    return () => clearInterval(interval);
  }, [pollWhileProcessing, isProcessing, query]);

  return query;
}

// ---------------------------------------------------------------------------
// useExportStats Hook
// ---------------------------------------------------------------------------

export function useExportStats(workspaceId: string, enabled = true) {
  return useQuery({
    queryKey: exportQueryKeys.stats(workspaceId),
    queryFn: () => galleryExportService.getExportStats(workspaceId),
    enabled: enabled && !!workspaceId,
    staleTime: 60000,
  });
}

// ---------------------------------------------------------------------------
// useCloudConnections Hook
// ---------------------------------------------------------------------------

export function useCloudConnections(workspaceId: string, enabled = true) {
  return useQuery({
    queryKey: exportQueryKeys.cloudConnections(workspaceId),
    queryFn: () => galleryExportService.listCloudConnections(workspaceId),
    enabled: enabled && !!workspaceId,
    staleTime: 30000,
  });
}

// ---------------------------------------------------------------------------
// useCreateExport Hook
// ---------------------------------------------------------------------------

export function useCreateExport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateGalleryExportParams) =>
      galleryExportService.createExport(params),
    onSuccess: (data, variables) => {
      // Invalidate export lists
      queryClient.invalidateQueries({
        queryKey: exportQueryKeys.lists(),
      });
      // Also invalidate stats
      queryClient.invalidateQueries({
        queryKey: exportQueryKeys.stats(variables.workspaceId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// useCancelExport Hook
// ---------------------------------------------------------------------------

export function useCancelExport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workspaceId,
      exportId,
      reason,
    }: {
      workspaceId: string;
      exportId: string;
      reason?: string;
    }) => galleryExportService.cancelExport(workspaceId, exportId, reason),
    onSuccess: (data, variables) => {
      // Update cache directly
      queryClient.setQueryData(
        exportQueryKeys.detail(variables.workspaceId, variables.exportId),
        data
      );
      // Invalidate lists
      queryClient.invalidateQueries({
        queryKey: exportQueryKeys.lists(),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// useRetryExport Hook
// ---------------------------------------------------------------------------

export function useRetryExport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workspaceId,
      exportId,
      modifiedConfig,
    }: {
      workspaceId: string;
      exportId: string;
      modifiedConfig?: Partial<ZipExportConfig | PDFExportConfig | SlideshowExportConfig | CloudSyncConfig>;
    }) => galleryExportService.retryExport(workspaceId, exportId, modifiedConfig),
    onSuccess: (_, variables) => {
      // Invalidate lists to show new export
      queryClient.invalidateQueries({
        queryKey: exportQueryKeys.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: exportQueryKeys.stats(variables.workspaceId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// useBatchExport Hook
// ---------------------------------------------------------------------------

export function useBatchExport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: BatchExportParams) =>
      galleryExportService.createBatchExport(params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: exportQueryKeys.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: exportQueryKeys.stats(variables.workspaceId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// useDisconnectCloudProvider Hook
// ---------------------------------------------------------------------------

export function useDisconnectCloudProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workspaceId,
      provider,
    }: {
      workspaceId: string;
      provider: string;
    }) => galleryExportService.disconnectCloudProvider(workspaceId, provider),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: exportQueryKeys.cloudConnections(variables.workspaceId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// useGalleryExport Composite Hook
// ---------------------------------------------------------------------------

interface UseGalleryExportOptions {
  workspaceId: string;
  galleryId?: string;
}

export function useGalleryExport(options: UseGalleryExportOptions) {
  const { workspaceId, galleryId } = options;
  const queryClient = useQueryClient();

  // List exports
  const exportsQuery = useExportsList({
    workspaceId,
    galleryId,
    enabled: !!workspaceId,
    pollInterval: 5000,
  });

  // Stats
  const statsQuery = useExportStats(workspaceId);

  // Cloud connections
  const cloudQuery = useCloudConnections(workspaceId);

  // Mutations
  const createExport = useCreateExport();
  const cancelExport = useCancelExport();
  const retryExport = useRetryExport();
  const batchExport = useBatchExport();
  const disconnectCloud = useDisconnectCloudProvider();

  // Track active export for progress polling
  const [activeExportId, setActiveExportId] = useState<string | null>(null);

  const activeExportQuery = useExportDetail({
    workspaceId,
    exportId: activeExportId || '',
    enabled: !!activeExportId,
    pollWhileProcessing: true,
  });

  // Clear active export when complete
  useEffect(() => {
    if (
      activeExportQuery.data &&
      galleryExportService.isExportComplete(activeExportQuery.data.status as ExportStatus)
    ) {
      // Keep showing for 2 seconds, then clear
      const timeout = setTimeout(() => {
        setActiveExportId(null);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [activeExportQuery.data]);

  // Create export with progress tracking
  const createWithProgress = useCallback(
    async (params: Omit<CreateGalleryExportParams, 'workspaceId'>) => {
      const result = await createExport.mutateAsync({
        ...params,
        workspaceId,
      });
      setActiveExportId(result.exportId);
      return result;
    },
    [workspaceId, createExport]
  );

  return {
    // Data
    exports: exportsQuery.data?.data || [],
    pagination: exportsQuery.data?.meta,
    stats: statsQuery.data,
    cloudConnections: cloudQuery.data || [],
    activeExport: activeExportQuery.data,

    // Loading states
    isLoading: exportsQuery.isLoading,
    isLoadingStats: statsQuery.isLoading,
    isLoadingCloud: cloudQuery.isLoading,
    isCreating: createExport.isPending,

    // Actions
    createExport: createWithProgress,
    cancelExport: (exportId: string, reason?: string) =>
      cancelExport.mutateAsync({ workspaceId, exportId, reason }),
    retryExport: (exportId: string) =>
      retryExport.mutateAsync({ workspaceId, exportId }),
    createBatchExport: (params: Omit<BatchExportParams, 'workspaceId'>) =>
      batchExport.mutateAsync({ ...params, workspaceId }),
    disconnectCloudProvider: (provider: string) =>
      disconnectCloud.mutateAsync({ workspaceId, provider }),

    // Refresh
    refetch: () => {
      exportsQuery.refetch();
      statsQuery.refetch();
      cloudQuery.refetch();
    },

    // Helpers
    getDefaultConfig: galleryExportService.getDefaultConfig,
    getFormatDisplayName: galleryExportService.getFormatDisplayName,
    getStatusColor: galleryExportService.getStatusColor,
    formatFileSize: galleryExportService.formatFileSize,
    isExportComplete: galleryExportService.isExportComplete,
    canCancelExport: galleryExportService.canCancelExport,
    canRetryExport: galleryExportService.canRetryExport,
  };
}

export default useGalleryExport;
