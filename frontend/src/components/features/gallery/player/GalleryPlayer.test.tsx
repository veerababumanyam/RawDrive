import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { GalleryPlayer } from './GalleryPlayer';
import { PlayerFilmstrip } from './PlayerFilmstrip';
import { PlayerToolbar } from './PlayerToolbar';
import type { PublicGalleryAsset } from '../../../../types/gallery';

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const mockAssets: PublicGalleryAsset[] = [
  {
    asset_id: 'a1',
    gallery_id: 'g1',
    type: 'photo',
    filename: 'photo1.jpg',
    width: 1920,
    height: 1080,
    size_bytes: 500000,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    asset_id: 'a2',
    gallery_id: 'g1',
    type: 'photo',
    filename: 'photo2.jpg',
    width: 1920,
    height: 1080,
    size_bytes: 600000,
    sort_order: 1,
    created_at: '2026-01-02T00:00:00Z',
  },
  {
    asset_id: 'a3',
    gallery_id: 'g1',
    type: 'photo',
    filename: 'photo3.jpg',
    width: 1920,
    height: 1080,
    size_bytes: 700000,
    sort_order: 2,
    created_at: '2026-01-03T00:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Mock GalleryPlayerContext
// ---------------------------------------------------------------------------

const mockContextValue = {
  isOpen: true,
  currentIndex: 0,
  assets: mockAssets,
  openPlayer: vi.fn(),
  closePlayer: vi.fn(),
  goToNext: vi.fn(),
  goToPrevious: vi.fn(),
  currentAsset: mockAssets[0],
};

vi.mock('../../../../contexts/GalleryPlayerContext', () => ({
  useGalleryPlayer: () => mockContextValue,
}));

// Mock framer-motion to avoid animation complexity in tests
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: React.forwardRef(({ children, ...props }: any, ref: any) => (
      <div ref={ref} {...props}>{children}</div>
    )),
  },
}));

// Mock react-zoom-pan-pinch
vi.mock('react-zoom-pan-pinch', () => ({
  TransformWrapper: ({ children }: { children: (utils: any) => React.ReactNode }) =>
    <div data-testid="transform-wrapper">
      {typeof children === 'function'
        ? children({ resetTransform: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn() })
        : children}
    </div>,
  TransformComponent: ({ children }: { children: React.ReactNode }) =>
    <div data-testid="transform-component">{children}</div>,
}));

// Mock @use-gesture/react
vi.mock('@use-gesture/react', () => ({
  useDrag: () => () => ({}),
}));

// Mock createPortal to render inline for testing
vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GalleryPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContextValue.isOpen = true;
    mockContextValue.currentIndex = 0;
    mockContextValue.currentAsset = mockAssets[0];
    mockContextValue.assets = mockAssets;
  });

  it('renders nothing when isOpen is false', () => {
    mockContextValue.isOpen = false;
    mockContextValue.currentAsset = null;
    const { container } = render(<GalleryPlayer />);
    expect(container.innerHTML).toBe('');
  });

  it('renders portal with backdrop when isOpen is true', () => {
    render(<GalleryPlayer />);
    const backdrop = document.querySelector('[data-testid="gallery-player-backdrop"]');
    expect(backdrop).toBeTruthy();
  });

  it('Escape key calls closePlayer', () => {
    render(<GalleryPlayer />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockContextValue.closePlayer).toHaveBeenCalled();
  });

  it('ArrowRight key triggers goToNext', () => {
    render(<GalleryPlayer />);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    // useLightboxNavigation calls onNavigate(currentIndex + 1)
    // which maps to openPlayer in our wiring
    expect(mockContextValue.openPlayer).toHaveBeenCalled();
  });

  it('ArrowLeft key triggers goToPrevious when canGoPrevious', () => {
    mockContextValue.currentIndex = 1;
    mockContextValue.currentAsset = mockAssets[1];
    render(<GalleryPlayer />);
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(mockContextValue.openPlayer).toHaveBeenCalled();
  });
});

describe('PlayerFilmstrip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContextValue.isOpen = true;
    mockContextValue.currentIndex = 1;
    mockContextValue.currentAsset = mockAssets[1];
    mockContextValue.assets = mockAssets;
  });

  it('renders thumbnails matching assets count with current index highlighted', () => {
    render(<PlayerFilmstrip />);
    const thumbnails = screen.getAllByRole('button');
    expect(thumbnails).toHaveLength(mockAssets.length);
    // Current thumbnail (index 1) should have the active ring class
    expect(thumbnails[1].className).toContain('ring-2');
  });

  it('calls openPlayer when thumbnail is clicked', () => {
    render(<PlayerFilmstrip />);
    const thumbnails = screen.getAllByRole('button');
    fireEvent.click(thumbnails[2]);
    expect(mockContextValue.openPlayer).toHaveBeenCalledWith(2);
  });
});

describe('PlayerToolbar', () => {
  it('renders close button, counter text, info toggle button', () => {
    const onClose = vi.fn();
    const onToggleInfo = vi.fn();
    render(
      <PlayerToolbar
        onClose={onClose}
        onToggleInfo={onToggleInfo}
        showInfoActive={false}
        positionLabel="1 / 3"
      />
    );

    expect(screen.getByText('1 / 3')).toBeTruthy();
    expect(screen.getByLabelText('Close')).toBeTruthy();
    expect(screen.getByLabelText('Toggle info')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
