/**
 * React Query hooks for gallery data
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listGalleries,
  getGallery,
  createGallery,
  updateGallery,
  deleteGallery,
  publishGallery,
  archiveGallery,
  listAssets,
  starAsset,
  unstarAsset,
  rejectAsset,
  unrejectAsset,
  getGalleryStats,
} from '../services/galleryService';

// Query keys
export const galleryKeys = {
  all: ['galleries'] as const,
  lists: () => [...galleryKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...galleryKeys.lists(), filters] as const,
  details: () => [...galleryKeys.all, 'detail'] as const,
  detail: (id: string) => [...galleryKeys.details(), id] as const,
  assets: (galleryId: string) => [...galleryKeys.all, 'assets', galleryId] as const,
  stats: (galleryId: string) => [...galleryKeys.all, 'stats', galleryId] as const,
};

/**
 * Fetch galleries list
 */
export function useGalleries(params?: {
  page?: number;
  pageSize?: number;
  status?: 'draft' | 'published' | 'archived' | 'all';
  search?: string;
  sortBy?: 'created_at' | 'updated_at' | 'name' | 'view_count';
  sortOrder?: 'asc' | 'desc';
}) {
  return useQuery({
    queryKey: galleryKeys.list(params || {}),
    queryFn: async () => {
      const result = await listGalleries(params);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
  });
}

/**
 * Fetch single gallery
 */
export function useGallery(galleryId: string) {
  return useQuery({
    queryKey: galleryKeys.detail(galleryId),
    queryFn: async () => {
      const result = await getGallery(galleryId);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    enabled: !!galleryId,
  });
}

/**
 * Fetch gallery assets
 */
export function useGalleryAssets(
  galleryId: string,
  params?: {
    page?: number;
    pageSize?: number;
    starred?: boolean;
    rejected?: boolean;
  }
) {
  return useQuery({
    queryKey: [...galleryKeys.assets(galleryId), params],
    queryFn: async () => {
      const result = await listAssets(galleryId, params);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    enabled: !!galleryId,
  });
}

/**
 * Fetch gallery stats
 */
export function useGalleryStats(galleryId: string) {
  return useQuery({
    queryKey: galleryKeys.stats(galleryId),
    queryFn: async () => {
      const result = await getGalleryStats(galleryId);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    enabled: !!galleryId,
  });
}

/**
 * Create gallery mutation
 */
export function useCreateGallery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      clientName?: string;
      eventDate?: string;
    }) => {
      const result = await createGallery(data);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: galleryKeys.lists() });
    },
  });
}

/**
 * Update gallery mutation
 */
export function useUpdateGallery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      galleryId,
      data,
    }: {
      galleryId: string;
      data: {
        name?: string;
        description?: string;
        status?: 'draft' | 'published' | 'archived';
        clientName?: string;
        eventDate?: string;
      };
    }) => {
      const result = await updateGallery(galleryId, data);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: galleryKeys.detail(variables.galleryId) });
      queryClient.invalidateQueries({ queryKey: galleryKeys.lists() });
    },
  });
}

/**
 * Delete gallery mutation
 */
export function useDeleteGallery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (galleryId: string) => {
      const result = await deleteGallery(galleryId);
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: galleryKeys.lists() });
    },
  });
}

/**
 * Publish gallery mutation
 */
export function usePublishGallery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (galleryId: string) => {
      const result = await publishGallery(galleryId);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    onSuccess: (_, galleryId) => {
      queryClient.invalidateQueries({ queryKey: galleryKeys.detail(galleryId) });
      queryClient.invalidateQueries({ queryKey: galleryKeys.lists() });
    },
  });
}

/**
 * Archive gallery mutation
 */
export function useArchiveGallery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (galleryId: string) => {
      const result = await archiveGallery(galleryId);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    onSuccess: (_, galleryId) => {
      queryClient.invalidateQueries({ queryKey: galleryKeys.detail(galleryId) });
      queryClient.invalidateQueries({ queryKey: galleryKeys.lists() });
    },
  });
}

/**
 * Star asset mutation
 */
export function useStarAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ galleryId, assetId }: { galleryId: string; assetId: string }) => {
      const result = await starAsset(galleryId, assetId);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: galleryKeys.assets(variables.galleryId) });
    },
  });
}

/**
 * Unstar asset mutation
 */
export function useUnstarAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ galleryId, assetId }: { galleryId: string; assetId: string }) => {
      const result = await unstarAsset(galleryId, assetId);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: galleryKeys.assets(variables.galleryId) });
    },
  });
}

/**
 * Reject asset mutation
 */
export function useRejectAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ galleryId, assetId }: { galleryId: string; assetId: string }) => {
      const result = await rejectAsset(galleryId, assetId);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: galleryKeys.assets(variables.galleryId) });
    },
  });
}

/**
 * Unreject asset mutation
 */
export function useUnrejectAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ galleryId, assetId }: { galleryId: string; assetId: string }) => {
      const result = await unrejectAsset(galleryId, assetId);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: galleryKeys.assets(variables.galleryId) });
    },
  });
}
