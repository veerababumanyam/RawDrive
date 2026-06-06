"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getClusterFaces,
  getGalleryFaceIndexStatus,
  getFaceClusters,
  linkClusterContact,
  mergeClusters,
  renameCluster,
  splitCluster,
  unlinkClusterContact,
  type ClusterSummary,
  type FaceIndexStatus,
  type FaceReviewRow,
} from "@/lib/api/ai";
import { listGalleryAssets } from "@/lib/api/galleries";
import type { Asset } from "@/lib/api/assets";
import { listContacts, type Contact } from "@/lib/api/crm";
import { GRID_VARIANTS } from "@/lib/media-encryption/asset-media";
import {
  FACE_INDEX_BROWSER_VARIANTS,
  indexAssetFacesFromBrowser,
} from "@/lib/media-encryption/face-index-browser";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";
import { LockedMediaFallback } from "@/components/gallery/media-key-recovery";
import { cn } from "@/lib/utils";

const FACE_REVIEW_PAGE_SIZE = 48;
const FACE_INDEX_CONCURRENCY = 3;

type FaceIndexRunState = {
  running: boolean;
  processed: number;
  total: number;
  stored: number;
  failed: number;
  current: string;
};

const IDLE_FACE_INDEX_RUN: FaceIndexRunState = {
  running: false,
  processed: 0,
  total: 0,
  stored: 0,
  failed: 0,
  current: "",
};

function faceLabel(cluster: ClusterSummary): string {
  return cluster.cluster_name?.trim() || "Unnamed person";
}

function mediaEncryptionRecord(asset: Asset): Record<string, unknown> {
  return asset.media_encryption && typeof asset.media_encryption === "object"
    ? asset.media_encryption
    : {};
}

function hasFaceIndexDerivative(asset: Asset): boolean {
  const encryptedMedia = mediaEncryptionRecord(asset);
  return FACE_INDEX_BROWSER_VARIANTS.some((variant) => {
    const thumb = asset.thumbnail_urls?.[variant];
    const manifest = encryptedMedia[variant];
    return (
      (typeof thumb === "string" && thumb.length > 0) ||
      (Boolean(manifest) && typeof manifest === "object")
    );
  });
}

function assetCanBrowserIndexFaces(asset: Asset): boolean {
  return (
    asset.status === "ready" &&
    asset.content_type.toLowerCase().startsWith("image/") &&
    hasFaceIndexDerivative(asset)
  );
}

