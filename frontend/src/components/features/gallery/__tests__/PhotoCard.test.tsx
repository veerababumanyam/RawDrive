import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { PhotoCard } from '../PhotoCard';
import { GalleryAssetItem } from '../../../../types/gallery';

// Mock dependencies
vi.mock('../../../../hooks/useSignedUrl', () => ({
    useSignedUrl: () => ({
        url: 'https://example.com/image.jpg',
        loading: false,
        error: null,
        refresh: vi.fn(),
    }),
}));

vi.mock('../../../../contexts/AuthContext', () => ({
    useAuth: () => ({
        workspace: { workspace_id: 'workspace-123' },
    }),
}));

// Mock Lucide icons
vi.mock('lucide-react', () => ({
    Heart: () => <div data-testid="heart-icon" />,
    Lock: () => <div data-testid="lock-icon" />,
    Play: () => <div data-testid="play-icon" />,
    Check: () => <div data-testid="check-icon" />,
    CheckSquare: () => <div data-testid="check-square-icon" />,
    MoreVertical: () => <div data-testid="more-vertical-icon" />,
    Download: () => <div data-testid="download-icon" />,
    Trash2: () => <div data-testid="trash-icon" />,
    Image: () => <div data-testid="image-icon" />,
}));

const mockAsset: GalleryAssetItem = {
    asset_id: 'asset-1',
    gallery_id: 'gallery-1',
    workspace_id: 'workspace-1',
    sort_order: 0,
    visible: true,
    is_private: false,
    is_favorited: false,
    is_selected: false,
    created_at: '2023-01-01T00:00:00Z',
    asset: {
        asset_id: 'asset-1',
        workspace_id: 'workspace-1',
        filename: 'test.jpg',
        mime_type: 'image/jpeg',
        file_size: 1024,
        status: 'available',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        storage_path: 'path/to/test.jpg',
        bucket_name: 'bucket',
        provider: 'r2',
        width: 800,
        height: 600,
    },
};

describe('PhotoCard', () => {
    it('renders correctly', () => {
        render(<PhotoCard asset={mockAsset} index={0} />);
        expect(screen.getByRole('gridcell')).toBeInTheDocument();
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/image.jpg');
    });

    it('shows actions on hover', () => {
        render(<PhotoCard asset={mockAsset} index={0} showActions={true} />);
        const card = screen.getByRole('gridcell');

        // Simulate hover
        fireEvent.mouseEnter(card);

        expect(screen.getByLabelText('Add to favorites')).toBeInTheDocument();
    });

    it('shows "Set as Cover" button when onSetCover is provided and not already cover', () => {
        const handleSetCover = vi.fn();
        render(
            <PhotoCard
                asset={mockAsset}
                index={0}
                onSetCover={handleSetCover}
                isCover={false}
            />
        );

        const card = screen.getByRole('gridcell');
        fireEvent.mouseEnter(card);

        const setCoverBtn = screen.getByTitle('Set as Cover');
        expect(setCoverBtn).toBeInTheDocument();

        fireEvent.click(setCoverBtn);
        expect(handleSetCover).toHaveBeenCalledWith('asset-1');
    });

    it('does not show "Set as Cover" button if already cover', () => {
        const handleSetCover = vi.fn();
        render(
            <PhotoCard
                asset={mockAsset}
                index={0}
                onSetCover={handleSetCover}
                isCover={true}
            />
        );

        const card = screen.getByRole('gridcell');
        fireEvent.mouseEnter(card);

        expect(screen.queryByTitle('Set as Cover')).not.toBeInTheDocument();
    });

    it('shows Cover badge when isCover is true', () => {
        render(<PhotoCard asset={mockAsset} index={0} isCover={true} />);
        expect(screen.getByTitle('Gallery Cover')).toBeInTheDocument();
    });
});
