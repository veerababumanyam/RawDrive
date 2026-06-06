"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getClusterFaces,
  getFaceClusters,
  mergeClusters,
  renameCluster,
  splitCluster,
  type ClusterSummary,
  type FaceReviewRow,
} from "@/lib/api/ai";
import { listGalleryAssets } from "@/lib/api/galleries";
import type { Asset } from "@/lib/api/assets";
import { GRID_VARIANTS } from "@/lib/media-encryption/asset-media";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";
import { LockedMediaFallback } from "@/components/gallery/media-key-recovery";
import { cn } from "@/lib/utils";

const FACE_REVIEW_PAGE_SIZE = 48;

function faceLabel(cluster: ClusterSummary): string {
  return cluster.cluster_name?.trim() || "Unnamed person";
}

function FaceTile({
  asset,
  face,
  selected,
  token,
  onToggle,
}: {
  asset?: Asset | null;
  face: FaceReviewRow;
  selected: boolean;
  token: string | null;
  onToggle: (faceId: string) => void;
}) {
  const media = useDecryptedAssetUrl(asset, GRID_VARIANTS, token);
  const centerX = Math.max(
    0,
    Math.min(100, (face.bounding_box.x + face.bounding_box.w / 2) * 100),
  );
  const centerY = Math.max(
    0,
    Math.min(100, (face.bounding_box.y + face.bounding_box.h / 2) * 100),
  );

  return (
    <button
      type="button"
      onClick={() => onToggle(face.id)}
      className={cn(
        "group overflow-hidden rounded-lg border bg-surface-container-high text-left transition focus:outline-none focus:ring-2 focus:ring-border-focus",
        selected
          ? "border-accent bg-accent-muted"
          : "border-border-subtle hover:border-border-focus",
      )}
      aria-pressed={selected}
      aria-label={`Face ${face.face_index + 1} from ${
        asset?.filename ?? "photo"
      }`}
    >
      <div className="aspect-square overflow-hidden bg-surface-sunken">
        {media.loading ? (
          <div
            className="h-full w-full animate-pulse bg-surface-container"
            aria-hidden="true"
          />
        ) : media.src ? (
          <img
            src={media.src}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            style={{ objectPosition: `${centerX}% ${centerY}%` }}
          />
        ) : (
          <LockedMediaFallback
            asset={asset}
            error={media.error}
            message={media.error || "No preview"}
            className="px-2"
          />
        )}
      </div>
      <div className="space-y-1 p-2">
        <p className="truncate text-xs font-medium text-text-primary">
          {asset?.filename ?? "Unavailable photo"}
        </p>
        <p className="text-2xs text-text-tertiary">
          {Math.round(face.confidence * 100)}% · {face.source}
        </p>
      </div>
    </button>
  );
}

