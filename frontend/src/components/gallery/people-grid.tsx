"use client";

/**
 * PeopleGrid — face-recognition "People" view for a gallery.
 *
 * Renders one tile per identified person (face cluster) in the gallery.
 * The cover image is the cluster's sample asset thumbnail, cropped to
 * the face's bounding box via CSS so the tile shows a face — not a
 * randomly-cropped slice of a wedding shot.
 *
 * Click a tile → navigate to /galleries/{id}/people/{clusterLabel}
 * (handled by the page) where a filtered photo grid renders the assets
 * that contain that person.
 *
 * Empty states:
 *   - No clusters yet: shown when the gallery has no faces detected.
 *     Could mean (a) face detection is off (workspace or per-gallery
 *     opt-out), (b) no photos uploaded yet, or (c) detection is still
 *     running in the background. Worded so all three are plausible.
 *   - API error: caller renders the message; this component doesn't
 *     swallow errors.
 *
 * Performance: ClusterSummary doesn't include the sample asset's
 * thumbnail URL — only its ID — so we fetch each sample asset in
 * parallel via Promise.all. With typical wedding galleries having
 * O(10-50) people, this is acceptable. A future optimization is to
 * include the sample's thumbnail_urls in the backend ClusterSummary
 * response so we save a round-trip per tile.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { getFaceClusters, type ClusterSummary, type SampleBoundingBox } from "@/lib/api/ai";
import { getAsset, type Asset } from "@/lib/api/assets";
import { getAssetPreviewUrl } from "@/lib/dashboard-ui";

interface PeopleGridProps {
  galleryId: string;
  token: string;
}

interface PersonTile {
  cluster: ClusterSummary;
  asset?: Asset;
}

export function PeopleGrid({ galleryId, token }: PeopleGridProps) {
  const [tiles, setTiles] = useState<PersonTile[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const clusters = await getFaceClusters(token, galleryId);
        // Fetch the cover asset for every cluster in parallel. We
        // tolerate per-tile failures so one missing asset doesn't blank
        // the whole grid — just renders a fallback placeholder.
        const settled = await Promise.allSettled(
          clusters.map((c) => getAsset(token, c.sample_asset_id)),
        );
        const next: PersonTile[] = clusters.map((cluster, i) => {
          const r = settled[i];
          return {
            cluster,
            asset: r.status === "fulfilled" ? r.value : undefined,
          };
        });
        if (!cancelled) setTiles(next);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load people");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [galleryId, token]);

  if (error) {
    return (
      <div className="rounded-xl border border-feedback-error/30 bg-feedback-error/10 px-5 py-4 text-sm text-feedback-error">
        {error}
      </div>
    );
  }

  if (tiles === null) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-container-low p-8 text-center text-sm text-text-secondary">
        Loading people…
      </div>
    );
  }

  if (tiles.length === 0) {
    return (
      <div className="surface-panel p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high">
          <UserRound className="h-6 w-6 text-text-tertiary" aria-hidden />
        </div>
        <p className="text-sm font-medium text-text-primary">No people identified yet</p>
        <p className="mt-1 text-xs text-text-secondary">
          Face recognition runs in the background after photos finish uploading.
          If you don&apos;t see anyone here yet, detection may still be processing,
          or face recognition may be turned off for this gallery in Settings.
        </p>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      role="list"
      aria-label="Identified people"
    >
      {tiles.map((tile) => (
        <PersonTile
          key={tile.cluster.cluster_label}
          galleryId={galleryId}
          cluster={tile.cluster}
          asset={tile.asset}
          token={token}
        />
      ))}
    </div>
  );
}

// PersonTile renders a single person card. The cover image is positioned
// via CSS object-fit + transform-origin so the face area sits near the
// tile's center — see cropStyle below for the math.
function PersonTile({
  galleryId,
  cluster,
  asset,
  token,
}: {
  galleryId: string;
  cluster: ClusterSummary;
  asset: Asset | undefined;
  token: string;
}) {
  const previewUrl = asset ? getAssetPreviewUrl(asset, token) : "";
  const displayName = cluster.cluster_name?.trim() || "Unnamed person";
  const cropStyle = computeCropStyle(asset, cluster.sample_bounding_box);

  return (
    <Link
      href={`/galleries/${galleryId}/people/${cluster.cluster_label}`}
      className="group block focus:outline-none"
      aria-label={`${displayName}, ${cluster.asset_count} ${cluster.asset_count === 1 ? "photo" : "photos"}`}
      role="listitem"
    >
      <div
        className="relative aspect-square overflow-hidden rounded-2xl border border-border-subtle bg-surface-container-high transition-transform group-hover:scale-[1.02] group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2"
      >
        {previewUrl ? (
          // Using <img> rather than next/image because storage paths
          // resolve with a JWT query param that complicates next-image's
          // loader, and the host needs to be allowlisted in next.config
          // domains. Mirrors the rest of the dashboard gallery grids.
          <img
            src={previewUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={cropStyle}
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <UserRound className="h-10 w-10 text-text-tertiary" aria-hidden />
          </div>
        )}

        {/* Photo-count chip */}
        <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
          {cluster.asset_count}
        </span>
      </div>

      <div className="mt-2 px-1">
        <p className="truncate text-sm font-semibold text-text-primary">
          {displayName}
        </p>
        <p className="text-xs text-text-tertiary">
          {cluster.asset_count} {cluster.asset_count === 1 ? "photo" : "photos"}
        </p>
      </div>
    </Link>
  );
}

