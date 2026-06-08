"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getClusterFaces,
  getGalleryFaceIndexStatus,
  getFaceClusters,
  linkClusterContact,
  renameCluster,
  unlinkClusterContact,
  isFaceIndexUnavailableError,
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

type FaceIdentityReviewPanelMode = "review" | "sync-status" | "headless";

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
    (hasFaceIndexDerivative(asset) ||
      Boolean(asset.storage_key || asset.download_url))
  );
}

function contactLabel(contact: Contact): string {
  const detail = contact.email || contact.phone || contact.contact_type;
  return detail ? `${contact.name} (${detail})` : contact.name;
}

function uniqueFacesById(faces: FaceReviewRow[]): FaceReviewRow[] {
  const seen = new Set<string>();
  const unique: FaceReviewRow[] = [];
  for (const face of faces) {
    if (seen.has(face.id)) continue;
    seen.add(face.id);
    unique.push(face);
  }
  return unique;
}

function FaceTile({
  asset,
  face,
  token,
}: {
  asset?: Asset | null;
  face: FaceReviewRow;
  token: string | null;
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
    <div className="group overflow-hidden rounded-lg border border-border-subtle bg-surface-container-high text-left">
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
    </div>
  );
}

export function FaceIdentityReviewPanel({
  galleryId,
  token,
  autoSync = false,
  mode = "review",
}: {
  galleryId: string;
  token: string | null;
  autoSync?: boolean;
  mode?: FaceIdentityReviewPanelMode;
}) {
  const showReview = mode === "review";
  const [clusters, setClusters] = useState<ClusterSummary[]>([]);
  const [faces, setFaces] = useState<FaceReviewRow[]>([]);
  const [assetsById, setAssetsById] = useState<Map<string, Asset>>(new Map());
  const [indexStatus, setIndexStatus] = useState<FaceIndexStatus | null>(null);
  const [indexRun, setIndexRun] =
    useState<FaceIndexRunState>(IDLE_FACE_INDEX_RUN);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState("");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [loadingClusters, setLoadingClusters] = useState(true);
  const [loadingFaces, setLoadingFaces] = useState(false);
  const [visibleFaceCount, setVisibleFaceCount] = useState(
    FACE_REVIEW_PAGE_SIZE,
  );
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const faceIndexAbortRef = useRef<AbortController | null>(null);
  const autoSyncAttemptedRef = useRef<Set<string>>(new Set());

  const selectedCluster = clusters.find(
    (cluster) => cluster.cluster_label === selectedClusterId,
  );
  const indexableAssets = useMemo(
    () => Array.from(assetsById.values()).filter(assetCanBrowserIndexFaces),
    [assetsById],
  );
  const visibleContacts = useMemo(() => {
    const query = contactQuery.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) =>
      [contact.name, contact.email, contact.phone, contact.company]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [contactQuery, contacts]);

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
        return "";
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
    if (!showReview) return;
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
  }, [showReview, token]);

  useEffect(() => {
    return () => {
      faceIndexAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!showReview) {
      const timer = window.setTimeout(() => {
        setFaces([]);
        setRenameValue("");
        setVisibleFaceCount(FACE_REVIEW_PAGE_SIZE);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (clusters.length === 0) {
      const timer = window.setTimeout(() => {
        setFaces([]);
        setRenameValue("");
        setSelectedContactId("");
        setVisibleFaceCount(FACE_REVIEW_PAGE_SIZE);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    let ignore = false;
    const timer = window.setTimeout(() => {
      if (ignore) return;
      setLoadingFaces(true);
      setVisibleFaceCount(FACE_REVIEW_PAGE_SIZE);
      setError("");
      const requests = selectedClusterId
        ? [getClusterFaces(token ?? "", selectedClusterId, galleryId)]
        : clusters.map((cluster) =>
            getClusterFaces(token ?? "", cluster.cluster_label, galleryId),
          );
      Promise.all(requests)
        .then((results) => {
          if (!ignore) {
            setFaces(
              uniqueFacesById(results.flatMap((result) => result.faces)),
            );
          }
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
  }, [clusters, galleryId, selectedClusterId, showReview, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRenameValue(selectedCluster ? faceLabel(selectedCluster) : "");
      setSelectedContactId(selectedCluster?.linked_contact?.contact_id ?? "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedCluster]);

  const selectCluster = useCallback((clusterId: string) => {
    setSelectedClusterId(clusterId);
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
          ? "No ready gallery media files are available for FaceID sync yet."
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
    let serviceUnavailableMessage = "";

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
          if (isFaceIndexUnavailableError(err)) {
            failed += 1;
            lastError = err;
            serviceUnavailableMessage = err.message;
            controller.abort();
            return;
          }
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
      let finalError = "";
      if (controller.signal.aborted) {
        finalError =
          serviceUnavailableMessage ||
          "FaceID sync stopped before all photos were indexed.";
      } else if (failed > 0) {
        const suffix =
          lastError instanceof Error ? ` ${lastError.message}` : "";
        finalError = `${failed} photos could not be indexed.${suffix}`.trim();
      }
      await Promise.all([loadIndexStatus(), loadClusters()]);
      if (finalError) setError(finalError);
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

  const uploadedPhotoCount = indexStatus?.uploaded_photos ?? assetsById.size;
  const syncablePhotoCount = indexableAssets.length;
  const indexablePhotoTarget =
    indexStatus?.indexable_photos ?? syncablePhotoCount;
  const indexedPhotoCount = indexStatus?.indexed_photos ?? 0;
  const clusterStats = useMemo(
    () => ({
      people: indexStatus?.indexed_people ?? clusters.length,
      faces:
        indexStatus?.indexed_faces ??
        clusters.reduce((sum, cluster) => sum + cluster.face_count, 0),
      photos: uploadedPhotoCount,
      indexedPhotos: indexedPhotoCount,
    }),
    [clusters, indexStatus, indexedPhotoCount, uploadedPhotoCount],
  );
  const autoSyncSignature = useMemo(
    () =>
      indexableAssets
        .map((asset) => asset.id)
        .sort()
        .join("|"),
    [indexableAssets],
  );

  useEffect(() => {
    if (!autoSync || !token || indexRun.running) return;
    if (!indexStatus) return;
    if (!autoSyncSignature || syncablePhotoCount === 0) return;
    if (indexablePhotoTarget <= 0 || indexedPhotoCount >= indexablePhotoTarget)
      return;

    const key = `rawdrive:faceid:auto-sync:${galleryId}:${autoSyncSignature}`;
    if (autoSyncAttemptedRef.current.has(key)) return;
    autoSyncAttemptedRef.current.add(key);
    const timer = window.setTimeout(() => {
      void handleSyncNow();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    autoSync,
    autoSyncSignature,
    galleryId,
    handleSyncNow,
    indexRun.running,
    indexStatus,
    indexablePhotoTarget,
    indexedPhotoCount,
    syncablePhotoCount,
    token,
  ]);

  const peoplePicker = (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-text-secondary">
          Detected person
        </span>
        <select
          value={selectedClusterId}
          onChange={(event) => selectCluster(event.target.value)}
          className="touch-min w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
        >
          <option value="">
            All detected persons · {clusterStats.people}{" "}
            {clusterStats.people === 1 ? "person" : "people"} ·{" "}
            {clusterStats.faces} {clusterStats.faces === 1 ? "face" : "faces"}
          </option>
          {clusters.map((cluster, index) => (
            <option key={cluster.cluster_label} value={cluster.cluster_label}>
              {faceLabel(cluster)} {index + 1} · {cluster.face_count}{" "}
              {cluster.face_count === 1 ? "face" : "faces"} ·{" "}
              {cluster.asset_count}{" "}
              {cluster.asset_count === 1 ? "photo" : "photos"}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  const faceGrid = loadingFaces ? (
    <div className="h-48 animate-pulse rounded-lg bg-surface-container" />
  ) : faces.length === 0 ? (
    <div className="rounded-xl border border-border-subtle bg-surface-container p-4 text-sm text-text-secondary">
      Select another detected person, or run FaceID sync again if this person
      should have visible face crops.
    </div>
  ) : (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
      {visibleFaces.map((face) => (
        <FaceTile
          key={face.id}
          face={face}
          asset={assetsById.get(face.asset_id)}
          token={token}
        />
      ))}
    </div>
  );

  const facePagination =
    visibleFaces.length < faces.length ? (
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
    ) : null;

  if (mode === "headless") {
    return null;
  }

  if (mode === "sync-status") {
    const hasIndexedFaces = clusterStats.faces > 0;
    return (
      <section
        className="rounded-xl border border-border-subtle bg-surface-container px-4 py-3 text-sm"
        aria-label="FaceID sync status"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="font-medium text-text-primary">
              {indexRun.running
                ? "Syncing gallery photos for FaceID"
                : hasIndexedFaces
                  ? "FaceID ready"
                  : "FaceID sync"}
            </p>
            <p className="text-xs text-text-secondary">
              {indexRun.running
                ? `Processing ${indexRun.processed}/${indexRun.total} photos${
                    indexRun.current ? ` · ${indexRun.current}` : ""
                  }`
                : hasIndexedFaces
                  ? `${clusterStats.people} ${
                      clusterStats.people === 1 ? "person" : "people"
                    } detected across ${clusterStats.faces} ${
                      clusterStats.faces === 1 ? "face" : "faces"
                    }.`
                  : syncablePhotoCount > 0
                    ? "Ready gallery photos sync automatically when this page opens."
                    : uploadedPhotoCount > 0
                      ? "Gallery media is still preparing for FaceID sync."
                      : "Upload gallery photos to enable FaceID search."}
            </p>
          </div>
          <span className="rounded-full bg-surface-sunken px-3 py-1 text-xs text-text-secondary">
            {clusterStats.indexedPhotos}/
            {clusterStats.photos || uploadedPhotoCount} photos with faces
          </span>
        </div>
        {indexRun.running ? (
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-surface-sunken"
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
            className="mt-3 rounded-lg border border-feedback-error/20 bg-feedback-error/10 px-3 py-2 text-xs text-feedback-error"
          >
            {error}
          </p>
        ) : null}
      </section>
    );
  }

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
            {clusterStats.indexedPhotos}/{clusterStats.photos} photos with faces
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
              disabled={syncablePhotoCount === 0}
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
                disabled={indexRun.running || syncablePhotoCount === 0}
                className="surface-button text-sm disabled:opacity-60"
              >
                {indexRun.running ? "Syncing" : "Sync now"}
              </button>
              <span className="text-xs text-text-tertiary">
                {syncablePhotoCount > 0
                  ? `${syncablePhotoCount} ready ${
                      syncablePhotoCount === 1 ? "photo" : "photos"
                    } can be indexed from browser media.`
                  : "Gallery media is still preparing, so FaceID sync is not ready yet."}
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-12">
          <div className="space-y-3 xl:col-span-5">
            <div className="rounded-xl border border-border-subtle bg-surface-container p-3">
              <p className="text-sm font-semibold text-text-primary">
                Detected people
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                {clusterStats.people}{" "}
                {clusterStats.people === 1 ? "person" : "people"} grouped from{" "}
                {clusterStats.faces}{" "}
                {clusterStats.faces === 1 ? "face" : "faces"}.
              </p>
            </div>
            {peoplePicker}
            <div className="space-y-3">
              <div className="rounded-xl border border-border-subtle bg-surface-container p-3">
                <p className="text-sm font-semibold text-text-primary">
                  Face photos
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  {faces.length}{" "}
                  {faces.length === 1 ? "face crop" : "face crops"} from{" "}
                  {selectedClusterId
                    ? "this detected person"
                    : "all detected persons"}
                  .
                </p>
              </div>
              {faceGrid}
              {facePagination}
            </div>
          </div>

          <div className="space-y-4 xl:col-span-7">
            <div className="space-y-3 rounded-xl border border-border-subtle bg-surface-container p-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-text-secondary">
                  Rename
                </span>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    disabled={!selectedClusterId}
                    className="touch-min min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                  />
                  <button
                    type="button"
                    onClick={handleRename}
                    disabled={Boolean(busyAction) || !renameValue.trim()}
                    className="surface-button text-sm disabled:opacity-60"
                  >
                    {busyAction === "Rename" ? "Saving" : "Save"}
                  </button>
                </div>
              </label>
            </div>

            <div className="space-y-3 rounded-xl border border-border-subtle bg-surface-container p-3">
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
                    disabled={!selectedClusterId}
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
                    disabled={loadingContacts || !selectedClusterId}
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
          </div>
        </div>
      )}
    </section>
  );
}
