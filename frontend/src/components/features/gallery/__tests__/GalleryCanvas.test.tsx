import { describe, test, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import React, { useState } from 'react';
import { GalleryCanvas } from '../GalleryCanvas';
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

vi.mock('../../../../services/signedUrlService', () => ({
  signedUrlService: {
    getSignedUrls: vi.fn().mockResolvedValue({}),
  },
}));

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
};

describe('GalleryCanvas Property Tests', () => {

  const createMockAsset = (id: string): GalleryAssetItem => ({
     gallery_asset_id: `ga-${id}`,
     asset_id: id,
     sort_order: 0,
     visible: true,
     is_private: false,
     favorites_count: 0,
     is_favorited: false,
     is_selected: false,
     asset: {
       type: 'photo',
       status: 'available',
       mime_type: 'image/jpeg',
       filename: `photo-${id}.jpg`,
       width: 800,
       height: 600,
     }
  });

  // Property 3: View Mode Toggle Preserves Selection
  test('Property 3: View Mode Toggle Preserves Selection', () => {
    // Generate an array of assets and a set of selected IDs
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 20 }).map((ids) => ({
            assets: ids.map((id, i) => createMockAsset(id)),
            selectionIndices: ids.map((_, i) => i).filter(() => Math.random() > 0.5) // Random subset indices
        })),
        ({ assets, selectionIndices }: { assets: GalleryAssetItem[], selectionIndices: number[] }) => {
           // Setup selected IDs based on indices
           const initialSelectedIds = new Set<string>(
               selectionIndices.map((idx: number) => assets[idx].asset_id)
           );
           
           // Wrapper component to manage state
           const TestWrapper = () => {
             const [viewMode, setViewMode] = useState<'grid' | 'masonry'>('grid');
             const [selectedIds, setSelectedIds] = useState<Set<string>>(initialSelectedIds);
             
             return (
               <div>
                  <button data-testid="toggle-mode" onClick={() => setViewMode(v => v === 'grid' ? 'masonry' : 'grid')}>
                     Toggle Mode
                  </button>
                  <GalleryCanvas
                    assets={assets}
                    viewMode={viewMode}
                    selectedAssetIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                    selectable={true}
                    onAssetClick={vi.fn()}
                    onAssetFavorite={vi.fn()}
                    onAssetDownload={vi.fn()}
                    onAssetDelete={vi.fn()}
                  />
               </div>
             );
           };

           // Manually manage container to ensure isolation between fast-check runs
           const container = document.createElement('div');
           document.body.appendChild(container);

           const { unmount, getByTestId } = render(
             <AuthProvider>
                <TestWrapper />
             </AuthProvider>,
             { container }
           );

           // Initial Check (Grid Mode)
           const toggleButton = getByTestId('toggle-mode');
           
           // Verify state is preserved after toggle
           fireEvent.click(toggleButton); // Switch to Masonry
           
           if (assets.length > 0) {
               const gridCells = container.querySelectorAll('[role="gridcell"]');
               // Check which ones are selected
               let selectedCount = 0;
               gridCells.forEach(cell => {
                   if (cell.getAttribute('aria-selected') === 'true') {
                       selectedCount++;
                   }
               });
               
               // Verification logic
               expect(selectedCount).toBe(initialSelectedIds.size);
           }
           
           // Switch back to Grid
           fireEvent.click(toggleButton);
           
           if (assets.length > 0) {
              const gridCells = container.querySelectorAll('[role="gridcell"]');
               let selectedCount = 0;
               gridCells.forEach(cell => {
                   if (cell.getAttribute('aria-selected') === 'true') {
                       selectedCount++;
                   }
               });
               expect(selectedCount).toBe(initialSelectedIds.size);
           }
           
           unmount();
           document.body.removeChild(container);
        }
      ),
      { numRuns: 10 } // Run 10 times with random inputs
    );
  });
});
