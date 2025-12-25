import { renderHook, act } from '@testing-library/react';
import { useSelection } from '../useSelection';
import fc from 'fast-check';
import { GalleryAssetItem } from '../../types/gallery';
import { describe, it, expect } from 'vitest';

// Helper to create minimal mock assets
const createMockAsset = (id: string): GalleryAssetItem => ({
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
    created_at: new Date().toISOString()
  }
});

describe('useSelection Property Tests', () => {
  it('Property 6: Selection Toggle Idempotence', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid()).filter(arr => arr.length > 0),
        fc.nat(), 
        (assetIds, index) => {
          // Setup
          const assets = assetIds.map(id => createMockAsset(id));
          const targetId = assetIds[index % assetIds.length];
          
          const { result } = renderHook(() => useSelection(assets));
          
          // Initial state check
          const initialIsSelected = result.current[1].isSelected(targetId);
          expect(initialIsSelected).toBe(false);
          
          // First toggle
          act(() => {
            result.current[1].toggle(targetId);
          });
          
          const afterFirstToggle = result.current[1].isSelected(targetId);
          expect(afterFirstToggle).toBe(true);
          
          // Second toggle (Idempotence of the operation sequence: toggle(x); toggle(x) == no-op on state relative to start)
          // Wait, idempotence usually means f(f(x)) = f(x). 
          // But here "toggle is its own inverse" means f(f(x)) = x.
          // The property description says: "clicking it twice... SHALL return the selection state to its original value"
          // This is technically involution, or "toggle is self-inverse".
          
          act(() => {
            result.current[1].toggle(targetId);
          });
          
          const afterSecondToggle = result.current[1].isSelected(targetId);
          expect(afterSecondToggle).toBe(initialIsSelected);
        }
      ),
      { numRuns: 100 } // reduce runs for speed if needed
    );
  });


  it('Property 7: Multi-Select with Modifier Keys', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.uuid(), { minLength: 3 }),
        fc.nat(),
        fc.nat(),
        (assetIds, index1, index2) => {
          const assets = assetIds.map(id => createMockAsset(id));
          const id1 = assetIds[index1 % assetIds.length];
          const id2 = assetIds[index2 % assetIds.length];
          // Ensure distinct IDs for clearer testing
          if (id1 === id2) return;

          const { result } = renderHook(() => useSelection(assets));

          // 1. Single Click Logic
          act(() => {
            // Simulate single click (no modifiers)
            result.current[1].handleSelection(id1, {} as React.MouseEvent);
          });
          expect(result.current[0].selectedIds.has(id1)).toBe(true);
          expect(result.current[0].selectedIds.size).toBe(1);

          // 2. Ctrl/Cmd Click (Toggle) Logic
          act(() => {
            // Ctrl click second item
            result.current[1].handleSelection(id2, { ctrlKey: true } as React.MouseEvent);
          });
          expect(result.current[0].selectedIds.has(id1)).toBe(true); // Should remain
          expect(result.current[0].selectedIds.has(id2)).toBe(true); // Should be added

          // Toggle off first item
          act(() => {
             result.current[1].handleSelection(id1, { ctrlKey: true } as React.MouseEvent);
          });
          expect(result.current[0].selectedIds.has(id1)).toBe(false);
          expect(result.current[0].selectedIds.has(id2)).toBe(true);

          // 3. Shift Click (Range) Logic
          // Reset selection to just id1
          act(() => {
            result.current[1].handleSelection(id1, {} as React.MouseEvent);
          });
          // Shift click id2
          act(() => {
            result.current[1].handleSelection(id2, { shiftKey: true } as React.MouseEvent);
          });
          
          // Verify range
          const idx1 = assetIds.indexOf(id1);
          const idx2 = assetIds.indexOf(id2);
          const start = Math.min(idx1, idx2);
          const end = Math.max(idx1, idx2);
          const expectedRangeSize = end - start + 1;
          
          expect(result.current[0].selectedIds.size).toBe(expectedRangeSize);
          assetIds.slice(start, end + 1).forEach(id => {
             expect(result.current[0].selectedIds.has(id)).toBe(true);
          });
        }
      )
    );
  });

  it('Property 8: Select All Completeness', () => {
     fc.assert(
      fc.property(
        fc.array(fc.uuid()),
        (assetIds) => {
          const assets = assetIds.map(id => createMockAsset(id));
          const { result } = renderHook(() => useSelection(assets));

          act(() => {
            result.current[1].selectAll();
          });

          // Verify all are selected
          expect(result.current[0].selectedIds.size).toBe(assetIds.length);
          assetIds.forEach(id => {
            expect(result.current[0].selectedIds.has(id)).toBe(true);
          });
          
          // Verify deselect all
          act(() => {
             result.current[1].deselectAll();
          });
          expect(result.current[0].selectedIds.size).toBe(0);
        }
      )
     );
  });
});