function contactLabel(contact: Contact): string {
  const detail = contact.email || contact.phone || contact.contact_type;
  return detail ? `${contact.name} (${detail})` : contact.name;
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
  const [indexStatus, setIndexStatus] = useState<FaceIndexStatus | null>(null);
  const [indexRun, setIndexRun] = useState<FaceIndexRunState>(
    IDLE_FACE_INDEX_RUN,
  );
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState("");
  const [selectedFaceIds, setSelectedFaceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [targetClusterId, setTargetClusterId] = useState("");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [splitName, setSplitName] = useState("");
  const [loadingClusters, setLoadingClusters] = useState(true);
  const [loadingFaces, setLoadingFaces] = useState(false);
  const [visibleFaceCount, setVisibleFaceCount] = useState(
    FACE_REVIEW_PAGE_SIZE,
  );
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const faceIndexAbortRef = useRef<AbortController | null>(null);

  const selectedCluster = clusters.find(
    (cluster) => cluster.cluster_label === selectedClusterId,
  );
  const mergeTargets = clusters.filter(
    (cluster) => cluster.cluster_label !== selectedClusterId,
  );
  const indexableAssets = useMemo(
    () => Array.from(assetsById.values()).filter(assetCanBrowserIndexFaces),
    [assetsById],
  );
  const visibleClusters = useMemo(() => {
    const query = personQuery.trim().toLowerCase();
    if (!query) return clusters;
    return clusters.filter((cluster) => {
      const linked = cluster.linked_contact;
      return [
        faceLabel(cluster),
        linked?.name,
        linked?.email,
        linked?.phone,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [clusters, personQuery]);
  const visibleContacts = useMemo(() => {
    const query = contactQuery.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) =>
      [contact.name, contact.email, contact.phone, contact.company]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [contactQuery, contacts]);

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

  const loadIndexStatus = useCallback(async () => {
    try {
      const status = await getGalleryFaceIndexStatus(token ?? "", galleryId);
      setIndexStatus(status);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("404") || message.includes("405")) {
        setIndexStatus(null);
        return;
      }
      setIndexStatus(null);
      setError(err instanceof Error ? err.message : "FaceID status failed");
    }
  }, [galleryId, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadClusters();
      void loadIndexStatus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadClusters, loadIndexStatus]);

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
    let ignore = false;
    const timer = window.setTimeout(() => {
      if (ignore) return;
      setLoadingContacts(true);
      listContacts(token ?? "", { type: "client" })
        .then((next) => {
          if (!ignore) setContacts(next);
        })
        .catch(() => {
          if (!ignore) setContacts([]);
        })
        .finally(() => {
          if (!ignore) setLoadingContacts(false);
        });
    }, 0);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [token]);

  useEffect(() => {
    return () => {
      faceIndexAbortRef.current?.abort();
    };
  }, []);

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
      setSelectedContactId(selectedCluster?.linked_contact?.contact_id ?? "");
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

  const handleContactLink = () =>
    runAction("Contact link", async () => {
      if (!selectedClusterId) return;
      if (selectedContactId) {
        await linkClusterContact(
          token ?? "",
          selectedClusterId,
          selectedContactId,
          galleryId,
        );
      } else {
        await unlinkClusterContact(token ?? "", selectedClusterId);
      }
      await loadClusters();
    });

  const handleStopSync = useCallback(() => {
    faceIndexAbortRef.current?.abort();
  }, []);

  const handleSyncNow = useCallback(async () => {
    if (indexRun.running) return;
    const targets = indexableAssets;
    if (targets.length === 0) {
      setError(
        assetsById.size > 0
          ? "No ready WebP derivatives are available for FaceID sync yet."
          : "No uploaded gallery photos are available for FaceID sync.",
      );
      return;
    }

    const controller = new AbortController();
    faceIndexAbortRef.current = controller;
    let cursor = 0;
    let processed = 0;
    let stored = 0;
    let failed = 0;
    let lastError: unknown;

    setError("");
    setIndexRun({
      running: true,
      processed: 0,
      total: targets.length,
      stored: 0,
      failed: 0,
      current: "",
    });

    const worker = async () => {
      for (;;) {
        if (controller.signal.aborted) return;
        const index = cursor;
        cursor += 1;
        if (index >= targets.length) return;

        const asset = targets[index];
        setIndexRun({
          running: true,
          processed,
          total: targets.length,
          stored,
          failed,
          current: asset.filename,
        });
        try {
          const result = await indexAssetFacesFromBrowser(asset, {
            galleryId,
            token,
            signal: controller.signal,
          });
          stored += result.stored;
        } catch (err) {
          if (controller.signal.aborted) return;
          failed += 1;
          lastError = err;
        } finally {
          processed += 1;
          setIndexRun({
            running: true,
            processed,
            total: targets.length,
            stored,
            failed,
            current: asset.filename,
          });
        }
      }
    };

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(FACE_INDEX_CONCURRENCY, targets.length) },
          () => worker(),
        ),
      );
      if (controller.signal.aborted) {
        setError("FaceID sync stopped before all photos were indexed.");
      } else if (failed > 0) {
        const suffix =
          lastError instanceof Error ? ` ${lastError.message}` : "";
        setError(`${failed} photos could not be indexed.${suffix}`.trim());
      }
      await Promise.all([loadIndexStatus(), loadClusters()]);
    } finally {
      if (faceIndexAbortRef.current === controller) {
        faceIndexAbortRef.current = null;
      }
      setIndexRun((current) => ({
        ...current,
        running: false,
        current: "",
      }));
    }
  }, [
    assetsById.size,
    galleryId,
    indexRun.running,
    indexableAssets,
    loadClusters,
    loadIndexStatus,
    token,
  ]);

  const clusterStats = useMemo(
    () => ({
      people: indexStatus?.indexed_people ?? clusters.length,
      faces:
        indexStatus?.indexed_faces ??
        clusters.reduce((sum, cluster) => sum + cluster.face_count, 0),
      photos:
        indexStatus?.uploaded_photos ??
        clusters.reduce((sum, cluster) => sum + cluster.asset_count, 0),
      indexedPhotos:
        indexStatus?.indexed_photos ??
        clusters.reduce((sum, cluster) => sum + cluster.asset_count, 0),
    }),
    [clusters, indexStatus],
  );
  const uploadedPhotoCount = indexStatus?.uploaded_photos ?? assetsById.size;
  const indexablePhotoCount =
    indexStatus?.indexable_photos ?? indexableAssets.length;

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
          {indexRun.running ? (
            <p className="mt-1 text-xs text-text-secondary">
              Syncing {indexRun.processed} of {indexRun.total} photos
              {indexRun.current ? ` · ${indexRun.current}` : ""}
            </p>
          ) : uploadedPhotoCount > 0 && clusterStats.faces === 0 ? (
            <p className="mt-1 text-xs text-text-secondary">
              {uploadedPhotoCount} uploaded{" "}
              {uploadedPhotoCount === 1 ? "photo" : "photos"} need FaceID sync.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-text-secondary">
          <span className="rounded-full bg-surface-container px-3 py-1">
            {clusterStats.people} people
          </span>
          <span className="rounded-full bg-surface-container px-3 py-1">
            {clusterStats.faces} faces
          </span>
          <span className="rounded-full bg-surface-container px-3 py-1">
            {clusterStats.indexedPhotos}/{clusterStats.photos} photos indexed
          </span>
          {indexRun.running ? (
            <button
              type="button"
              onClick={handleStopSync}
              className="surface-button text-xs"
            >
              Stop sync
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSyncNow()}
              disabled={indexablePhotoCount === 0}
              className="surface-button text-xs disabled:opacity-60"
            >
              Sync now
            </button>
          )}
        </div>
      </div>

      {indexRun.running ? (
        <div
          className="h-2 overflow-hidden rounded-full bg-surface-container"
          aria-label={`FaceID sync progress ${indexRun.processed} of ${indexRun.total}`}
        >
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{
              width: `${
                indexRun.total > 0
                  ? Math.min(100, (indexRun.processed / indexRun.total) * 100)
                  : 0
              }%`,
            }}
          />
        </div>
      ) : null}

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
        <div className="space-y-3 rounded-lg border border-border-subtle bg-surface-container p-4 text-sm text-text-secondary">
          <p>
            {uploadedPhotoCount > 0
              ? `${uploadedPhotoCount} ${
                  uploadedPhotoCount === 1 ? "photo is" : "photos are"
                } uploaded, but FaceID has not indexed any people in this gallery yet.`
              : "No gallery photos are available for FaceID review yet."}
          </p>
          {uploadedPhotoCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSyncNow()}
                disabled={indexRun.running || indexablePhotoCount === 0}
                className="surface-button text-sm disabled:opacity-60"
              >
                {indexRun.running ? "Syncing" : "Sync now"}
              </button>
              <span className="text-xs text-text-tertiary">
                {indexablePhotoCount > 0
                  ? `${indexablePhotoCount} ready ${
                      indexablePhotoCount === 1 ? "photo" : "photos"
                    } can be indexed from browser media.`
                  : "WebP derivatives are still preparing, so FaceID sync is not ready yet."}
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="space-y-2 lg:col-span-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-text-secondary">
                Search people
              </span>
              <input
                value={personQuery}
                onChange={(event) => setPersonQuery(event.target.value)}
                placeholder="Name, client, email, phone"
                className="touch-min w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus"
              />
            </label>
            {visibleClusters.length === 0 ? (
              <div className="rounded-lg border border-border-subtle bg-surface-container p-3 text-xs text-text-secondary">
                No people match this search.
              </div>
            ) : null}
            {visibleClusters.map((cluster) => (
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
                {cluster.linked_contact ? (
                  <span className="mt-1 block truncate text-xs text-accent">
                    Linked to {cluster.linked_contact.name}
                  </span>
                ) : null}
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

            <div className="space-y-3 rounded-lg border border-border-subtle bg-surface-container p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-text-secondary">
                    CRM client link
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {selectedCluster?.linked_contact
                      ? `Linked to ${selectedCluster.linked_contact.name}`
                      : "Link this face identity to an existing client record."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleContactLink}
                  disabled={Boolean(busyAction) || !selectedClusterId}
                  className="surface-button text-xs disabled:opacity-60"
                >
                  {busyAction === "Contact link" ? "Saving" : "Save link"}
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-text-secondary">
                    Find client
                  </span>
                  <input
                    value={contactQuery}
                    onChange={(event) => setContactQuery(event.target.value)}
                    placeholder="Search CRM clients"
                    className="touch-min w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-text-secondary">
                    Linked client
                  </span>
                  <select
                    value={selectedContactId}
                    onChange={(event) =>
                      setSelectedContactId(event.target.value)
                    }
                    disabled={loadingContacts}
                    className="touch-min w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus disabled:opacity-60"
                  >
                    <option value="">
                      {loadingContacts ? "Loading clients" : "No client link"}
                    </option>
                    {visibleContacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contactLabel(contact)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
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
