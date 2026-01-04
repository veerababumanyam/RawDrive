import { describe, it, expect } from 'vitest';
import { GalleryStatus, DownloadPolicy, ThemeMode, LayoutStyle, AssetStatus } from '../src/gallery';

const galleryStatuses = ['draft', 'published', 'archived'];
const downloadPolicies = ['none', 'watermarked', 'original', 'both'];
const themeModes = ['light', 'dark', 'auto'];
const layoutStyles = ['grid', 'masonry', 'carousel', 'slideshow'];
const assetStatuses = ['uploading', 'processing', 'available', 'failed', 'deleted'];

describe('Gallery domain enums', () => {
  it('GalleryStatus values match specification', () => {
    expect(Object.values(GalleryStatus)).toEqual(galleryStatuses);
  });

  it('DownloadPolicy values match specification', () => {
    expect(Object.values(DownloadPolicy)).toEqual(downloadPolicies);
  });

  it('ThemeMode values match specification', () => {
    expect(Object.values(ThemeMode)).toEqual(themeModes);
  });

  it('LayoutStyle values match specification', () => {
    expect(Object.values(LayoutStyle)).toEqual(layoutStyles);
  });

  it('AssetStatus values match specification', () => {
    expect(Object.values(AssetStatus)).toEqual(assetStatuses);
  });
});
