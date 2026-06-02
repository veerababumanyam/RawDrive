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
import { encryptBlob } from "@/lib/media-encryption/media-crypto";
import { createEncryptedWebPDerivativeSet, type EncryptedDerivative } from "@/lib/media-encryption/webp-derivatives";
import type { GalleryMediaKey } from "@/lib/media-encryption/media-key-store";
import { extractSourceImageMetadata } from "@/lib/media-encryption/source-metadata";
import { getBrowserE2EEUploadBlockReason } from "@/lib/media-encryption/browser-upload-support";

const CHUNK_SIZE = 5 * 1024 * 1024;
const DEFAULT_METADATA_BUDGET = 512 * 1024;
export const MAX_CONCURRENT_UPLOADS = 4;
export const MAX_CHUNK_UPLOAD_ATTEMPTS = 6;
const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 15_000;

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

type UseUploadOptions = {
  encryption?: {
    getKey: () => Promise<GalleryMediaKey>;
  };
  destination?: UploadDestination;
};

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

async function uploadEncryptedDerivative(
  assetId: string,
  derivative: EncryptedDerivative,
  signal: AbortSignal,
): Promise<void> {
  const form = new FormData();
  form.set("variant", derivative.variant);
  form.set("width", String(derivative.width));
  form.set("height", String(derivative.height));
  form.set("media_encryption", JSON.stringify(derivative.manifest));
  form.set("file", derivative.ciphertext, `${derivative.variant}.webp.enc`);

  const res = await retryUploadRequest(
    () => authFetch(`/api/v1/assets/${assetId}/derivatives`, {
      method: "POST",
      body: form,
      signal,
    }),
    signal,
  );
  if (!res.ok) throw new Error(`Encrypted derivative upload failed: ${res.status}`);
}

function isActiveUploadStatus(status: UploadItem["status"]): boolean {
  return status === "uploading" || status === "pending" || status === "screening" || status === "encrypting" || status === "paused";
}

export function isRetryableUploadStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

export function uploadRetryDelayMs(attempt: number, retryAfterHeader?: string | null): number {
  const retryAfter = parseRetryAfterMs(retryAfterHeader);
  if (retryAfter !== null) return Math.min(retryAfter, MAX_RETRY_DELAY_MS);
  return Math.min(MAX_RETRY_DELAY_MS, INITIAL_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1));
}

