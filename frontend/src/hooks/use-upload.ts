"use client";

import { useState, useCallback, useRef } from "react";
import type { UploadItem } from "@/components/upload/upload-progress";
import type { ScanManifest } from "@/lib/upload-screening/types";
import { screen } from "@/lib/upload-screening/screen";
import { sha256HexChunked } from "@/lib/upload-screening/hash";
import { buildManifest } from "@/lib/upload-screening/manifest";
import { activePolicyVersion } from "@/lib/upload-screening/policy";
import { canUseScreeningWorker, runScreeningWorker } from "@/lib/upload-screening/worker-client";
import { authFetch } from "@/lib/api/authFetch";

const CHUNK_SIZE = 5 * 1024 * 1024;
const DEFAULT_METADATA_BUDGET = 512 * 1024;
export const MAX_CONCURRENT_UPLOADS = 4;

async function runScreener(
  file: File,
  apiUrl: string,
  fileId: string,
): Promise<ScanManifest> {
  const policyVersion = await activePolicyVersion(apiUrl);
  if (canUseScreeningWorker()) {
    return runScreeningWorker(file, policyVersion, DEFAULT_METADATA_BUDGET, fileId);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = screen(bytes, {
    metadataBudgetBytes: DEFAULT_METADATA_BUDGET,
    declaredType: file.type,
  });
  const sha256 = await sha256HexChunked(file);
  return buildManifest({ file, policyVersion, sha256, result });
}

// Destination binding for server-side gallery linkage (S3-G4 / S3-G5).
// When `galleryId` is supplied, CreateSession sends it (and `albumId`, if a
// sub-album is the active upload target) so the backend links the finalized
// asset into the gallery itself — idempotently, with a deterministic
// sort_order — at finalize time. The legacy client-side addAssetToGallery
// call is then redundant and removed at the call site. Both fields are read
// fresh at request time from a ref so a user switching the active sub-album
// mid-batch binds subsequent uploads to wherever they are looking.
export interface UploadDestination {
  galleryId?: string;
  albumId?: string | null;
}

export function useUpload(apiUrl: string, token: string, destination?: UploadDestination) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const pendingQueue = useRef<UploadItem[]>([]);
  const activeUploads = useRef(0);
  const pumpQueue = useRef<() => void>(() => {});
  const pausedRef = useRef(false);

  // Keep the latest destination in a ref so chunkedUpload (a stable callback)
  // reads the CURRENT gallery/album at the moment each session is created,
  // without re-creating the callback (and tearing the queue) on every album
  // toggle.
  const destinationRef = useRef<UploadDestination | undefined>(destination);
  destinationRef.current = destination;

  const updateItem = useCallback((id: string, updates: Partial<UploadItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
  }, []);

  const chunkedUpload = useCallback(async (item: UploadItem) => {
    const controller = new AbortController();
    abortControllers.current.set(item.id, controller);

    // QA #16 (historic): refresh the token fresh at request time so
    // Authorization reflects the latest cached value. authFetch now
    // owns this — it reads getStoredAccessToken() internally AND
    // auto-refreshes via /auth/refresh on 401, so the upload survives
    // tokens that expire mid-session instead of stalling with a
    // permanent 401 on every subsequent chunk PATCH.
    void token; // kept in the signature for caller compatibility

    try {
      updateItem(item.id, { status: "screening" });
      let manifest: ScanManifest;
      try {
        manifest = await runScreener(item.file, apiUrl, item.id);
      } catch (err) {
        updateItem(item.id, {
          status: "error",
          error: `screening failed: ${(err as Error).message}`,
        });
        return;
      }

      if (manifest.decision === "block") {
        updateItem(item.id, {
          status: "blocked",
          error:
            manifest.findings[0]?.message ?? "local screening rejected the file",
          scanManifest: manifest,
        });
        return;
      }
      if (manifest.decision === "needs_desktop_scan") {
        updateItem(item.id, {
          status: "needs_desktop",
          error: "this format requires the RawDrive Desktop companion (M17)",
          scanManifest: manifest,
        });
        return;
      }

      updateItem(item.id, { status: "uploading", scanManifest: manifest });

      // S3-G4 / S3-G5: bind the session to its destination gallery (and
      // sub-album, when one is the active upload target) so the backend links
      // the finalized asset server-side. Read from the ref at request time so
      // a mid-batch album switch routes subsequent uploads correctly. Omitted
      // keys leave the session as a plain workspace upload (legacy behaviour).
      const dest = destinationRef.current;
      const createBody: Record<string, unknown> = {
        filename: item.file.name,
        content_type: item.file.type || "application/octet-stream",
        total_size: item.file.size,
        chunk_size: CHUNK_SIZE,
        scan_manifest: manifest,
      };
      if (dest?.galleryId) {
        createBody.gallery_id = dest.galleryId;
        if (dest.albumId) createBody.album_id = dest.albumId;
      }

      const createRes = await authFetch("/api/v1/uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createBody),
        signal: controller.signal,
      });

      if (!createRes.ok) {
        let errorBody: { error?: string; message?: string } = {};
        try {
          errorBody = await createRes.json();
        } catch {
          /* ignore — body may not be JSON */
        }
        if (createRes.status === 400 && errorBody.error?.startsWith("SCAN_")) {
          updateItem(item.id, {
            status: "blocked",
            error:
              errorBody.message ??
              `backend rejected manifest: ${errorBody.error}`,
          });
          return;
        }
        // 2026-05-20: surface plan-storage-quota rejection as a "blocked"
        // item rather than a raw 403 string, so the dropzone shows a real
        // sentence (the backend already returns a customer-readable message)
        // instead of "Create session failed: 403". Status 403 + the documented
        // `storage_quota_exceeded` error code is the contract — same code
        // the unused QuotaEnforcer middleware emits. The user will need to
        // free space or upgrade their plan; no point retrying.
        if (createRes.status === 403 && errorBody.error === "storage_quota_exceeded") {
          updateItem(item.id, {
            status: "blocked",
            error:
              errorBody.message ??
              "Your workspace has exceeded its storage quota. Please upgrade your plan or delete unused assets.",
          });
          return;
        }
        // S3-G4: the server validates the destination gallery/album belongs to
        // the caller's workspace at CreateSession and returns 404
        // {"error":"gallery not found"} / "album not found" when it does not.
        // Surface this as a real error row instead of a bare status code so the
        // photographer learns the link target was rejected (e.g. a stale album
        // id) rather than the upload silently landing unlinked.
        if (createRes.status === 404 && (errorBody.error === "gallery not found" || errorBody.error === "album not found")) {
          updateItem(item.id, {
            status: "error",
            error:
              errorBody.error === "album not found"
                ? "Couldn't link this upload to the selected sub-gallery (it may have been deleted). Try again."
                : "Couldn't link this upload to this gallery (it may have been deleted). Try again.",
          });
          return;
        }
        throw new Error(`Create session failed: ${createRes.status}`);
      }

      const { upload_id } = await createRes.json();
      let offset = 0;
      let finalAssetId: string | undefined;

      while (offset < item.file.size) {
        while (pausedRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        }

        const end = Math.min(offset + CHUNK_SIZE, item.file.size);
        const chunk = item.file.slice(offset, end);

        const patchRes = await authFetch(`/api/v1/uploads/${upload_id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/offset+octet-stream",
            "Upload-Offset": String(offset),
          },
          body: chunk,
          signal: controller.signal,
        });

        if (!patchRes.ok) {
          throw new Error(`Chunk upload failed: ${patchRes.status}`);
        }

        offset = end;
        if (offset >= item.file.size) {
          const body = await patchRes.json().catch(() => ({})) as { asset?: { id?: string } };
          finalAssetId = body.asset?.id;
        }
        updateItem(item.id, {
          progress: Math.round((offset / item.file.size) * 100),
        });
      }

      updateItem(item.id, { status: "complete", progress: 100, assetId: finalAssetId });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return;
      }
      updateItem(item.id, {
        status: "error",
        error: (err as Error).message,
      });
    } finally {
      abortControllers.current.delete(item.id);
      activeUploads.current = Math.max(0, activeUploads.current - 1);
      pumpQueue.current();
    }
  }, [apiUrl, token, updateItem]);

  pumpQueue.current = () => {
    while (
      activeUploads.current < MAX_CONCURRENT_UPLOADS &&
      pendingQueue.current.length > 0 &&
      !pausedRef.current
    ) {
      const next = pendingQueue.current.shift();
      if (!next) return;
      activeUploads.current += 1;
      void chunkedUpload(next);
    }
  };

  const enqueueUploads = useCallback((nextItems: UploadItem[]) => {
    pendingQueue.current.push(...nextItems);
    pumpQueue.current();
  }, []);

  const addFiles = useCallback((files: File[]) => {
    const newItems: UploadItem[] = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      progress: 0,
      status: "pending" as const,
    }));

    // 2026-05-21: a fresh batch should not inherit stale terminal rows
    // from prior batches. Without this, the panel showed last batch's
    // "complete" rows above the new uploads AND the aggregate byte bar
    // double-counted the prior batch's bytes as already-uploaded. Active
    // uploads (uploading/pending/screening) survive so a user can drop
    // additional files mid-batch. Failed/blocked items from prior batches
    // also clear — the user has already seen those errors; they're
    // stale state relative to the new upload session.
    setItems((prev) => {
      const active = prev.filter(
        (i) =>
          i.status === "uploading" || i.status === "pending" || i.status === "screening",
      );
      return [...active, ...newItems];
    });

    enqueueUploads(newItems);
  }, [enqueueUploads]);

  const cancel = useCallback((id: string) => {
    pendingQueue.current = pendingQueue.current.filter((item) => item.id !== id);
    const controller = abortControllers.current.get(id);
    if (controller) controller.abort();
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const retry = useCallback((id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (item) {
      const retryItem = { ...item, status: "pending" as const, progress: 0 };
      updateItem(id, { status: "pending", progress: 0, error: undefined });
      enqueueUploads([retryItem]);
    }
  }, [enqueueUploads, items, updateItem]);

  // 2026-05-21: bulk-retry every item in the "error" set so the UI can offer
  // a single "Retry All" button on the persisted-after-failure upload panel.
  // Blocked / needs_desktop items are intentionally excluded — those were
  // rejected at the screening stage and the same file would block again.
  const retryAll = useCallback(() => {
    const failed = items.filter((i) => i.status === "error");
    const retryItems = failed.map((item) => ({ ...item, status: "pending" as const, progress: 0 }));
    setItems((prev) =>
      prev.map((item) =>
        item.status === "error" ? { ...item, status: "pending", progress: 0, error: undefined } : item,
      ),
    );
    enqueueUploads(retryItems);
  }, [enqueueUploads, items]);

  // dismiss(id) removes a non-active item from the queue. Unlike cancel(),
  // it does NOT abort in-flight uploads — it only clears completed / errored
  // / blocked / needs_desktop entries that the user has acknowledged.
  const dismiss = useCallback((id: string) => {
    setItems((prev) =>
      prev.filter((item) => {
        if (item.id !== id) return true;
        const active = item.status === "uploading" || item.status === "pending" || item.status === "screening";
        return active; // keep active items even if dismiss is called on them
      }),
    );
  }, []);

  // clearFinished removes every non-active item at once — the "Dismiss"
  // action on the persisted-after-failure panel. Active uploads survive.
  const clearFinished = useCallback(() => {
    setItems((prev) =>
      prev.filter(
        (item) =>
          item.status === "uploading" || item.status === "pending" || item.status === "screening",
      ),
    );
  }, []);

  const cancelAll = useCallback(() => {
    pendingQueue.current = [];
    abortControllers.current.forEach((controller) => controller.abort());
    abortControllers.current.clear();
    setItems([]);
  }, []);

  const pauseAll = useCallback(() => {
    pausedRef.current = true;
    setIsPaused(true);
  }, []);

  const resumeAll = useCallback(() => {
    pausedRef.current = false;
    setIsPaused(false);
    pumpQueue.current();
  }, []);

  return {
    items,
    addFiles,
    cancel,
    retry,
    retryAll,
    dismiss,
    clearFinished,
    cancelAll,
    pauseAll,
    resumeAll,
    isPaused,
  };
}
