
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GalleryCard } from '../GalleryCard';
import { galleryService } from '../../../../services/galleryService';
import { BrowserRouter } from 'react-router-dom';

// Mock dependencies
vi.mock('../../../../services/galleryService', () => ({
    galleryService: {
        getSignedUrl: vi.fn(),
    },
}));

vi.mock('../../../../contexts/AuthContext', () => ({
    useAuth: () => ({
        workspace: { workspace_id: 'ws-123' },
    }),
}));

describe('GalleryCard', () => {
    const mockGallery = {
        gallery_id: 'gal-1',
        title: 'Test Gallery',
        status: 'published' as const,
        photo_count: 10,
        created_at: new Date().toISOString(),
        cover_asset_id: 'asset-123',
    };

    const mockOnClick = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (galleryService.getSignedUrl as any).mockResolvedValue('https://example.com/default.jpg');
    });

    it('renders gallery title and info', () => {
        render(
            <BrowserRouter>
                <GalleryCard gallery={mockGallery} onClick={mockOnClick} />
            </BrowserRouter>
        );

        expect(screen.getByText('Test Gallery')).toBeInTheDocument();
        expect(screen.getByText('10')).toBeInTheDocument(); // Photo count
    });

    it('fetches and displays cover image from signed URL', async () => {
        const signedUrl = 'https://example.com/signed-url.jpg';
        (galleryService.getSignedUrl as any).mockResolvedValue(signedUrl);

        render(
            <BrowserRouter>
                <GalleryCard gallery={mockGallery} onClick={mockOnClick} />
            </BrowserRouter>
        );

        // Should call getSignedUrl
        await waitFor(() => {
            expect(galleryService.getSignedUrl).toHaveBeenCalledWith('ws-123', 'asset-123', 'thumbnail');
        });

        // Should render image with signed URL
        const img = await screen.findByAltText('Test Gallery');
        expect(img).toHaveAttribute('src', signedUrl);
    });

    it('uses legacy cover_image_url if cover_asset_id is missing', () => {
        const legacyGallery = {
            ...mockGallery,
            cover_asset_id: undefined,
            cover_image_url: 'https://example.com/legacy.jpg',
        };

        render(
            <BrowserRouter>
                <GalleryCard gallery={legacyGallery} onClick={mockOnClick} />
            </BrowserRouter>
        );

        const img = screen.getByAltText('Test Gallery');
        expect(img).toHaveAttribute('src', 'https://example.com/legacy.jpg');
        expect(galleryService.getSignedUrl).not.toHaveBeenCalled();
    });
});
