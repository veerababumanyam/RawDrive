import { describe, test, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PhotoCard } from '../PhotoCard';
import { GalleryAssetItem } from '../../../../types/gallery';
import { AuthProvider } from '../../../../contexts/AuthContext';

// Mock dependencies
vi.mock('../../../../contexts/AuthContext', async () => {
  return {
    useAuth: () => ({
      workspace: { workspace_id: 'ws-123' },
    }),
    AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
  };
});

// Mock useSignedUrl
const mockUseSignedUrl = vi.fn();
vi.mock('../../../../hooks/useSignedUrl', () => ({
  useSignedUrl: (args: any) => mockUseSignedUrl(args),
}));

describe('PhotoCard Property Tests', () => {
  const createMockAsset = (status: 'available' | 'processing' | 'failed' = 'available'): GalleryAssetItem => ({
     gallery_asset_id: `ga-1`,
     asset_id: 'asset-1',
     sort_order: 0,
     visible: true,
     is_private: false,
     favorites_count: 0,
     is_favorited: false,
     is_selected: false,
     asset: {
       type: 'photo',
       status: status,
       mime_type: 'image/jpeg',
       filename: `photo.jpg`,
       width: 800,
       height: 600,
     }
  });

  test('Property 4: Photo Card Loading States', () => {
    fc.assert(
      fc.property(
        fc.record({
          assetStatus: fc.constantFrom('available', 'processing', 'failed'),
          urlLoading: fc.boolean(),
          urlError: fc.boolean(),
          hasUrl: fc.boolean(),
        }),
        ({ assetStatus, urlLoading, urlError, hasUrl }) => {
           // Setup Mock Return
           const mockUrl = hasUrl ? 'https://example.com/photo.jpg' : null;
           
           mockUseSignedUrl.mockReturnValue({
             url: mockUrl,
             loading: urlLoading,
             error: urlError ? new Error('Fetch failed') : null,
             refresh: vi.fn(),
           });

           const asset = createMockAsset(assetStatus as any);
           
           // Create container
           const containerDiv = document.createElement('div');
           document.body.appendChild(containerDiv);

           const { unmount, container } = render(
             <PhotoCard
               asset={asset}
               index={0}
               selectable={true}
               isSelected={false}
             />,
             { container: containerDiv }
           );

           // Verification Logic
           // Use container queries to ensure we are only looking at this instance
           const getByText = (text: string) => {
             const elements = Array.from(container.querySelectorAll('*'));
             return elements.find(el => el.textContent === text);
           };

           // In the test context, imageError is effectively false (we don't trigger onError)
           // and displayUrl corresponds to mockUrl (since asset.thumbnail_url is undefined)
           const showImage = !!mockUrl;
           
           if (showImage) {
               const img = container.querySelector('img');
               expect(img).not.toBeNull();
               expect(img?.getAttribute('src')).toBe(mockUrl);
           } else {
               // Placeholder / Status Logic
               if (assetStatus === 'processing') {
                   expect(getByText('Processing...')).toBeDefined();
                   expect(container.querySelector('.animate-spin')).not.toBeNull();
               } else if (assetStatus === 'failed') {
                   expect(getByText('Upload Failed')).toBeDefined();
               } else if (urlLoading) {
                    expect(container.querySelector('.animate-pulse')).not.toBeNull();
               } else if (urlError) {
                    expect(getByText('Failed to load')).toBeDefined();
               } else {
                    expect(getByText('No image')).toBeDefined();
               }
           }

           unmount();
           document.body.removeChild(containerDiv);
        }
      ),
      { numRuns: 50 }
    );
  });
});
