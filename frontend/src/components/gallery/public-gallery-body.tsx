"use client";

import { useCallback, useState } from "react";
import type {
  Gallery,
  GalleryBranding,
  PublicAsset,
  PublicGalleryAlbum,
} from "@/lib/api/galleries";
import { getPublicGalleryAssetsPage } from "@/lib/api/galleries";
import type { GalleryBanner, GalleryProduct } from "@/lib/api/commerce";
import type {
  CoverProfileThumbnailMap,
  PublicDesignConfig,
} from "@/lib/gallery-design-config";
import type { EmbeddedVideo } from "@/lib/embedded-videos";
import { PublicGalleryHero } from "@/components/gallery/public-gallery-hero";
import { GalleryExpiryBanner } from "@/components/gallery/gallery-expiry-banner";
import { PublicGalleryBanners } from "@/components/gallery/public-gallery-banners";
import { PublicGalleryAlbumChips } from "@/components/gallery/public-gallery-album-chips";
import { EmbeddedVideosPanel } from "@/components/gallery/embedded-videos-panel";
import { PublicGalleryGrid } from "@/components/gallery/public-gallery-grid";
import { PublicGalleryProducts } from "@/components/gallery/public-gallery-products";
import { PublicGalleryEnhancements } from "@/components/gallery/public-gallery-enhancements";

interface PublicGalleryBodyProps {
  gallery: Gallery;
  assets: PublicAsset[];
  branding?: GalleryBranding | null;
  design?: PublicDesignConfig | null;
  designCoverAsset?: PublicAsset | null;
  designCoverThumbnails?: Record<string, string> | null;
  designCoverProfileThumbnails?: CoverProfileThumbnailMap | null;
  albums?: PublicGalleryAlbum[];
  activeAlbumId?: string;
  initialAssetTotal?: number;
  initialAssetsHasMore?: boolean;
  initialAssetNextOffset?: number;
  assetPageLimit?: number;
  products?: GalleryProduct[];
  banners?: GalleryBanner[];
  embeddedVideos?: EmbeddedVideo[];
  slug?: string;
  ws?: string | null;
  shareToken?: string | null;
  gallerySessionToken?: string | null;
  assetAccessToken?: string | null;
  viewerToken?: string | null;
  previewMode?: boolean;
  previewGalleryId?: string;
}

const PREVIEW_FAVORITES_DISABLED =
  "Favorites are disabled in owner preview and will not affect client counts.";
const PREVIEW_ACTIONS_DISABLED =
  "This action is disabled in owner preview and will not write client activity.";

interface AssetPagingState {
  resetKey: string;
  loadedAssets: PublicAsset[];
  assetTotal: number;
  hasMoreAssets: boolean;
  nextAssetOffset: number;
  loadingMoreAssets: boolean;
  assetLoadError: string;
}