export function parseUploadOffsetHeader(value: string | null): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseRetryAfterMs(value?: string | null): number | null {
  if (!value) return null;
  const seconds = Number.parseFloat(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

async function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function browserIsOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function waitForOnline(signal: AbortSignal): Promise<void> {
  if (!browserIsOffline() || typeof window === "undefined") return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener("online", onOnline);
      signal.removeEventListener("abort", onAbort);
    };
    const onOnline = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    window.addEventListener("online", onOnline, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function retryUploadRequest(
  run: () => Promise<Response>,
  signal: AbortSignal,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_CHUNK_UPLOAD_ATTEMPTS; attempt += 1) {
    await waitForOnline(signal);
    try {
      const res = await run();
      if (!isRetryableUploadStatus(res.status) || attempt === MAX_CHUNK_UPLOAD_ATTEMPTS) {
        return res;
      }
      await sleepWithAbort(uploadRetryDelayMs(attempt, res.headers.get("Retry-After")), signal);
    } catch (err) {
      if (isAbortError(err)) throw err;
      if (browserIsOffline()) {
        await waitForOnline(signal);
        attempt -= 1;
        continue;
      }
      if (attempt === MAX_CHUNK_UPLOAD_ATTEMPTS) throw err;
      lastError = err;
      await sleepWithAbort(uploadRetryDelayMs(attempt), signal);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Upload request failed");
}

async function fetchUploadOffset(uploadId: string, signal: AbortSignal): Promise<number | null> {
  const res = await retryUploadRequest(
    () => authFetch(`/api/v1/uploads/${uploadId}`, { method: "HEAD", signal }),
    signal,
  );
  if (!res.ok) return null;
  return parseUploadOffsetHeader(res.headers.get("Upload-Offset"));
}

async function uploadChunkWithResume(params: {
  uploadId: string;
  offset: number;
  end: number;
  chunk: Blob;
  totalSize: number;
  signal: AbortSignal;
}): Promise<{ nextOffset: number; response: Response }> {
  const { uploadId, offset, end, chunk, totalSize, signal } = params;
  for (let attempt = 1; attempt <= MAX_CHUNK_UPLOAD_ATTEMPTS; attempt += 1) {
    await waitForOnline(signal);
    let res: Response;
    try {
      res = await authFetch(`/api/v1/uploads/${uploadId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/offset+octet-stream",
          "Upload-Offset": String(offset),
        },
        body: chunk,
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) throw err;
      if (browserIsOffline()) {
        await waitForOnline(signal);
        attempt -= 1;
        continue;
      }
      if (attempt === MAX_CHUNK_UPLOAD_ATTEMPTS) throw err;
      await sleepWithAbort(uploadRetryDelayMs(attempt), signal);
      continue;
    }

    if (res.ok) return { nextOffset: end, response: res };

    if (res.status === 409) {
      const remoteOffset = await fetchUploadOffset(uploadId, signal);
      if (remoteOffset !== null && remoteOffset > offset && remoteOffset <= totalSize) {
        return { nextOffset: remoteOffset, response: res };
      }
    }

    if (!isRetryableUploadStatus(res.status) || attempt === MAX_CHUNK_UPLOAD_ATTEMPTS) {
      throw new Error(`Chunk upload failed: ${res.status}`);
    }
    await sleepWithAbort(uploadRetryDelayMs(attempt, res.headers.get("Retry-After")), signal);
  }
  throw new Error("Chunk upload failed after retries");
}

export function useUpload(apiUrl: string, token: string | null, options?: UseUploadOptions) {
  const encryption = options?.encryption;
  const destination = options?.destination;
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const pendingQueue = useRef<UploadItem[]>([]);
  const pausedItems = useRef<Set<string>>(new Set());
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
      if (encryption) {
        const blockReason = getBrowserE2EEUploadBlockReason(item.file);
        if (blockReason) {
          updateItem(item.id, {
            status: "needs_desktop",
            error: blockReason,
          });
          return;
        }
      }

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
          error:
            manifest.findings[0]?.message ??
            "this format requires RawDrive Desktop for source-side encryption",
          scanManifest: manifest,
        });
        return;
      }

      let uploadBlob: Blob = item.file;
      let mediaEncryption: Record<string, unknown> | undefined;
      let sourceMetadata: Record<string, unknown> | undefined;
      let encryptedDerivatives: EncryptedDerivative[] = [];

      if (encryption) {
        updateItem(item.id, { status: "encrypting", scanManifest: manifest });
        const mediaKey = await encryption.getKey();
        const encryptedOriginal = await encryptBlob(item.file, {
          key: mediaKey.key,
          keyId: mediaKey.keyId,
          objectType: "original",
          contentType: item.file.type || "application/octet-stream",
        });
        let sourceDimensions: { width: number; height: number } | undefined;
        try {
          const derivativeSet = await createEncryptedWebPDerivativeSet(item.file, mediaKey.key, mediaKey.keyId);
          encryptedDerivatives = derivativeSet.derivatives;
          sourceDimensions = derivativeSet.source;
        } catch (err) {
          updateItem(item.id, {
            status: "needs_desktop",
            error: `RawDrive Desktop is required because source-side WebP generation failed: ${(err as Error).message}`,
            scanManifest: manifest,
          });
          return;
        }
        uploadBlob = encryptedOriginal.ciphertext;
        mediaEncryption = encryptedOriginal.manifest;
        sourceMetadata = await extractSourceImageMetadata(item.file, sourceDimensions);
        sourceMetadata = {
          ...sourceMetadata,
          derivative_variants: encryptedDerivatives.map((d) => d.variant),
        };
      }

      updateItem(item.id, { status: "uploading", scanManifest: manifest });

      // S3-G4 / S3-G5: bind the session to its destination gallery (and
      // sub-album, when one is the active upload target) so the backend links
      // the finalized asset server-side. Read from the ref at request time so
      // a mid-batch album switch routes subsequent uploads correctly. Omitted
      // keys leave the session as a plain workspace upload (legacy behaviour).
      const dest = destinationRef.current;
      // total_size MUST be the size of what we actually chunk and PATCH. In the
      // E2EE path that is the encrypted ciphertext (uploadBlob), not the
      // plaintext source; the chunk loop below iterates uploadBlob.size.
      const createBody: Record<string, unknown> = {
        filename: item.file.name,
        content_type: item.file.type || "application/octet-stream",
        total_size: uploadBlob.size,
        chunk_size: CHUNK_SIZE,
        scan_manifest: manifest,
      };
      // E2EE manifests for the encrypted original + source metadata, only
      // present when client-side encryption ran for this item.
      if (mediaEncryption) {
        createBody.media_encryption = mediaEncryption;
      }
      if (sourceMetadata) {
        createBody.source_metadata = sourceMetadata;
      }
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

      while (offset < uploadBlob.size) {
        while (pausedRef.current || pausedItems.current.has(item.id)) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        }
        await waitForOnline(controller.signal);

        const end = Math.min(offset + CHUNK_SIZE, uploadBlob.size);
        const chunk = uploadBlob.slice(offset, end);

        const { nextOffset, response: patchRes } = await uploadChunkWithResume({
          uploadId: upload_id,
          offset,
          end,
          chunk,
          totalSize: uploadBlob.size,
          signal: controller.signal,
        });

        offset = nextOffset;
        if (offset >= uploadBlob.size) {
          const body = await patchRes.json().catch(() => ({})) as { asset?: { id?: string } };
          finalAssetId = body.asset?.id;
        }
        updateItem(item.id, {
          progress: Math.round((offset / uploadBlob.size) * (encryptedDerivatives.length > 0 ? 80 : 100)),
        });
      }

      if (finalAssetId && encryptedDerivatives.length > 0) {
        for (let i = 0; i < encryptedDerivatives.length; i += 1) {
          await uploadEncryptedDerivative(finalAssetId, encryptedDerivatives[i], controller.signal);
          updateItem(item.id, {
            progress: 80 + Math.round(((i + 1) / encryptedDerivatives.length) * 20),
          });
        }
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
  }, [apiUrl, encryption, token, updateItem]);

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
        (i) => isActiveUploadStatus(i.status),
      );
      return [...active, ...newItems];
    });

    enqueueUploads(newItems);
  }, [enqueueUploads]);

  const cancel = useCallback((id: string) => {
    pausedItems.current.delete(id);
    pendingQueue.current = pendingQueue.current.filter((item) => item.id !== id);
    const controller = abortControllers.current.get(id);
    if (controller) controller.abort();
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pause = useCallback((id: string) => {
    pausedItems.current.add(id);
    pendingQueue.current = pendingQueue.current.filter((item) => item.id !== id);
    updateItem(id, { status: "paused" });
  }, [updateItem]);

  const resume = useCallback((id: string) => {
    pausedItems.current.delete(id);
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    if (abortControllers.current.has(id)) {
      updateItem(id, { status: "uploading" });
      return;
    }
    const retryItem = { ...item, status: "pending" as const };
    updateItem(id, { status: "pending" });
    enqueueUploads([retryItem]);
  }, [enqueueUploads, items, updateItem]);

  const retry = useCallback((id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (item) {
      pausedItems.current.delete(id);
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
        return isActiveUploadStatus(item.status); // keep active items even if dismiss is called on them
      }),
    );
  }, []);

  // clearFinished removes every non-active item at once — the "Dismiss"
  // action on the persisted-after-failure panel. Active uploads survive.
  const clearFinished = useCallback(() => {
    setItems((prev) =>
      prev.filter(
        (item) => isActiveUploadStatus(item.status),
      ),
    );
  }, []);

  const cancelAll = useCallback(() => {
    pausedItems.current.clear();
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
    pausedItems.current.clear();
    pausedRef.current = false;
    setIsPaused(false);
    pumpQueue.current();
  }, []);

  return {
    items,
    addFiles,
    cancel,
    pause,
    resume,
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
