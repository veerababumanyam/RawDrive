
import { render, screen, cleanup } from '@testing-library/react';
import { HoverOverlay } from '../HoverOverlay';
import { GalleryAssetItem } from '../../../../types/gallery';
import fc from 'fast-check';
import { describe, it, expect, vi, afterEach } from 'vitest';

// Minimal Mock Asset
const createMockAsset = (id: string, isFavorited = false, isSelected = false): GalleryAssetItem => ({
  gallery_asset_id: `ga-${id}`,
  asset_id: id,
  sort_order: 0,
  visible: true,
  is_private: false,
  is_favorited: isFavorited,
  is_selected: isSelected,
  favorites_count: 0,
  asset: {
    type: 'photo',
    status: 'available',
    mime_type: 'image/jpeg',
    filename: 'test.jpg',
    file_size: 1000,
    created_at: new Date().toISOString()
  }
});

describe('HoverOverlay Property Tests', () => {
    afterEach(() => {
        cleanup();
    });

    it('Property 9: Hover Overlay Visibility', () => {
        fc.assert(
            fc.property(
                fc.boolean(), // isHovered
                fc.boolean(), // isSelected
                fc.boolean(), // isFavorited
                (isHovered, isSelected, isFavorited) => {
                    cleanup(); // Ensure fresh DOM for each property run
                    const asset = createMockAsset('test-1', isFavorited, isSelected);
                    const onFavorite = vi.fn();
                    
                    render(
                        <HoverOverlay 
                            asset={asset} 
                            index={0}
                            isHovered={isHovered}
                            isSelected={isSelected}
                            onFavorite={onFavorite}
                            showActions={true}
                        />
                    );
                    
                    const heartButton = screen.queryByLabelText(isFavorited ? 'Remove from favorites' : 'Add to favorites');
                    
                    expect(heartButton).not.toBeNull();
                    if (isFavorited) {
                        expect(heartButton?.className).toContain('active always-visible');
                    } else if (isHovered) {
                         expect(heartButton?.className).toContain('opacity-100');
                    } else {
                         expect(heartButton?.className).toContain('opacity-0');
                    }
                }
            )
        );
    });
    
    it('Property 9b: Action Bar Visibility', () => {
         fc.assert(
            fc.property(
                fc.boolean(), // isHovered
                (isHovered) => {
                    cleanup();
                    const asset = createMockAsset('test-2');
                    const onDownload = vi.fn();
                    
                    render(
                        <HoverOverlay 
                            asset={asset} 
                            index={0}
                            isHovered={isHovered}
                            onDownload={onDownload}
                            showActions={true}
                        />
                    );
                    
                    const downloadButton = screen.queryByLabelText('Download Photo');
                    
                    if (isHovered) {
                        expect(downloadButton).not.toBeNull();
                    } else {
                        expect(downloadButton).toBeNull();
                    }
                }
            )
         );
    });
});
