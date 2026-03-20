import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PlayerExifPanel } from './PlayerExifPanel';
import type { PublicGalleryAsset } from '../../../../types/gallery';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: React.forwardRef(({ children, ...props }: any, ref: any) => (
      <div ref={ref} data-testid="motion-div" {...props}>{children}</div>
    )),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAsset(overrides: Partial<PublicGalleryAsset> = {}): PublicGalleryAsset {
  return {
    asset_id: 'a1',
    gallery_id: 'g1',
    type: 'photo',
    filename: 'photo.jpg',
    size_bytes: 500000,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlayerExifPanel', () => {
  it('renders nothing when asset has no metadata, width, or height', () => {
    const asset = makeAsset({ metadata: undefined, width: undefined, height: undefined });
    const { container } = render(<PlayerExifPanel asset={asset} galleryId="g1" />);
    // Should return null — empty container
    expect(container.innerHTML).toBe('');
  });

  it('renders camera make/model when present in metadata', () => {
    const asset = makeAsset({
      metadata: { make: 'Canon', model: 'EOS R5' },
    });
    render(<PlayerExifPanel asset={asset} galleryId="g1" />);
    expect(screen.getByText(/Canon/)).toBeTruthy();
    expect(screen.getByText(/EOS R5/)).toBeTruthy();
  });

  it('renders aperture as "f/{value}" format', () => {
    const asset = makeAsset({
      metadata: { aperture: 2.8 },
    });
    render(<PlayerExifPanel asset={asset} galleryId="g1" />);
    expect(screen.getByText('f/2.8')).toBeTruthy();
  });

  it('renders ISO, shutter speed, lens, focal length when present', () => {
    const asset = makeAsset({
      metadata: {
        iso: 400,
        shutter_speed: '1/250',
        lens: 'RF 50mm f/1.2L',
        focal_length: 50,
      },
    });
    render(<PlayerExifPanel asset={asset} galleryId="g1" />);
    expect(screen.getByText('400')).toBeTruthy();
    expect(screen.getByText('1/250')).toBeTruthy();
    expect(screen.getByText('RF 50mm f/1.2L')).toBeTruthy();
    expect(screen.getByText('50mm')).toBeTruthy();
  });

  it('renders resolution as "{width} x {height}"', () => {
    const asset = makeAsset({
      width: 6000,
      height: 4000,
      metadata: { make: 'Sony' }, // need some metadata so panel renders
    });
    render(<PlayerExifPanel asset={asset} galleryId="g1" />);
    expect(screen.getByText('6000 x 4000')).toBeTruthy();
  });

  it('has slide-up animation via motion.div with data-testid', () => {
    const asset = makeAsset({
      metadata: { make: 'Nikon', model: 'Z9' },
    });
    render(<PlayerExifPanel asset={asset} galleryId="g1" />);
    const panel = screen.getByTestId('player-exif-panel');
    expect(panel).toBeTruthy();
  });

  it('renders caption and tags when present', () => {
    const asset = makeAsset({
      metadata: { make: 'Canon' },
      caption: 'Sunset at the beach',
      ai_tags: ['sunset', 'beach', 'landscape'],
    });
    render(<PlayerExifPanel asset={asset} galleryId="g1" />);
    expect(screen.getByText('Sunset at the beach')).toBeTruthy();
    expect(screen.getByText('sunset')).toBeTruthy();
    expect(screen.getByText('beach')).toBeTruthy();
    expect(screen.getByText('landscape')).toBeTruthy();
  });
});
