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

// computeCropStyle uses the face bounding box (image-pixel coords) +
// the asset's known dimensions to position the cover thumbnail so the
// face sits centered in the square tile. We use object-position rather
// than clip-path so the image still fills the tile (no transparent
// gaps) and the crop scales with the tile size.
//
// If bbox or asset dimensions are missing we fall back to object-position:
// center, which is the same default as a plain <img> with object-cover.
function computeCropStyle(
  asset: Asset | undefined,
  bbox: SampleBoundingBox | undefined,
): React.CSSProperties {
  if (!asset?.width || !asset?.height || !bbox) {
    return { objectPosition: "center" };
  }
  // Center of the face in image-relative coordinates [0..1].
  const cx = (bbox.x + bbox.w / 2) / asset.width;
  const cy = (bbox.y + bbox.h / 2) / asset.height;
  // object-position takes percentages 0–100; clamp so an off-center
  // face near the image edge doesn't get pushed all the way out.
  const px = Math.max(0, Math.min(100, cx * 100));
  const py = Math.max(0, Math.min(100, cy * 100));
  return { objectPosition: `${px}% ${py}%` };
}
