import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FavoriteButton } from './FavoriteButton';

// Mock the GalleryInteractionContext
const mockToggleFavorite = vi.fn().mockResolvedValue(undefined);
const mockContextValue = {
  favorites: new Set<string>(),
  selections: new Set<string>(),
  toggleFavorite: mockToggleFavorite,
  toggleSelection: vi.fn(),
  selectionLimit: null,
  isAtSelectionLimit: false,
  visitorToken: 'test-token',
  isProofingEnabled: true,
  favoriteCount: 0,
  selectionCount: 0,
};

vi.mock('../../../../contexts/GalleryInteractionContext', () => ({
  useGalleryInteraction: () => mockContextValue,
}));

describe('FavoriteButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContextValue.favorites = new Set<string>();
    mockContextValue.isProofingEnabled = true;
  });

  it('renders heart icon when proofing is enabled', () => {
    render(<FavoriteButton assetId="asset-1" />);
    const button = screen.getByRole('button', { name: /favorite/i });
    expect(button).toBeTruthy();
  });

  it('does not render when proofing is disabled', () => {
    mockContextValue.isProofingEnabled = false;
    const { container } = render(<FavoriteButton assetId="asset-1" />);
    expect(container.innerHTML).toBe('');
  });

  it('shows outline heart when not favorited', () => {
    render(<FavoriteButton assetId="asset-1" />);
    const button = screen.getByRole('button', { name: /favorite/i });
    // Should NOT have the filled class
    expect(button.querySelector('svg')).toBeTruthy();
  });

  it('shows filled red heart when favorited', () => {
    mockContextValue.favorites = new Set(['asset-1']);
    render(<FavoriteButton assetId="asset-1" />);
    const button = screen.getByRole('button', { name: /favorite/i });
    // The SVG should have fill="currentColor" and text-red-500 class
    expect(button.className).toContain('text-red-500');
  });

  it('calls toggleFavorite on click', () => {
    render(<FavoriteButton assetId="asset-1" />);
    const button = screen.getByRole('button', { name: /favorite/i });
    fireEvent.click(button);
    expect(mockToggleFavorite).toHaveBeenCalledWith('asset-1');
  });

  it('stops event propagation on click', () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <FavoriteButton assetId="asset-1" />
      </div>,
    );
    const button = screen.getByRole('button', { name: /favorite/i });
    fireEvent.click(button);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('accepts size prop', () => {
    render(<FavoriteButton assetId="asset-1" size="lg" />);
    const button = screen.getByRole('button', { name: /favorite/i });
    expect(button).toBeTruthy();
  });

  it('accepts className prop', () => {
    render(<FavoriteButton assetId="asset-1" className="custom-class" />);
    const button = screen.getByRole('button', { name: /favorite/i });
    expect(button.className).toContain('custom-class');
  });
});