// computeCropStyle zooms the cover thumbnail in on the face area so the
// People-tab tile shows JUST the person's face, not the whole photo with
// a slightly-shifted focal point.
//
// Math:
//   - The <img> is `object-fit: cover` filling a square tile of size T.
//   - cover-fit scales the image by s_cover = T / min(W, H) so the image
//     covers the tile.
//   - The face in fitted-tile coords is then max(bw, bh) * s_cover wide.
//   - We want the face area to fill ~70% of the tile (some headroom so
//     hair / chin aren't cut off). The additional CSS `transform: scale(Z)`
//     gets us there:
//        Z = 0.7 * T / (max(bw, bh) * s_cover)
//          = 0.7 * min(W, H) / max(bw, bh)
//   - transform-origin is set to the SAME point as object-position so
//     when the image is scaled it stays centered on the face. Without
//     matching origins, scale() would zoom from the tile's geometric
//     center and the face would slide out of frame.
//   - Z is capped to [1, 4]. The ceiling prevents pixelation when the
//     thumbnail source is 600px and the face is tiny (4× zoom of a
//     150px-wide face in a 2400px-wide source = ~37px in the tile —
//     barely usable; anything beyond that just blurs).
//
// Fallback: if asset dimensions or bbox are missing, return a centered
// object-position with no zoom — same as a plain <img object-cover>.
function computeCropStyle(
  asset: Asset | undefined,
  bbox: SampleBoundingBox | undefined,
): React.CSSProperties {
  if (!asset?.width || !asset?.height || !bbox || (bbox.w === 0 && bbox.h === 0)) {
    return { objectPosition: "center" };
  }
  // Face center in image-relative coords [0..1] → percentages.
  const cxPct = ((bbox.x + bbox.w / 2) / asset.width) * 100;
  const cyPct = ((bbox.y + bbox.h / 2) / asset.height) * 100;
  // Clamp so off-center faces near the edge stay visible.
  const px = Math.max(0, Math.min(100, cxPct));
  const py = Math.max(0, Math.min(100, cyPct));

  // Zoom factor — see comment block above for the derivation.
  const minImgDim = Math.min(asset.width, asset.height);
  const maxBboxDim = Math.max(bbox.w, bbox.h);
  const FACE_FILL = 0.7; // target: face occupies ~70% of tile
  const rawZoom = (FACE_FILL * minImgDim) / Math.max(1, maxBboxDim);
  const zoom = Math.max(1, Math.min(4, rawZoom));

  return {
    objectPosition: `${px}% ${py}%`,
    transform: `scale(${zoom.toFixed(2)})`,
    transformOrigin: `${px}% ${py}%`,
  };
}
