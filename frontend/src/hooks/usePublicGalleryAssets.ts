import { useQuery } from '@tanstack/react-query';
import { galleryService } from '../services/galleryService';
import type { PublicGalleryAsset } from '../types/gallery';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WorkflowTab = 'all' | 'favorites' | 'selections';

interface UsePublicGalleryAssetsOptions {
  /** Active workflow tab filter */
  activeTab?: WorkflowTab;
  /** Active sub-gallery ID filter */
  subGalleryId?: string | null;
  /** Active emotion filter */
  emotion?: string | null;
  /** Minimum emotion confidence threshold */
  minEmotionConfidence?: number;
  /** Whether the caller is ready to fetch (auth gates passed) */
  enabled?: boolean;
}

export interface UsePublicGalleryAssetsResult {
  /** The loaded assets array */
  assets: PublicGalleryAsset[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function */
  refetch: () => void;
  /** Whether a refetch is in progress */
  isRefetching: boolean;
}

/**
 * TanStack Query hook for fetching public gallery assets with filtering.
 * Supports workflow tabs (all/favorites/selections), sub-gallery, and
 * emotion-based filtering.
 *
 * @param galleryId - The actual gallery UUID (not the magic-link token)
 * @param options - Filtering and control options
 */
export function usePublicGalleryAssets(
  galleryId: string | null,
  options: UsePublicGalleryAssetsOptions = {},
): UsePublicGalleryAssetsResult {
  const {
    activeTab = 'all',
    subGalleryId,
    emotion,
    minEmotionConfidence = 0.7,
    enabled = true,
  } = options;

  const query = useQuery({
    queryKey: [
      'public-gallery-assets',
      galleryId,
      activeTab,
      subGalleryId ?? null,
      emotion ?? null,
    ],
    queryFn: async (): Promise<PublicGalleryAsset[]> => {
      if (!galleryId) return [];

      const filterType = activeTab === 'all' ? undefined : activeTab;
      return galleryService.getPublicGalleryAssetsFiltered(
        galleryId,
        filterType as 'favorites' | 'selections' | undefined,
        subGalleryId || undefined,
        emotion ? { emotion, minEmotionConfidence } : undefined,
      );
    },
    enabled: !!galleryId && enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  return {
    assets: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  };
}
