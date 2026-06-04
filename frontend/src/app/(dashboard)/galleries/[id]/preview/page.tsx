"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  getGallery,
  getPublicGalleryBranding,
  listAlbumAssets,
  listGalleryAssets,
  type Gallery,
  type GalleryBranding,
  type PublicAsset,
} from "@/lib/api/galleries";
import { getAsset, type Asset } from "@/lib/api/assets";
import { PublicGalleryHero } from "@/components/gallery/public-gallery-hero";
import { PublicGalleryGrid } from "@/components/gallery/public-gallery-grid";
import { PreviewChrome } from "@/components/gallery/preview-chrome";
import {
  readPublicDesignConfig,
  readPublicCoverThumbnails,
} from "@/lib/gallery-design-config";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { appendStoredGalleryKeyFragment } from "@/lib/media-encryption/share-url";

// Owner-facing preview of the public gallery. Renders the saved Design
// Studio output (same Hero + Grid components the public /g/[slug] route
// uses) while keeping the dashboard top menu bar visible — the page lives
// under the (dashboard) layout segment so the header/sidebar persist.
//
// Why this route instead of /g/[slug]?mode=client:
//   1. /g/[slug] is publicly accessible and enforces is_published. The
//      owner must be able to preview unpublished galleries before going
//      live, so we hit the authenticated GET /api/v1/galleries/{id}
//      endpoint which has no publish gate for the owner.
//   2. The public layout strips the dashboard chrome by design. The user
//      requested a preview that retains the top menu bar so navigating
//      back to other workspace pages stays one click away.

// Storage paths returned by the owner asset endpoint (e.g. display_webp.webp)
// may be bare storage keys. Normalize them through getStorageBackedUrl so all
// surfaces (hero cover, grid tiles, lightbox) receive API /storage/* URLs while
// auth rides on the HttpOnly access-token cookie.
function normalizeStorageUrls(
  urls: Record<string, string> | undefined | null,
  token: string,
): Record<string, string> {
  if (!urls) return {};
  const out: Record<string, string> = {};
  for (const [variant, raw] of Object.entries(urls)) {
    if (typeof raw === "string" && raw.length > 0) {
      out[variant] = getStorageBackedUrl(raw, token);
    }
  }
  return out;
}

