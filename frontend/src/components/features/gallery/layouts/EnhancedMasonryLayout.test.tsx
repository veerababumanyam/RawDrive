import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { EnhancedMasonryLayout } from './EnhancedMasonryLayout';
import type { LayoutAsset } from './types';

// Mock ProgressiveImage
vi.mock('./ProgressiveImage', () => ({
  ProgressiveImage: vi.fn(({ alt, style }: { alt: string; style?: React.CSSProperties }) => (
    <div data-testid="progressive-image" data-alt={alt} style={style} />
  )),
}));

const makeAssets = (count: number): LayoutAsset[] =>
  Array.from({ length: count }, (_, i) => ({
    asset_id: `asset-${i}`,
    src: `https://cdn.example.com/photo-${i}.jpg`,
    lqip: `data:image/jpeg;base64,lqip-${i}`,
    width: 1600,
    height: 1200,
    aspectRatio: 1600 / 1200,
    alt: `Photo ${i}`,
  }));

describe('EnhancedMasonryLayout', () => {
  const baseProps = {
    assets: makeAssets(8),
    containerWidth: 1200,
    gap: 8,
  };

  it('renders ProgressiveImage for each asset', () => {
    const { getAllByTestId } = render(<EnhancedMasonryLayout {...baseProps} />);
    const images = getAllByTestId('progressive-image');
    expect(images).toHaveLength(8);
  });

  it('uses CSS column-count layout', () => {
    const { container } = render(<EnhancedMasonryLayout {...baseProps} />);
    const wrapper = container.firstElementChild as HTMLElement;
    // Desktop 1200px -> 4 columns
    expect(wrapper.style.columnCount).toBe('4');
  });

  it('items have break-inside: avoid', () => {
    const { getAllByTestId } = render(<EnhancedMasonryLayout {...baseProps} />);
    const images = getAllByTestId('progressive-image');
    // Each image is wrapped in a div with break-inside: avoid
    images.forEach((img) => {
      const wrapper = img.parentElement as HTMLElement;
      expect(wrapper.style.breakInside).toBe('avoid');
    });
  });

  it('reorders assets for chronological left-to-right display in column layout', () => {
    // With 4 columns and 8 items, chronological order [0,1,2,3,4,5,6,7]
    // should be reordered so reading top-to-bottom per column gives left-to-right order.
    // Column-count fills top-to-bottom, so we need:
    //   Col 0: items 0, 4  (visual positions 0, 4)
    //   Col 1: items 1, 5  (visual positions 1, 5)
    //   Col 2: items 2, 6  (visual positions 2, 6)
    //   Col 3: items 3, 7  (visual positions 3, 7)
    // Reordered array: [0, 4, 1, 5, 2, 6, 3, 7]
    const { getAllByTestId } = render(<EnhancedMasonryLayout {...baseProps} />);
    const images = getAllByTestId('progressive-image');
    const alts = images.map((img) => img.getAttribute('data-alt'));

    // First two should be col 0: Photo 0, Photo 4
    expect(alts[0]).toBe('Photo 0');
    expect(alts[1]).toBe('Photo 4');
    // Next two should be col 1: Photo 1, Photo 5
    expect(alts[2]).toBe('Photo 1');
    expect(alts[3]).toBe('Photo 5');
  });

  it('renders nothing when containerWidth is 0', () => {
    const { container } = render(
      <EnhancedMasonryLayout {...baseProps} containerWidth={0} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('uses 2 columns on mobile containerWidth', () => {
    const { container } = render(
      <EnhancedMasonryLayout {...baseProps} containerWidth={500} />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.columnCount).toBe('2');
  });

  it('uses 5 columns on xl containerWidth', () => {
    const { container } = render(
      <EnhancedMasonryLayout {...baseProps} containerWidth={1600} />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.columnCount).toBe('5');
  });

  it('uses 3 columns on tablet containerWidth', () => {
    const { container } = render(
      <EnhancedMasonryLayout {...baseProps} containerWidth={800} />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.columnCount).toBe('3');
  });
});
