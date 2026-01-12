
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { HoverOverlay } from '../HoverOverlay';
import { GalleryAssetItem } from '../../../../types/gallery';
import { describe, it, expect, vi, afterEach } from 'vitest';

const createMockAsset = (id: string): GalleryAssetItem => ({
    gallery_asset_id: `ga-${id}`,
    asset_id: id,
    sort_order: 0,
    visible: true,
    is_private: false,
    is_favorited: false,
    is_selected: false,
    favorites_count: 0,
    client_favorites_count: 0,
    client_picks_count: 0,
    asset: {
        type: 'photo',
        status: 'available',
        mime_type: 'image/jpeg',
        filename: 'test.jpg',
        file_size: 1000,
        created_at: new Date().toISOString()
    }
});

describe('HoverOverlay Icon Rendering', () => {
    afterEach(() => {
        cleanup();
    });

    it('should render the View button with an SVG icon when hovered', () => {
        const asset = createMockAsset('test-icon');
        const onClick = vi.fn();

        render(
            <HoverOverlay
                asset={asset}
                index={0}
                isHovered={true}
                onClick={onClick}
                showActions={true}
            />
        );

        // Check for View button by aria-label
        const viewButton = screen.getByLabelText('View Full Screen');
        expect(viewButton).toBeTruthy();

        // Assert that the button contains an SVG
        const svg = viewButton.querySelector('svg');
        expect(svg).toBeTruthy();

        // Optional: Check if the text "View" is present (tooltip)
        expect(screen.getByText('View')).toBeTruthy();
    });

    it('should receive onClick event', () => {
        const asset = createMockAsset('test-click');
        const onClick = vi.fn();

        render(
            <HoverOverlay
                asset={asset}
                index={0}
                isHovered={true}
                onClick={onClick}
                showActions={true}
            />
        );

        const viewButton = screen.getByLabelText('View Full Screen');
        viewButton.click();

        expect(onClick).toHaveBeenCalled();
    });
});