function mapAssetToPublic(
  record: { asset: Asset | null; sort_order: number },
  token: string,
): PublicAsset | null {
  const a = record.asset;
  if (!a) return null;
  return {
    id: a.id,
    filename: a.filename,
    content_type: a.content_type,
    width: a.width,
    height: a.height,
    blurhash: a.blurhash,
    thumbnail_urls: normalizeStorageUrls(a.thumbnail_urls, token),
    is_encrypted: a.is_encrypted,
    media_encryption: a.media_encryption,
    sort_order: record.sort_order,
  };
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

  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [assets, setAssets] = useState<PublicAsset[]>([]);
  // Cover thumbnails are normally enriched server-side by the public
  // gallery handler (see backend public_gallery_handler.go::GetBySlug). The
  // owner GET /api/v1/galleries/{id} endpoint does not do that enrichment,
  // so we resolve the cover asset client-side from design_config.cover.assetId
  // (falling back to gallery.cover_asset_id) and attach its thumbnail URLs
  // here. Without this, the hero falls through to picking display_webp from
  // the asset list, which 401s in the broken-image-hides-overlay pattern
  // that hid the design title + subtitle in the first reported bug.
  const [resolvedCoverThumbnails, setResolvedCoverThumbnails] = useState<Record<
    string,
    string
  > | null>(null);
  const [resolvedCoverAsset, setResolvedCoverAsset] =
    useState<PublicAsset | null>(null);
  const [branding, setBranding] = useState<GalleryBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Owner access token, threaded into the shared public Hero + Grid as their
  // decrypt bearer `token`. Without it those components fetch the encrypted
  // /storage bytes anonymously and 401/403 — leaving the photographer's own
  // preview with blank tiles for an unpublished/private E2EE gallery. Same
  // pattern as the dashboard detail page's GalleryAssetTileImage. Captured once
  // on mount (the page already requires this token in the loader below).
  const [viewerToken] = useState(() => getStoredAccessToken());

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
        // 1. Owner-scoped gallery row carries the saved design_config in
        //    settings (set by gallery_design_handler::UpdateDesign).
        const galleryRow = await getGallery(token, id);
        if (cancelled) return;
        setGallery(galleryRow);

        // 2. Resolve assets. Album filter mirrors /g/[slug]?album=… so the
        //    preview matches the share link the photographer would send
        //    when they want clients to land on a sub-album.
        const rows: Array<{
          asset_id: string;
          sort_order: number;
          asset?: Asset | null;
        }> = albumId
          ? // Q-2b: embed each asset in one bulk query so the album path skips
            // the per-asset getAsset() fan-out, mirroring the gallery path
            // below (PERF-23). row.asset is undefined only against an older
            // server that doesn't honor include_assets — then the loop below
            // falls back to a per-asset fetch.
            (
              await listAlbumAssets(token, albumId, { includeAssets: true })
            ).map((row, idx) => ({
              asset_id: row.asset_id,
              sort_order: row.position ?? idx,
              asset: row.asset,
            }))
          : // PERF-23: embed each asset in one bulk query so the gallery path
            // skips the per-asset getAsset() fan-out.
            (await listGalleryAssets(token, id, { includeAssets: true })).map(
              (row) => ({
                asset_id: row.asset_id,
                sort_order: row.sort_order,
                asset: row.asset,
              }),
            );

        const enriched = await Promise.all(
          rows.map(async (row) => {
            try {
              // Use the server-embedded asset when present (gallery path);
              // fall back to a per-asset fetch for the album path / degraded
              // include. row.asset === undefined means "not embedded".
              const asset =
                row.asset !== undefined
                  ? row.asset
                  : await getAsset(token, row.asset_id);
              if (!asset) return null;
              return mapAssetToPublic(
                { asset, sort_order: row.sort_order },
                token,
              );
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;
        const filtered = enriched
          .filter((a): a is PublicAsset => a !== null)
          .sort((a, b) => a.sort_order - b.sort_order);
        setAssets(filtered);

        // 3. Cover thumbnails. Mirror the server-side resolution from the
        //    public handler so the design path renders the same cover the
        //    photographer chose in Design Studio. design.cover.assetId wins
        //    over gallery.cover_asset_id. Fall back to a separate asset
        //    fetch if the cover isn't present in the album-filtered list.
        const designAssetId =
          galleryRow.settings &&
          typeof galleryRow.settings === "object" &&
          (galleryRow.settings as Record<string, unknown>)["design_config"]
            ? (
                (galleryRow.settings as Record<string, unknown>)[
                  "design_config"
                ] as { cover?: { assetId?: string } } | undefined
              )?.cover?.assetId
            : undefined;
        const coverAssetId = designAssetId || galleryRow.cover_asset_id;
        if (coverAssetId) {
          const fromList = filtered.find((a) => a.id === coverAssetId);
          if (fromList) {
            // Already token-baked in step 2.
            if (!cancelled) {
              setResolvedCoverAsset(fromList);
              setResolvedCoverThumbnails(fromList.thumbnail_urls);
            }
          } else {
            try {
              const coverAsset = await getAsset(token, coverAssetId);
              const mappedCoverAsset = mapAssetToPublic(
                { asset: coverAsset, sort_order: -1 },
                token,
              );
              if (!cancelled) {
                setResolvedCoverAsset(mappedCoverAsset);
                setResolvedCoverThumbnails(
                  normalizeStorageUrls(coverAsset.thumbnail_urls, token),
                );
              }
            } catch {
              if (!cancelled) {
                setResolvedCoverAsset(null);
                setResolvedCoverThumbnails(null);
              }
            }
          }
        }

        // 4. Branding lives behind the public endpoint, which 404s for
        //    unpublished galleries — skip the call entirely in that case to
        //    keep DevTools clean. The hero already tolerates null branding.
        if (galleryRow.is_published && galleryRow.slug) {
          try {
            const b = await getPublicGalleryBranding(galleryRow.slug);
            if (!cancelled) setBranding(b);
          } catch {
            if (!cancelled) setBranding(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load gallery.",
          );
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

  const origin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const publicUrl = useMemo(() => {
    if (!gallery?.slug || !origin) return "";
    return appendStoredGalleryKeyFragment(`${origin}/g/${gallery.slug}`, id);
  }, [gallery, id, origin]);

  const designConfig = useMemo(
    () => (gallery ? readPublicDesignConfig(gallery.settings) : null),
    [gallery],
  );
  // Prefer the client-resolved cover thumbnails (always present when the
  // gallery has any cover asset). Fall back to settings-derived data in
  // case the server has been updated to enrich the owner endpoint later.
  const designCoverThumbnails = useMemo(() => {
    if (resolvedCoverThumbnails) return resolvedCoverThumbnails;
    return gallery ? readPublicCoverThumbnails(gallery.settings) : null;
  }, [resolvedCoverThumbnails, gallery]);

  if (loading) return <PreviewSkeleton />;

  if (error || !gallery) {
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
    <div className="min-h-screen bg-surface">
      <PreviewChrome gallery={gallery} publicUrl={publicUrl} />

      <PublicGalleryHero
        gallery={gallery}
        assets={assets}
        branding={branding}
        design={designConfig}
        designCoverAsset={resolvedCoverAsset}
        designCoverThumbnails={designCoverThumbnails}
        viewerToken={viewerToken}
      />

      <div id="gallery-grid" className="mx-auto max-w-6xl px-4 pb-16">
        <PublicGalleryGrid
          slug={gallery.slug}
          assets={assets}
          galleryType={gallery.gallery_type}
          maxSelections={gallery.max_selections || 0}
          downloadEnabled={gallery.download_enabled !== false}
          downloadQuality={gallery.download_quality}
          favoritesDisabledReason="Favorites are disabled in owner preview and will not affect client counts."
          design={designConfig}
          watermark={gallery.watermark_config as Record<string, unknown> | null}
          viewerToken={viewerToken}
        />
      </div>
    </div>
  );
}
