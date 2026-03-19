import { describe, it, expect } from 'vitest';
import { LayoutStyle } from './gallery';

describe('LayoutStyle enum', () => {
  const EXPECTED_KEYS = [
    'TABS', 'CONTINUOUS', 'GRID', 'MASONRY',
    'JUSTIFIED', 'MOSAIC', 'FILMSTRIP', 'SLIDESHOW',
  ];
  const EXPECTED_VALUES = [
    'tabs', 'continuous', 'grid', 'masonry',
    'justified', 'mosaic', 'filmstrip', 'slideshow',
  ];

  it('has exactly 8 layout styles', () => {
    expect(Object.keys(LayoutStyle)).toHaveLength(8);
  });

  it('has all expected keys', () => {
    expect(Object.keys(LayoutStyle).sort()).toEqual(EXPECTED_KEYS.sort());
  });

  it('has all expected values', () => {
    expect(Object.values(LayoutStyle).sort()).toEqual(EXPECTED_VALUES.sort());
  });

  it('values are all lowercase strings', () => {
    Object.values(LayoutStyle).forEach((v) => {
      expect(v).toBe(v.toLowerCase());
      expect(typeof v).toBe('string');
    });
  });
});
