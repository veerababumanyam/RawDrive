import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MosaicLayout } from './MosaicLayout';
import type { LayoutAsset } from './types';

// Mock ProgressiveImage
vi.mock('./ProgressiveImage', () => ({
  ProgressiveImage: vi.fn(({ alt, style }: { alt: string; style?: React.CSSProperties }) => (
    <div data-testid="progressive-image" data-alt={alt} style={style} />
  )),
}));

const makeAssets = (count: number, overrides?: Partial<LayoutAsset>[]): LayoutAsset[] =>
  Array.from({ length: count }, (_, i) => ({
    asset_id: `asset-${i}`,
    src: `https://cdn.example.com/photo-${i}.jpg`,
    lqip: `data:image/jpeg;base64,lqip-${i}`,
    width: 1600,
    height: 1200,
    aspectRatio: 1600 / 1200,
    alt: `Photo ${i}`,
    ...(overrides?.[i] ?? {}),
  }));

describe('MosaicLayout', () => {
  const baseProps = {
    assets: makeAssets(6),
    containerWidth: 1200,
    gap: 8,
  };

  it('renders all assets as ProgressiveImage', () => {
    const { getAllByTestId } = render(<MosaicLayout {...baseProps} />);
    const images = getAllByTestId('progressive-image');
    expect(images).toHaveLength(6);
  });

  it('hero image (first) has gridColumn span 2 and gridRow span 2', () => {
    const { getAllByTestId } = render(<MosaicLayout {...baseProps} />);
    const images = getAllByTestId('progressive-image');
    const heroWrapper = images[0].parentElement as HTMLElement;
    expect(heroWrapper.style.gridColumn).toBe('span 2');
    expect(heroWrapper.style.gridRow).toBe('span 2');
  });

  it('uses CSS Grid with grid-auto-flow: dense', () => {
    const { container } = render(<MosaicLayout {...baseProps} />);
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.display).toBe('grid');
    expect(grid.style.gridAutoFlow).toBe('dense');
  });

  it('landscape images (aspectRatio > 1.4) span 2 columns', () => {
    const assets = makeAssets(3, [
      {}, // hero
      { aspectRatio: 1.8, width: 1800, height: 1000 }, // landscape
      { aspectRatio: 1.0, width: 1000, height: 1000 }, // square
    ]);
    const { getAllByTestId } = render(
      <MosaicLayout assets={assets} containerWidth={1200} gap={8} />,
    );
    const images = getAllByTestId('progressive-image');
    const landscapeWrapper = images[1].parentElement as HTMLElement;
    expect(landscapeWrapper.style.gridColumn).toBe('span 2');
  });

  it('portrait images (aspectRatio < 0.7) span 2 rows', () => {
    const assets = makeAssets(3, [
      {}, // hero
      { aspectRatio: 0.5, width: 800, height: 1600 }, // portrait
      { aspectRatio: 1.0, width: 1000, height: 1000 }, // square
    ]);
    const { getAllByTestId } = render(
      <MosaicLayout assets={assets} containerWidth={1200} gap={8} />,
    );
    const images = getAllByTestId('progressive-image');
    const portraitWrapper = images[1].parentElement as HTMLElement;
    expect(portraitWrapper.style.gridRow).toBe('span 2');
  });

  it('renders nothing when containerWidth is 0', () => {
    const { container } = render(
      <MosaicLayout {...baseProps} containerWidth={0} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('uses responsive column count based on containerWidth', () => {
    // Desktop (1200px) should use 4 columns
    const { container } = render(<MosaicLayout {...baseProps} />);
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(4, 1fr)');
  });

  it('uses 2 columns on mobile containerWidth', () => {
    const { container } = render(
      <MosaicLayout {...baseProps} containerWidth={500} />,
    );
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(2, 1fr)');
  });
});
