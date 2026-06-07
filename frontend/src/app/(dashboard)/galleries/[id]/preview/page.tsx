"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PreviewChrome } from "@/components/gallery/preview-chrome";
import { PublicGalleryBody } from "@/components/gallery/public-gallery-body";
import { getStoredAccessToken } from "@/lib/auth";
import {
  createGalleryShareLink,
  getGalleryClientPreview,
  type Gallery,
  type GalleryBranding,
  type PublicAsset,
  type PublicGalleryAlbum,
} from "@/lib/api/galleries";
import type { GalleryBanner, GalleryProduct } from "@/lib/api/commerce";
import {
  readPublicDesignConfig,
  readPublicCoverThumbnails,
  readPublicCoverProfileThumbnails,
  resolveCoverDeviceProfile,
} from "@/lib/gallery-design-config";
import {
  galleryAccentCssVars,
  resolveGalleryAccent,
} from "@/lib/gallery-accent";
import { readEmbeddedVideos } from "@/lib/embedded-videos";
import { galleryShareExpiryDays } from "@/lib/gallery-share-expiry";
import {
  appendStoredGalleryKeyFragment,
  setUrlSearchParamBeforeFragment,
} from "@/lib/media-encryption/share-url";
import { mediaKeyIdsForAsset } from "@/lib/media-encryption/asset-media";

interface PreviewPayload {
  gallery: Gallery;
  assets: PublicAsset[];
  albums: PublicGalleryAlbum[];
  totalAssetCount: number;
  branding: GalleryBranding | null;
  banners: GalleryBanner[];
  products: GalleryProduct[];
  publicUrl: string;
  isPublished: boolean;
}

function PreviewSkeleton() {
  return (
    <div className="surface-panel mx-auto mt-6 max-w-3xl space-y-3 p-6">
      <div className="h-4 w-32 animate-pulse rounded bg-surface-container-high" />
      <div className="h-6 w-3/4 animate-pulse rounded bg-surface-container-high" />
      <div className="h-72 animate-pulse rounded-2xl bg-surface-container-high" />
    </div>
  );
}

export default function GalleryPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ album?: string }>;
}) {
  const { id } = use(params);
  const query = searchParams ? use(searchParams) : ({} as { album?: string });
  const albumId =
    typeof query.album === "string" && query.album ? query.album : undefined;

  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerToken] = useState(() => getStoredAccessToken());
  const previewShareUrlRef = useRef("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getStoredAccessToken();
      if (!token) {
        setError("Sign in required.");
        setLoading(false);
        return;
      }

      try {
        const result = await getGalleryClientPreview(token, id, { albumId });
        if (cancelled) return;
        setPayload({
          gallery: result.gallery,
          assets: result.assets,
          albums: result.albums,
          totalAssetCount: result.total_asset_count,
          branding: result.branding ?? null,
          banners: result.banners,
          products: result.products,
          publicUrl: result.public_url || "",
          isPublished: result.is_published === true,
        });
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load gallery.",
          );
          setPayload(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, albumId]);

  const gallery = payload?.gallery ?? null;
  const assets = useMemo(() => payload?.assets ?? [], [payload]);
  const designConfig = useMemo(
    () => (gallery ? readPublicDesignConfig(gallery.settings) : null),
    [gallery],
  );
  const designCoverThumbnails = useMemo(
    () => (gallery ? readPublicCoverThumbnails(gallery.settings) : null),
    [gallery],
  );
  const designCoverProfileThumbnails = useMemo(
    () => (gallery ? readPublicCoverProfileThumbnails(gallery.settings) : null),
    [gallery],
  );
  const designCoverAsset = useMemo(() => {
    if (!gallery) return null;
    const coverAssetId =
      resolveCoverDeviceProfile(designConfig, "desktop").cover.assetId ||
      gallery.cover_asset_id;
    return coverAssetId
      ? (assets.find((asset) => asset.id === coverAssetId) ?? null)
      : null;
  }, [assets, designConfig, gallery]);
  const embeddedVideos = useMemo(
    () =>
      gallery
        ? readEmbeddedVideos(
            gallery.settings as Record<string, unknown> | undefined,
          )
        : [],
    [gallery],
  );
  const publicUrl = useMemo(() => {
    if (!payload?.publicUrl) return "";
    const expectedKeyIds = Array.from(
      new Set(assets.flatMap((asset) => mediaKeyIdsForAsset(asset))),
    );
    return appendStoredGalleryKeyFragment(
      payload.publicUrl,
      id,
      expectedKeyIds,
    );
  }, [assets, id, payload]);
  const getPreviewShareUrl = useCallback(async () => {
    if (previewShareUrlRef.current) return previewShareUrlRef.current;
    if (!gallery || !payload?.isPublished) {
      throw new Error("Publish this gallery before copying the client link.");
    }
    const token = getStoredAccessToken();
    if (!token) {
      throw new Error("Sign in again to create a share link.");
    }
    if (!publicUrl) {
      throw new Error("Share link unavailable: gallery URL is missing.");
    }

    const expiryDays = galleryShareExpiryDays(gallery);
    const created = await createGalleryShareLink(token, gallery.id, {
      access_mode: "public",
      download_allowed: gallery.download_enabled !== false,
      channel: "copy",
      ...(expiryDays !== undefined ? { expiry_days: expiryDays } : {}),
    });
    const shareUrl = setUrlSearchParamBeforeFragment(
      publicUrl,
      "share",
      created.token,
    );
    previewShareUrlRef.current = shareUrl;
    return shareUrl;
  }, [gallery, payload?.isPublished, publicUrl]);
  useEffect(() => {
    previewShareUrlRef.current = "";
  }, [gallery?.id, publicUrl]);
  const galleryAccent = useMemo(
    () =>
      resolveGalleryAccent({
        design: designConfig,
        branding: payload?.branding ?? null,
      }),
    [designConfig, payload?.branding],
  );

  if (loading) return <PreviewSkeleton />;

  if (error || !payload || !gallery) {
    return (
      <div className="surface-panel mx-auto mt-6 max-w-2xl space-y-3 p-6 text-center">
        <h1 className="text-lg font-semibold text-text-primary">
          Can&apos;t preview gallery
        </h1>
        <p className="text-sm text-text-secondary">
          {error || "Gallery not found."}
        </p>
        <Link
          href="/galleries"
          className="btn-primary inline-block px-4 py-2 text-sm"
        >
          Back to galleries
        </Link>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-surface"
      style={galleryAccentCssVars(galleryAccent)}
    >
      <PreviewChrome
        gallery={gallery}
        publicUrl={publicUrl}
        isPublished={payload.isPublished}
        getShareUrl={getPreviewShareUrl}
      />

      <PublicGalleryBody
        gallery={gallery}
        assets={assets}
        branding={payload.branding}
        design={designConfig}
        designCoverAsset={designCoverAsset}
        designCoverThumbnails={designCoverThumbnails}
        designCoverProfileThumbnails={designCoverProfileThumbnails}
        albums={payload.albums}
        totalAssetCount={payload.totalAssetCount}
        activeAlbumId={albumId}
        products={payload.products}
        banners={payload.banners}
        embeddedVideos={embeddedVideos}
        slug={gallery.slug}
        viewerToken={viewerToken}
        previewMode
        previewGalleryId={id}
      />
    </div>
  );
}