export function FaceIdentityReviewPanel({
  galleryId,
  token,
}: {
  galleryId: string;
  token: string | null;
}) {
  const [clusters, setClusters] = useState<ClusterSummary[]>([]);
  const [faces, setFaces] = useState<FaceReviewRow[]>([]);
  const [assetsById, setAssetsById] = useState<Map<string, Asset>>(new Map());
  const [selectedClusterId, setSelectedClusterId] = useState("");
  const [selectedFaceIds, setSelectedFaceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [targetClusterId, setTargetClusterId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [splitName, setSplitName] = useState("");
  const [loadingClusters, setLoadingClusters] = useState(true);
  const [loadingFaces, setLoadingFaces] = useState(false);
  const [visibleFaceCount, setVisibleFaceCount] = useState(
    FACE_REVIEW_PAGE_SIZE,
  );
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");

  const selectedCluster = clusters.find(
    (cluster) => cluster.cluster_label === selectedClusterId,
  );
  const mergeTargets = clusters.filter(
    (cluster) => cluster.cluster_label !== selectedClusterId,
  );

  const selectedCount = selectedFaceIds.size;
  const canSplit = selectedCount > 0 && selectedCount < faces.length;
  const canMerge = Boolean(selectedClusterId && targetClusterId);
  const visibleFaces = useMemo(
    () => faces.slice(0, visibleFaceCount),
    [faces, visibleFaceCount],
  );

  const loadClusters = useCallback(async () => {
    setLoadingClusters(true);
    setError("");
    try {
      const next = await getFaceClusters(token ?? "", galleryId);
      setClusters(next);
      setSelectedClusterId((current) => {
        if (
          current &&
          next.some((cluster) => cluster.cluster_label === current)
        ) {
          return current;
        }
        return next[0]?.cluster_label ?? "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "People review failed");
      setClusters([]);
      setSelectedClusterId("");
    } finally {
      setLoadingClusters(false);
    }
  }, [galleryId, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadClusters();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadClusters]);

  useEffect(() => {
    let ignore = false;
    listGalleryAssets(token ?? "", galleryId, { includeAssets: true })
      .then((entries) => {
        if (ignore) return;
        const next = new Map<string, Asset>();
        for (const entry of entries) {
          if (entry.asset) next.set(entry.asset_id, entry.asset);
        }
        setAssetsById(next);
      })
      .catch((err) => {
        if (!ignore) {
          setError(
            err instanceof Error ? err.message : "Gallery media load failed",
          );
        }
      });
    return () => {
      ignore = true;
    };
  }, [galleryId, token]);

  useEffect(() => {
    if (!selectedClusterId) {
      const timer = window.setTimeout(() => {
        setFaces([]);
        setSelectedFaceIds(new Set());
        setRenameValue("");
        setTargetClusterId("");
        setVisibleFaceCount(FACE_REVIEW_PAGE_SIZE);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    let ignore = false;
    const timer = window.setTimeout(() => {
      if (ignore) return;
      setLoadingFaces(true);
      setSelectedFaceIds(new Set());
      setTargetClusterId("");
      setVisibleFaceCount(FACE_REVIEW_PAGE_SIZE);
      setError("");
      getClusterFaces(token ?? "", selectedClusterId, galleryId)
        .then((result) => {
          if (!ignore) setFaces(result.faces);
        })
        .catch((err) => {
          if (!ignore) {
            setFaces([]);
            setError(err instanceof Error ? err.message : "Face list failed");
          }
        })
        .finally(() => {
          if (!ignore) setLoadingFaces(false);
        });
    }, 0);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [galleryId, selectedClusterId, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRenameValue(selectedCluster ? faceLabel(selectedCluster) : "");
      setSplitName("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedCluster]);

  const toggleFace = useCallback((faceId: string) => {
    setSelectedFaceIds((current) => {
      const next = new Set(current);
      if (next.has(faceId)) {
        next.delete(faceId);
      } else {
        next.add(faceId);
      }
      return next;
    });
  }, []);

  const selectCluster = useCallback((clusterId: string) => {
    setSelectedClusterId(clusterId);
    setSelectedFaceIds(new Set());
    setTargetClusterId("");
    setSplitName("");
    setVisibleFaceCount(FACE_REVIEW_PAGE_SIZE);
  }, []);

  async function runAction(label: string, action: () => Promise<void>) {
    setBusyAction(label);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusyAction("");
    }
  }

  const handleRename = () =>
    runAction("Rename", async () => {
      if (!selectedClusterId || !renameValue.trim()) return;
      await renameCluster(token ?? "", selectedClusterId, renameValue.trim());
      await loadClusters();
    });

  const handleMerge = () =>
    runAction("Merge", async () => {
      if (!canMerge) return;
      const target = targetClusterId;
      await mergeClusters(token ?? "", selectedClusterId, target);
      await loadClusters();
      selectCluster(target);
    });

  const handleSplit = () =>
    runAction("Split", async () => {
      if (!canSplit) return;
      const result = await splitCluster(
        token ?? "",
        selectedClusterId,
        Array.from(selectedFaceIds),
        splitName.trim() || "New person",
      );
      await loadClusters();
      selectCluster(result.new_cluster_label);
    });

  const clusterStats = useMemo(
    () => ({
      people: clusters.length,
      faces: clusters.reduce((sum, cluster) => sum + cluster.face_count, 0),
      photos: clusters.reduce((sum, cluster) => sum + cluster.asset_count, 0),
    }),
    [clusters],
  );

  return (
    <section className="surface-panel space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-tertiary">
            People Review
          </p>
          <h2 className="text-lg font-semibold text-text-primary">
            Face identities in this gallery
          </h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
          <span className="rounded-full bg-surface-container px-3 py-1">
            {clusterStats.people} people
          </span>
          <span className="rounded-full bg-surface-container px-3 py-1">
            {clusterStats.faces} faces
          </span>
          <span className="rounded-full bg-surface-container px-3 py-1">
            {clusterStats.photos} photos
          </span>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-feedback-error/20 bg-feedback-error/10 px-3 py-2 text-sm text-feedback-error"
        >
          {error}
        </p>
      ) : null}

      {loadingClusters ? (
        <div className="h-28 animate-pulse rounded-lg bg-surface-container" />
      ) : clusters.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-surface-container p-4 text-sm text-text-secondary">
          No indexed people yet.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="space-y-2 lg:col-span-4">
            {clusters.map((cluster) => (
              <button
                key={cluster.cluster_label}
                type="button"
                onClick={() => selectCluster(cluster.cluster_label)}
                className={cn(
                  "touch-min w-full rounded-lg border px-3 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-border-focus",
                  selectedClusterId === cluster.cluster_label
                    ? "border-accent bg-accent-muted"
                    : "border-border-subtle bg-surface-container hover:bg-surface-container-high",
                )}
              >
                <span className="block truncate text-sm font-semibold text-text-primary">
                  {faceLabel(cluster)}
                </span>
                <span className="text-xs text-text-secondary">
                  {cluster.face_count} faces · {cluster.asset_count} photos
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-4 lg:col-span-8">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs font-medium text-text-secondary">
                  Name
                </span>
                <input
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  className="touch-min w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-text-secondary">
                  Merge into
                </span>
                <select
                  value={targetClusterId}
                  onChange={(event) => setTargetClusterId(event.target.value)}
                  className="touch-min w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                >
                  <option value="">Choose person</option>
                  {mergeTargets.map((cluster) => (
                    <option
                      key={cluster.cluster_label}
                      value={cluster.cluster_label}
                    >
                      {faceLabel(cluster)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-text-secondary">
                  Split name
                </span>
                <input
                  value={splitName}
                  onChange={(event) => setSplitName(event.target.value)}
                  placeholder="New person"
                  className="touch-min w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRename}
                disabled={Boolean(busyAction) || !renameValue.trim()}
                className="surface-button text-sm"
              >
                {busyAction === "Rename" ? "Saving" : "Save name"}
              </button>
              <button
                type="button"
                onClick={handleMerge}
                disabled={Boolean(busyAction) || !canMerge}
                className="surface-button text-sm"
              >
                {busyAction === "Merge" ? "Merging" : "Merge people"}
              </button>
              <button
                type="button"
                onClick={handleSplit}
                disabled={Boolean(busyAction) || !canSplit}
                className="surface-button text-sm"
              >
                {busyAction === "Split"
                  ? "Splitting"
                  : `Split ${selectedCount || ""}`.trim()}
              </button>
            </div>

            {loadingFaces ? (
              <div className="h-48 animate-pulse rounded-lg bg-surface-container" />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {visibleFaces.map((face) => (
                  <FaceTile
                    key={face.id}
                    face={face}
                    asset={assetsById.get(face.asset_id)}
                    selected={selectedFaceIds.has(face.id)}
                    token={token}
                    onToggle={toggleFace}
                  />
                ))}
              </div>
            )}
            {visibleFaces.length < faces.length ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-container px-3 py-2 text-xs text-text-secondary">
                <span>
                  Showing {visibleFaces.length} of {faces.length} faces
                </span>
                <button
                  type="button"
                  className="surface-button text-xs"
                  onClick={() =>
                    setVisibleFaceCount((current) =>
                      Math.min(current + FACE_REVIEW_PAGE_SIZE, faces.length),
                    )
                  }
                >
                  Show more
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
