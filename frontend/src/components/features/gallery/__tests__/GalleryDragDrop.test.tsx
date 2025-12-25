
import { render, cleanup } from '@testing-library/react';
import { PhotoGrid } from '../PhotoGrid';
import { GalleryAssetItem } from '../../../types/gallery';
import { describe, it, expect, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import React, { useEffect } from 'react';
import { DndContext } from '@dnd-kit/core';

// --- Mocks ---

// Mock Assets
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
    created_at: new Date().toISOString(),
    width: 800,
    height: 600
  }
});

// Mock Observers
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;
global.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

// Mock Auth
vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    workspace: { workspace_id: 'ws-123' }
  })
}));

// Mock SignedUrlService
vi.mock('../../../../services/signedUrlService', () => ({
  signedUrlService: {
    getSignedUrls: vi.fn().mockResolvedValue({})
  }
}));

// Mock useSignedUrl hook to avoid provider requirement
vi.mock('../../../../hooks/useSignedUrl', () => ({
  useSignedUrl: () => ({
    url: 'http://example.com/photo.jpg',
    loading: false,
    error: null
  })
}));

// Mock dnd-kit modules
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => <>{children}</>,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  verticalListSortingStrategy: {},
  horizontalListSortingStrategy: {},
  rectSortingStrategy: {},
  arrayMove: (items: any[], from: number, to: number) => {
    const newItems = [...items];
    const [removed] = newItems.splice(from, 1);
    newItems.splice(to, 0, removed);
    return newItems;
  },
  sortableKeyboardCoordinates: {},
}));

// Mock dnd-kit core and capturing onDragEnd
let triggerDragEnd: ((e: any) => void) | null = null;

vi.mock('@dnd-kit/core', async () => {
    const actual = await vi.importActual('@dnd-kit/core');
    return {
        ...actual,
        DndContext: ({ onDragEnd, children }: any) => {
            useEffect(() => {
                triggerDragEnd = onDragEnd;
                return () => { triggerDragEnd = null; };
            }, [onDragEnd]);
            return <div>{children}</div>;
        },
        useSensor: vi.fn(),
        useSensors: vi.fn(),
        PointerSensor: vi.fn(),
        KeyboardSensor: vi.fn(),
    };
});


describe('Gallery Drag and Drop', () => {
    afterEach(() => {
        cleanup();
        triggerDragEnd = null;
    });

    it('Property 17: Drag and Drop Sort Order', () => {
        fc.assert(
            fc.property(
                fc.array(fc.uuid(), { minLength: 2, maxLength: 10 }),
                fc.nat(), 
                fc.nat(),
                (ids, inputIdx1, inputIdx2) => {
                    // Ensure unique IDs
                    const uniqueIds = Array.from(new Set(ids));
                    if (uniqueIds.length < 2) return true;

                    // Ensure valid indices
                    const fromIdx = inputIdx1 % uniqueIds.length;
                    const toIdx = inputIdx2 % uniqueIds.length;
                    
                    if (fromIdx === toIdx) return true; // No move if indices same

                    const assets = uniqueIds.map(createMockAsset);
                    const onSortOrderChange = vi.fn();

                    const { unmount } = render(
                        <PhotoGrid
                            assets={assets}
                            sortable={true}
                            onSortOrderChange={onSortOrderChange}
                        />
                    );

                    expect(triggerDragEnd).toBeTruthy();

                    // Simulate Drag Reorder
                    const fromId = uniqueIds[fromIdx];
                    const toId = uniqueIds[toIdx];

                    // Determine expected result
                    // arrayMove logic: 
                    const expectedIds = [...uniqueIds];
                    const [removed] = expectedIds.splice(fromIdx, 1);
                    expectedIds.splice(toIdx, 0, removed);

                    if (triggerDragEnd) {
                        triggerDragEnd({
                            active: { id: fromId },
                            over: { id: toId }
                        });
                    }

                    // Verify
                    expect(onSortOrderChange).toHaveBeenCalledTimes(1);
                    expect(onSortOrderChange).toHaveBeenCalledWith(expectedIds);

                    unmount();
                    return true;
                }
            )
        );
    });

    it('Property 18: Drag to Sub-Gallery Tab', () => {
        fc.assert(
            fc.property(
                fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
                fc.nat(),
                fc.uuid(),
                (ids, idx, subGalleryId) => {
                    const uniqueIds = Array.from(new Set(ids));
                    if (uniqueIds.length === 0) return true;
                    
                    const assetIdx = idx % uniqueIds.length;
                    const assets = uniqueIds.map(createMockAsset);
                    const onMoveToSubGallery = vi.fn();

                    const { unmount } = render(
                        <PhotoGrid
                            assets={assets}
                            sortable={true} 
                            onMoveToSubGallery={onMoveToSubGallery}
                        />
                    );

                    expect(triggerDragEnd).toBeTruthy();

                    const draggedAssetId = uniqueIds[assetIdx];
                    const targetTabId = `sub-gallery-${subGalleryId}`;

                    if (triggerDragEnd) {
                        triggerDragEnd({
                            active: { id: draggedAssetId },
                            over: { id: targetTabId }
                        });
                    }

                    expect(onMoveToSubGallery).toHaveBeenCalledWith(draggedAssetId, subGalleryId);

                    unmount();
                    return true;
                }
            )
        );
    });

    it('Property 18b: Drag to Root Gallery Tab', () => {
        // Special case for root gallery
        const assets = [createMockAsset('a1')];
        const onMoveToSubGallery = vi.fn();
        
        const { unmount } = render(
            <PhotoGrid
                assets={assets}
                sortable={true}
                onMoveToSubGallery={onMoveToSubGallery}
            />
        );
        
        if (triggerDragEnd) {
             triggerDragEnd({
                 active: { id: 'a1' },
                 over: { id: 'sub-gallery-root' } // Specific ID for root
             });
        }
        
        // Expect null for sub-gallery ID
        expect(onMoveToSubGallery).toHaveBeenCalledWith('a1', null);
        
        unmount();
    });
});
