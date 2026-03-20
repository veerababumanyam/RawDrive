/**
 * Shared types for gallery layout renderers.
 *
 * These contracts are consumed by every layout mode (grid, masonry, justified,
 * mosaic, filmstrip, slideshow) and by the GalleryLayoutEngine strategy
 * dispatcher.
 *
 * @module layouts/types
 */

import type { GalleryAssetItem, PublicGalleryAsset } from '../../../../types/gallery';

// ---------------------------------------------------------------------------
// Core layout types
// ---------------------------------------------------------------------------

/** Normalised asset representation consumed by all layout renderers. */
export interface LayoutAsset {
  asset_id: string;
  src: string;
  lqip?: string;
  width: number;
  height: number;
  aspectRatio: number;
  alt: string;
  onClick?: () => void;
}

/** Props every layout renderer must accept. */
export interface LayoutRendererProps {
  assets: LayoutAsset[];
  containerWidth: number;
  gap?: number;
  onAssetClick?: (asset: LayoutAsset, index: number) => void;
}

// ---------------------------------------------------------------------------
// Converter helpers
// ---------------------------------------------------------------------------

const DEFAULT_ASPECT_RATIO = 3 / 2;

/**
 * Convert a workspace GalleryAssetItem (which nests an `asset` object with
 * signed URLs and LQIP) into a flat LayoutAsset.
 */
export function fromGalleryAssetItem(item: GalleryAssetItem): LayoutAsset {
  const w = item.asset.width ?? 0;
  const h = item.asset.height ?? 0;
  const aspectRatio = w > 0 && h > 0 ? w / h : DEFAULT_ASPECT_RATIO;

  return {
    asset_id: item.asset_id,
    src: item.asset.preview_url ?? item.asset.thumbnail_url ?? '',
    lqip: item.asset.lqip,
    width: w || 1200,
    height: h || Math.round(1200 / aspectRatio),
    aspectRatio,
    alt: item.title ?? item.asset.filename ?? `Photo ${item.sort_order}`,
  };
}

/**
 * Convert a public gallery asset (flat structure without nested `asset`) into
 * a LayoutAsset.  The caller must provide the signed URL and optional LQIP
 * since PublicGalleryAsset does not carry URLs.
 */
export function fromPublicGalleryAsset(
  asset: PublicGalleryAsset,
  signedUrl: string,
  lqip?: string,
): LayoutAsset {
  const w = asset.width ?? 0;
  const h = asset.height ?? 0;
  const aspectRatio = w > 0 && h > 0 ? w / h : DEFAULT_ASPECT_RATIO;

  return {
    asset_id: asset.asset_id,
    src: signedUrl,
    lqip,
    width: w || 1200,
    height: h || Math.round(1200 / aspectRatio),
    aspectRatio,
    alt: asset.caption ?? asset.filename ?? `Photo ${asset.sort_order}`,
  };
}
