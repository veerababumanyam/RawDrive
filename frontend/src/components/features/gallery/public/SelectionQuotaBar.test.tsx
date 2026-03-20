import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { SelectionQuotaBar } from './SelectionQuotaBar';

const mockContextValue = {
  favorites: new Set<string>(),
  selections: new Set<string>(),
  toggleFavorite: vi.fn(),
  toggleSelection: vi.fn(),
  selectionLimit: null as number | null,
  isAtSelectionLimit: false,
  visitorToken: 'test-token',
  isProofingEnabled: true,
  favoriteCount: 0,
  selectionCount: 0,
};

vi.mock('../../../../contexts/GalleryInteractionContext', () => ({
  useGalleryInteraction: () => mockContextValue,
}));

describe('SelectionQuotaBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContextValue.selectionLimit = null;
    mockContextValue.selectionCount = 0;
    mockContextValue.isAtSelectionLimit = false;
  });

  it('returns null when selectionLimit is null (unlimited)', () => {
    const { container } = render(<SelectionQuotaBar />);
    expect(container.innerHTML).toBe('');
  });

  it('renders progress bar when selectionLimit is set', () => {
    mockContextValue.selectionLimit = 50;
    mockContextValue.selectionCount = 10;
    render(<SelectionQuotaBar />);
    expect(screen.getByText('10 of 50 selected')).toBeTruthy();
  });

  it('shows blue color when under 90% quota', () => {
    mockContextValue.selectionLimit = 100;
    mockContextValue.selectionCount = 50;
    render(<SelectionQuotaBar />);
    const bar = screen.getByTestId('quota-fill');
    expect(bar.className).toContain('bg-blue-500');
  });

  it('shows amber color at 90% quota', () => {
    mockContextValue.selectionLimit = 100;
    mockContextValue.selectionCount = 90;
    render(<SelectionQuotaBar />);
    const bar = screen.getByTestId('quota-fill');
    expect(bar.className).toContain('bg-amber-500');
  });

  it('shows red color at 100% quota', () => {
    mockContextValue.selectionLimit = 100;
    mockContextValue.selectionCount = 100;
    mockContextValue.isAtSelectionLimit = true;
    render(<SelectionQuotaBar />);
    const bar = screen.getByTestId('quota-fill');
    expect(bar.className).toContain('bg-red-500');
  });

  it('shows "Selection complete!" text at limit', () => {
    mockContextValue.selectionLimit = 50;
    mockContextValue.selectionCount = 50;
    mockContextValue.isAtSelectionLimit = true;
    render(<SelectionQuotaBar />);
    expect(screen.getByText('Selection complete!')).toBeTruthy();
  });

  it('shows correct percentage width on progress bar', () => {
    mockContextValue.selectionLimit = 50;
    mockContextValue.selectionCount = 25;
    render(<SelectionQuotaBar />);
    const bar = screen.getByTestId('quota-fill');
    expect(bar.style.width).toBe('50%');
  });

  it('accepts className prop', () => {
    mockContextValue.selectionLimit = 50;
    mockContextValue.selectionCount = 10;
    render(<SelectionQuotaBar className="custom-class" />);
    const wrapper = screen.getByTestId('selection-quota-bar');
    expect(wrapper.className).toContain('custom-class');
  });
});
