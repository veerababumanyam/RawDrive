/**
 * useGallery Hook
 * Manages gallery data fetching and state
 */

import { useState, useEffect, useCallback } from 'react';
import { galleryService } from '../services/galleryService';
import type {
  GalleryDetailData,
  GalleryListResponse,
  GalleryCreateRequest,
  GalleryUpdateRequest,
} from '../types/gallery';

interface UseGalleryOptions {
  workspaceId: string;
  galleryId?: string;
  autoFetch?: boolean;
}

interface UseGalleryReturn {
  gallery: GalleryDetailData | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  updateGallery: (data: GalleryUpdateRequest) => Promise<void>;
  publishGallery: (publish: boolean) => Promise<void>;
  deleteGallery: () => Promise<void>;
}

export const useGallery = ({
  workspaceId,
  galleryId,
  autoFetch = true,
}: UseGalleryOptions): UseGalleryReturn => {
  const [gallery, setGallery] = useState<GalleryDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchGallery = useCallback(async () => {
    if (!galleryId) {
      setGallery(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await galleryService.getGallery(workspaceId, galleryId);
      setGallery(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch gallery'));
      setGallery(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, galleryId]);

  useEffect(() => {
    if (autoFetch && galleryId) {
      fetchGallery();
    }
  }, [autoFetch, galleryId, fetchGallery]);

  const updateGallery = useCallback(
    async (data: GalleryUpdateRequest) => {
      if (!galleryId) return;
      setLoading(true);
      setError(null);
      try {
        const updated = await galleryService.updateGallery(workspaceId, galleryId, data);
        setGallery(updated);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update gallery'));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, galleryId]
  );

  const publishGallery = useCallback(
    async (publish: boolean) => {
      if (!galleryId) return;
      setLoading(true);
      setError(null);
      try {
        const updated = publish
          ? await galleryService.publishGallery(workspaceId, galleryId)
          : await galleryService.unpublishGallery(workspaceId, galleryId);
        setGallery(updated);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to publish gallery'));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, galleryId]
  );

  const deleteGallery = useCallback(async () => {
    if (!galleryId) return;
    setLoading(true);
    setError(null);
    try {
      await galleryService.deleteGallery(workspaceId, galleryId);
      setGallery(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to delete gallery'));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [workspaceId, galleryId]);

  return {
    gallery,
    loading,
    error,
    refetch: fetchGallery,
    updateGallery,
    publishGallery,
    deleteGallery,
  };
};

interface UseGalleryListOptions {
  workspaceId: string;
  page?: number;
  limit?: number;
  sort?: 'created_at' | 'title' | 'status';
  status?: 'draft' | 'published' | 'archived';
  autoFetch?: boolean;
}

interface UseGalleryListReturn {
  galleries: GalleryListResponse['data'];
  meta: GalleryListResponse['meta'] | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createGallery: (data: GalleryCreateRequest) => Promise<GalleryDetailData>;
}

export const useGalleryList = ({
  workspaceId,
  page = 1,
  limit = 20,
  sort = 'created_at',
  status,
  autoFetch = true,
}: UseGalleryListOptions): UseGalleryListReturn => {
  const [galleries, setGalleries] = useState<GalleryListResponse['data']>([]);
  const [meta, setMeta] = useState<GalleryListResponse['meta'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchGalleries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await galleryService.listGalleries(workspaceId, {
        page,
        limit,
        sort,
        status,
      });
      setGalleries(response.data);
      setMeta(response.meta);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch galleries'));
      setGalleries([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, page, limit, sort, status]);

  useEffect(() => {
    if (autoFetch) {
      fetchGalleries();
    }
  }, [autoFetch, fetchGalleries]);

  const createGallery = useCallback(
    async (data: GalleryCreateRequest) => {
      if (!workspaceId || workspaceId.trim() === '') {
        const error = new Error('Workspace ID is required');
        setError(error);
        throw error;
      }

      setLoading(true);
      setError(null);
      try {
        const newGallery = await galleryService.createGallery(workspaceId, data);
        // Refresh list
        await fetchGalleries();
        return newGallery;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to create gallery'));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, fetchGalleries]
  );

  return {
    galleries,
    meta,
    loading,
    error,
    refetch: fetchGalleries,
    createGallery,
  };
};

