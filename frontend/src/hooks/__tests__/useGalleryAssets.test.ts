
import { renderHook, act, waitFor } from '@testing-library/react';
import { useGalleryAssets } from '../useGalleryAssets';
import { galleryService } from '../../services/galleryService';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// Mock gallery service
vi.mock('../../services/galleryService', () => ({
  galleryService: {
    listGalleryAssets: vi.fn(),
  },
}));

const mockAssets = [
  {
    asset_id: '1',
    gallery_asset_id: 'ga-1',
    is_favorited: false,
    asset: { filename: 'test1.jpg' },
  },
  {
    asset_id: '2',
    gallery_asset_id: 'ga-2',
    is_favorited: true,
    asset: { filename: 'test2.jpg' },
  },
];

describe('useGalleryAssets Property Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

  it('Property 10: Favorite Toggle Round Trip (Optimistic Update)', async () => {
     // Setup mock response
     (galleryService.listGalleryAssets as any).mockResolvedValue({
         data: mockAssets,
         meta: { total: 2, page: 1, limit: 50, hasMore: false }
     });

     const { result } = renderHook(() =>
       useGalleryAssets({
         workspaceId: 'ws-1',
         galleryId: 'gal-1',
         autoFetch: true,
       })
     );

     // Wait for initial load
     await waitFor(() => expect(result.current.loading).toBe(false));
     expect(result.current.assets).toHaveLength(2);

     await fc.assert(
       fc.asyncProperty(
         fc.boolean(), // newFavoriteState
         async (newFavorite) => {
           // We will toggle the first asset
           const targetAssetId = '1';
           
           // Perform optimistic update
           act(() => {
             result.current.updateAsset(targetAssetId, { is_favorited: newFavorite });
           });

           // Verify immediate state change
           const updatedAsset = result.current.assets.find(a => a.asset_id === targetAssetId);
           expect(updatedAsset?.is_favorited).toBe(newFavorite);
           
           // Verify other asset untouched
           const otherAsset = result.current.assets.find(a => a.asset_id === '2');
           expect(otherAsset?.is_favorited).toBe(true); // Should remain true
         }
       )
     );
  });
});
