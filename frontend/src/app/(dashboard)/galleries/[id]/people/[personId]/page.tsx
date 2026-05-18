"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { GalleryWorkspaceNav } from "@/components/gallery/gallery-workspace-nav";
import { getClusterAssets, getFaceClusters, renameCluster, type ClusterSummary } from "@/lib/api/ai";
import { getAsset, type Asset } from "@/lib/api/assets";
import { getAssetPreviewUrl } from "@/lib/dashboard-ui";
import { getStoredAccessToken } from "@/lib/auth";

// Per-person filtered photo grid.
//
// URL: /galleries/{id}/people/{personId}
// where personId is the cluster_label UUID from face_clusters.
//
// Loads:
//   1. The cluster's metadata (name, asset count) — by listing all
//      clusters for the gallery and matching the label. We don't have a
//      single-cluster endpoint, so this is the cheapest way to get the
//      display name without a backend change.
//   2. The list of asset IDs that contain this person via
//      /api/v1/ai/clusters/{personId}/assets.
//   3. Each asset's full record (for thumbnails) — parallel fetch.
//
// Rename: the existing /clusters/{id} PATCH endpoint lets us set a
// human-readable name. Inline-edit pattern: click the name → input,
// blur or Enter saves. Matches the pattern used elsewhere in the
// dashboard for in-place renames.
export default function PersonPhotosPage({
  params,
}: {
  params: Promise<{ id: string; personId: string }>;
}) {
  const { id, personId } = use(params);
  const [token] = useState(() => getStoredAccessToken());
  const [cluster, setCluster] = useState<ClusterSummary | null>(null);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        // Two parallel-ish loads:
        // (a) clusters list to pick the one matching personId
        // (b) cluster asset IDs → then asset thumbnails
        const [clustersList, assetsResp] = await Promise.all([
          getFaceClusters(token, id),
          getClusterAssets(token, personId),
        ]);

        const matched = clustersList.find((c) => c.cluster_label === personId) ?? null;
        if (!cancelled) {
          setCluster(matched);
          setDraftName(matched?.cluster_name ?? "");
        }

        // Fetch each asset record for thumbnails. Per-tile failures are
        // tolerated so a missing/deleted asset doesn't blank the page.
        const settled = await Promise.allSettled(
          assetsResp.asset_ids.map((aid) => getAsset(token, aid)),
        );
        const ok = settled
          .filter((r): r is PromiseFulfilledResult<Asset> => r.status === "fulfilled")
          .map((r) => r.value);
        if (!cancelled) setAssets(ok);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load person");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, personId, token]);

  const saveName = async () => {
    if (!token) return;
    const next = draftName.trim();
    if (next === (cluster?.cluster_name ?? "")) {
      setEditing(false);
      return;
    }
    setRenaming(true);
    try {
      await renameCluster(token, personId, next);
      setCluster((c) => (c ? { ...c, cluster_name: next } : c));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setRenaming(false);
    }
  };

  const displayName = cluster?.cluster_name?.trim() || "Unnamed person";

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <GalleryWorkspaceNav galleryId={id} />

      <Link
        href={`/galleries/${id}/people`}
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <ChevronLeft className="h-4 w-4" />
        All people
      </Link>

      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Person</p>
        {editing ? (
          <input
            type="text"
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveName();
              if (e.key === "Escape") {
                setDraftName(cluster?.cluster_name ?? "");
                setEditing(false);
              }
            }}
            disabled={renaming}
            placeholder="Add a name (e.g. Bride, Groom)…"
            className="block w-full max-w-md rounded-xl border border-border-default bg-surface-container px-3 py-2 text-2xl font-semibold text-text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="block max-w-md text-left text-2xl font-semibold text-text-primary hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent rounded"
            aria-label="Rename this person"
          >
            {displayName}
            <span className="ml-2 text-xs font-normal text-text-tertiary">(click to rename)</span>
          </button>
        )}
        <p className="text-sm text-text-secondary">
          {cluster ? `${cluster.asset_count} ${cluster.asset_count === 1 ? "photo" : "photos"} · ${cluster.face_count} ${cluster.face_count === 1 ? "face detected" : "faces detected"}` : "Loading…"}
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-feedback-error/30 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}

      {assets === null && !error && (
        <div className="rounded-xl border border-border-subtle bg-surface-container-low p-8 text-center text-sm text-text-secondary">
          Loading photos…
        </div>
      )}

      {assets !== null && assets.length === 0 && !error && (
        <div className="surface-panel p-8 text-center text-sm text-text-secondary">
          No photos found for this person.
        </div>
      )}

      {assets !== null && assets.length > 0 && (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          role="list"
        >
          {assets.map((asset) => {
            const url = getAssetPreviewUrl(asset, token);
            return (
              <Link
                key={asset.id}
                href={`/galleries/${id}?asset=${asset.id}`}
                className="group block aspect-square overflow-hidden rounded-xl border border-border-subtle bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-accent"
                role="listitem"
                aria-label={asset.filename}
              >
                {url ? (
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-text-tertiary">
                    No preview
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
