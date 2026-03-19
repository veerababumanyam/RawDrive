import { describe, it, expect } from 'vitest';
import { GalleryStatus, DownloadPolicy, ThemeMode, LayoutStyle, AssetStatus } from '../src/gallery';

describe('Gallery domain enums', () => {
  it('GalleryStatus has correct values', () => {
    expect(Object.values(GalleryStatus)).toEqual(['draft', 'published', 'archived']);
  });

  it('DownloadPolicy has correct values', () => {
    expect(Object.values(DownloadPolicy)).toEqual([
      'view_only', 'web_only', 'watermarked_only', 'original_allowed',
    ]);
  });

  it('ThemeMode has correct values', () => {
    expect(Object.values(ThemeMode)).toEqual(['light', 'dark', 'system']);
  });

  it('AssetStatus has correct values', () => {
    expect(Object.values(AssetStatus)).toEqual([
      'uploading', 'processing', 'available', 'failed', 'deleted',
    ]);
  });

  describe('LayoutStyle enum (8 values)', () => {
    it('has exactly 8 keys', () => {
      expect(Object.keys(LayoutStyle)).toHaveLength(8);
    });

    it('has all required keys: TABS, CONTINUOUS, GRID, MASONRY, JUSTIFIED, MOSAIC, FILMSTRIP, SLIDESHOW', () => {
      const expectedKeys = ['TABS', 'CONTINUOUS', 'GRID', 'MASONRY', 'JUSTIFIED', 'MOSAIC', 'FILMSTRIP', 'SLIDESHOW'];
      expect(Object.keys(LayoutStyle)).toEqual(expectedKeys);
    });

    it('has correct string values for all 8 layout styles', () => {
      const expectedValues = ['tabs', 'continuous', 'grid', 'masonry', 'justified', 'mosaic', 'filmstrip', 'slideshow'];
      expect(Object.values(LayoutStyle)).toEqual(expectedValues);
    });

    it('each value round-trips through JSON serialization', () => {
      for (const value of Object.values(LayoutStyle)) {
        const serialized = JSON.stringify(value);
        const deserialized = JSON.parse(serialized);
        expect(deserialized).toBe(value);
      }
    });
  });
});