export function PublicGalleryBody({
  gallery,
  assets,
  branding = null,
  design = null,
  designCoverAsset = null,
  designCoverThumbnails = null,
  designCoverProfileThumbnails = null,
  albums = [],
  activeAlbumId,
  initialAssetTotal,
  initialAssetsHasMore = false,
  initialAssetNextOffset,
  assetPageLimit = 120,
  products = [],
  banners = [],
  embeddedVideos = [],
  slug = gallery.slug,
  ws = null,
  shareToken = null,
  gallerySessionToken = null,
  assetAccessToken = null,
  viewerToken = null,
  previewMode = false,
  previewGalleryId,
}: PublicGalleryBodyProps) {
  const previewBaseHref = previewMode
    ? `/galleries/${previewGalleryId || gallery.id}/preview`
    : undefined;
  const assetResetKey = [
    slug,
    activeAlbumId ?? "root",
    initialAssetTotal ?? assets.length,
    initialAssetsHasMore ? "more" : "done",
    initialAssetNextOffset ?? assets.length,
    assets.map((asset) => asset.id).join("|"),
  ].join("::");
  const createInitialAssetState = (): AssetPagingState => ({
    resetKey: assetResetKey,
    loadedAssets: assets,
    assetTotal: initialAssetTotal ?? assets.length,
    hasMoreAssets: initialAssetsHasMore,
    nextAssetOffset: initialAssetNextOffset ?? assets.length,
    loadingMoreAssets: false,
    assetLoadError: "",
  });
  const [assetStateValue, setAssetState] = useState<AssetPagingState>(
    createInitialAssetState,
  );
  let assetState = assetStateValue;
  if (assetState.resetKey !== assetResetKey) {
    assetState = createInitialAssetState();
    setAssetState(assetState);
  }

  const loadMoreAssets = useCallback(async () => {
    if (assetState.loadingMoreAssets || !assetState.hasMoreAssets) return;
    const requestResetKey = assetState.resetKey;
    setAssetState((current) =>
      current.resetKey === requestResetKey
        ? { ...current, loadingMoreAssets: true, assetLoadError: "" }
        : current,
    );
    try {
      const page = await getPublicGalleryAssetsPage(
        slug,
        activeAlbumId,
        ws,
        gallerySessionToken,
        shareToken,
        { limit: assetPageLimit, offset: assetState.nextAssetOffset },
      );
      setAssetState((current) => {
        if (current.resetKey !== requestResetKey) return current;
        const seen = new Set(current.loadedAssets.map((asset) => asset.id));
        const merged = current.loadedAssets.slice();
        for (const asset of page.assets) {
          if (seen.has(asset.id)) continue;
          seen.add(asset.id);
          merged.push(asset);
        }
        return {
          ...current,
          loadedAssets: merged,
          assetTotal: page.total,
          hasMoreAssets: page.has_more,
          nextAssetOffset: page.offset + page.limit,
          loadingMoreAssets: false,
        };
      });
    } catch (err) {
      setAssetState((current) =>
        current.resetKey === requestResetKey
          ? {
              ...current,
              loadingMoreAssets: false,
              assetLoadError:
                err instanceof Error
                  ? err.message
                  : "Failed to load more photos.",
            }
          : current,
      );
    }
  }, [
    activeAlbumId,
    assetState.hasMoreAssets,
    assetState.loadingMoreAssets,
    assetState.nextAssetOffset,
    assetState.resetKey,
    assetPageLimit,
    gallerySessionToken,
    shareToken,
    slug,
    ws,
  ]);
  const {
    loadedAssets,
    assetTotal,
    hasMoreAssets,
    loadingMoreAssets,
    assetLoadError,
  } = assetState;

  return (
    <>
      <PublicGalleryHero
        gallery={gallery}
        assets={loadedAssets}
        branding={branding}
        design={design}
        designCoverAsset={designCoverAsset}
        designCoverThumbnails={designCoverThumbnails}
        designCoverProfileThumbnails={designCoverProfileThumbnails}
        slug={slug}
        ws={ws}
        hasMusic={Boolean(gallery.music_asset_id)}
        assetAccessToken={assetAccessToken}
        shareToken={assetAccessToken ? undefined : shareToken}
        faceDetectionEnabled={gallery.face_detection_enabled !== false}
        viewerToken={viewerToken}
      />

      <GalleryExpiryBanner expiresAt={gallery.expires_at} />

      <PublicGalleryBanners
        slug={slug}
        ws={ws}
        shareToken={shareToken}
        gallerySessionToken={gallerySessionToken}
        initialBanners={banners}
        previewMode={previewMode}
      />

      <PublicGalleryAlbumChips
        slug={slug}
        albums={albums}
        activeAlbumId={activeAlbumId}
        baseHref={previewBaseHref}
      />

      <div id="gallery-grid" className="mx-auto max-w-6xl space-y-6 px-4 pb-16">
        {embeddedVideos.length > 0 && (
          <EmbeddedVideosPanel
            galleryId={gallery.id}
            initialVideos={embeddedVideos}
            readOnly
          />
        )}
        {(loadedAssets.length > 0 || embeddedVideos.length === 0) && (
          <PublicGalleryGrid
            slug={slug}
            assets={loadedAssets}
            galleryType={gallery.gallery_type}
            maxSelections={gallery.max_selections || 0}
            downloadEnabled={gallery.download_enabled !== false}
            downloadQuality={gallery.download_quality}
            design={design}
            watermark={
              gallery.watermark_config as Record<string, unknown> | null
            }
            watermarkLogoUrl={
              branding?.can_customize ? branding.logo_url : undefined
            }
            gallerySessionToken={gallerySessionToken}
            assetAccessToken={assetAccessToken}
            workspaceScope={ws}
            totalAssetCount={assetTotal}
            hasMoreAssets={hasMoreAssets}
            loadingMoreAssets={loadingMoreAssets}
            assetLoadError={assetLoadError}
            onLoadMoreAssets={loadMoreAssets}
            favoritesDisabledReason={
              previewMode ? PREVIEW_FAVORITES_DISABLED : undefined
            }
            publicActionsDisabledReason={
              previewMode ? PREVIEW_ACTIONS_DISABLED : undefined
            }
            viewerToken={viewerToken}
          />
        )}
      </div>

      <PublicGalleryProducts
        slug={slug}
        workspaceScope={ws}
        shareToken={shareToken}
        gallerySessionToken={gallerySessionToken}
        products={products}
        previewMode={previewMode}
      />

      <PublicGalleryEnhancements
        slug={slug}
        faceIdEnabled={Boolean(gallery.faceid_enabled)}
        initialBranding={branding}
        previewMode={previewMode}
      />
    </>
  );
}
