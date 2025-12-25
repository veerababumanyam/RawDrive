import { render, act } from '@testing-library/react';
import { MasonryLayout } from '../MasonryLayout';
import { GalleryAssetItem } from '../../../types/gallery';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// Mock useAuth
vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    workspace: { workspace_id: 'test-workspace' },
    isAuthenticated: true,
  }),
}));

// Mock useSignedUrl hook to avoid provider requirement
vi.mock('../../../../hooks/useSignedUrl', () => ({
  useSignedUrl: () => ({
    url: 'http://example.com/photo.jpg',
    loading: false,
    error: null
  })
}));

// Mock ResizeObserver and IntersectionObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
  constructor(public cb: (entries: any[]) => void) {}
}

global.ResizeObserver = ResizeObserverMock;
global.IntersectionObserver = IntersectionObserverMock as any;

// Helper to create mock assets with various dimensions
const createMockAsset = (id: string, width: number, height: number): GalleryAssetItem => ({
  gallery_asset_id: `ga-${id}`,
  asset_id: id,
  sort_order: 0,
  visible: true,
  is_private: false,
  is_favorited: false,
  is_selected: false,
  favorites_count: 0,
  asset: {
    type: 'photo',
    status: 'available',
    mime_type: 'image/jpeg',
    filename: `photo-${id}.jpg`,
    file_size: 1000,
    created_at: new Date().toISOString(),
    width,
    height
  }
});

describe('MasonryLayout Property Tests', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

  it('Property 2: Masonry Layout Aspect Ratio Preservation', () => {
    // This test verifies that all rendered photos in the masonry layout
    // preserve their original aspect ratio (or 'auto' mode) and strictly valid dimensions.
    
    // We'll generate random assets with random dimensions
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            width: fc.integer({ min: 100, max: 4000 }),
            height: fc.integer({ min: 100, max: 4000 }),
          }),
          { minLength: 1, maxLength: 50 }
        ),
        (dimensions) => {
          const assets = dimensions.map((dim, i) => 
            createMockAsset(`${i}`, dim.width, dim.height)
          );
          
          // Manually manage container to ensure isolation between fast-check runs
          const container = document.createElement('div');
          document.body.appendChild(container);
          
          const { getAllByRole, unmount } = render(
             <MasonryLayout assets={assets} columns={{ sm: 2, md: 3, lg: 4, xl: 5 }} />,
             { container }
          );
          
          const photos = getAllByRole('gridcell');
          expect(photos.length).toBe(assets.length);
          
          // Verify each photo card receives the correct aspect ratio prop or style
          // Since Masonry Layout reorders items in the DOM (by columns), we can't assume index matches.
          // We must look up the asset by the ID stored in the wrapper.
          
          photos.forEach((photoDiv) => {
             // The wrapper div (parent of PhotoCard) has the data-asset-id
             // But 'photoDiv' is the element with role="gridcell", which is the inner PhotoCard div.
             // We need to find the data-asset-id.
             // In MasonryLayout.tsx: 
             // <div key={asset.asset_id} ref={observerRef} data-asset-id={asset.asset_id}>
             //   <PhotoCard ... />
             // </div>
             
             // So the gridcell is a child of the element with data-asset-id.
             const wrapper = photoDiv.closest('[data-asset-id]');
             const assetId = wrapper?.getAttribute('data-asset-id');
             
             if (!assetId) {
                 throw new Error('Could not find data-asset-id for photo');
             }
             
             const asset = assets.find(a => a.asset_id === assetId);
             if (!asset) {
                 throw new Error(`Could not find asset with id ${assetId}`);
             }

             // PhotoCard calculates ratio as string "width / height"
             const expectedRatioString = `${asset.asset.width} / ${asset.asset.height}`;
             
             // Check inline style - handle whitespace
             const styleAttr = photoDiv.getAttribute('style') || '';
             expect(styleAttr.replace(/\s/g, '')).toContain(`aspect-ratio:${expectedRatioString.replace(/\s/g, '')}`);
          });
          
          unmount();
          document.body.removeChild(container);
        }
      ),
      { numRuns: 10 }
    );
  });
});
