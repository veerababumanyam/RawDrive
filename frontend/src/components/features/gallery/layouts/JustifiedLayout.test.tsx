import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { JustifiedLayout } from './JustifiedLayout';
import type { LayoutAsset } from './types';

// Mock ProgressiveImage
vi.mock('./ProgressiveImage', () => ({
  ProgressiveImage: vi.fn(({ alt, style }: { alt: string; style?: React.CSSProperties }) => (
    <div data-testid="progressive-image" data-alt={alt} style={style} />
  )),
}));

// Mock justified-layout
vi.mock('justified-layout', () => ({
  default: vi.fn((ratios: number[], config: Record<string, number>) => ({
    containerHeight: 480,
    boxes: ratios.map((_r, i) => ({
      top: Math.floor(i / 3) * 250,
      left: (i % 3) * (config.containerWidth / 3),
      width: config.containerWidth / 3,
      height: 240,
    })),
  })),
}));

import justifiedLayout from 'justified-layout';
const mockJustifiedLayout = vi.mocked(justifiedLayout);

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

describe('JustifiedLayout', () => {
  const baseProps = {
    assets: makeAssets(6),
    containerWidth: 1200,
    gap: 8,
  };

  it('renders correct number of ProgressiveImage children', () => {
    const { getAllByTestId } = render(<JustifiedLayout {...baseProps} />);
    const images = getAllByTestId('progressive-image');
    expect(images).toHaveLength(6);
  });

  it('calls justified-layout library with aspect ratios and config', () => {
    render(<JustifiedLayout {...baseProps} />);

    expect(mockJustifiedLayout).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(Number)]),
      expect.objectContaining({
        containerWidth: 1200,
      }),
    );
  });

  it('container has position: relative', () => {
    const { container } = render(<JustifiedLayout {...baseProps} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.position).toBe('relative');
  });

  it('sets container height from geometry.containerHeight', () => {
    const { container } = render(<JustifiedLayout {...baseProps} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.height).toBe('480px');
  });

  it('positions images absolutely using geometry.boxes coordinates', () => {
    const { getAllByTestId } = render(<JustifiedLayout {...baseProps} />);
    const images = getAllByTestId('progressive-image');

    // Each image wrapper should have position absolute
    images.forEach((img) => {
      const parent = img.parentElement as HTMLElement;
      expect(parent.style.position).toBe('absolute');
    });
  });

  it('renders nothing when containerWidth is 0', () => {
    const { container } = render(
      <JustifiedLayout {...baseProps} containerWidth={0} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('fires onAssetClick callback when an image is clicked', () => {
    const onAssetClick = vi.fn();
    const { getAllByTestId } = render(
      <JustifiedLayout {...baseProps} onAssetClick={onAssetClick} />,
    );
    const images = getAllByTestId('progressive-image');
    // The parent div with onClick is the wrapper
    const clickTarget = images[0].parentElement as HTMLElement;
    clickTarget.click();
    // onAssetClick should have been passed down
    expect(onAssetClick).toHaveBeenCalled();
  });
});
