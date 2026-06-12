"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { UploadItem } from "@/components/upload/upload-progress";
import type { ScanManifest } from "@/lib/upload-screening/types";
import { screen } from "@/lib/upload-screening/screen";
import { sha256Hex } from "@/lib/upload-screening/hash";
import { buildManifest } from "@/lib/upload-screening/manifest";
import { activePolicyVersion } from "@/lib/upload-screening/policy";
import {
  canUseScreeningWorker,
  runScreeningWorker,
} from "@/lib/upload-screening/worker-client";
import { authFetch } from "@/lib/api/authFetch";

// Keep non-final multipart chunks above S3/B2's 5 MiB floor, but small enough
// that the gallery queue reports progress before a whole camera JPEG finishes.
export const CHUNK_SIZE = 8 * 1024 * 1024;
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

export type UseUploadOptions = {
  destination?: UploadDestination;
  /**
   * Called when CreateSession is rejected because the user has not accepted the
   * active Terms of Service (403 TERMS_NOT_ACCEPTED). The frontend normally
   * pre-checks acceptance before starting an upload, so this is the safety-net
   * for a stale/unknown status — the page opens the acceptance modal.
   */
  onTermsRequired?: () => void;
};

export type AddUploadFilesOptions = {
  destination?: UploadDestination;
};

type QueuedUploadItem = UploadItem & {
  uploadDestination?: UploadDestination;
  uploadOnTermsRequired?: UseUploadOptions["onTermsRequired"];
  // How many times this item's finalize step has failed with a retryable
  // hash-mismatch code. Preserved across retry()/retryAll() (they spread the
  // item) so a genuinely-corrupt source eventually crosses the cap and is sent
  // to a terminal re-select instead of retrying forever.
  finalizeRetryCount?: number;
};

export function uploadCreateSessionErrorMessage(
  status: number,
  errorBody: { error?: string; message?: string } = {},
): string {
  if (errorBody.message) return errorBody.message;
  if (errorBody.error) return `Upload could not start: ${errorBody.error}`;
  if (status === 403) {
    return "Upload could not start because access was denied. Refresh the page and try again, or sign in again if the session changed.";
  }
  return `Create session failed: ${status}`;
}

// A chunk PATCH (including the finalize that runs on the last chunk) failed
// with a non-retryable status. Unlike a transient network error, the server
// attached a machine-readable reason — the M16 Tier-D scan codes
// (SCAN_HASH_MISMATCH / SCAN_MANIFEST_* / ENCRYPTED_MEDIA_HASH_MISMATCH) and
// the still-image gate (VIDEO_NOT_ALLOWED / UNSUPPORTED_UPLOAD_TYPE) all come
// back here as 422. Carry the parsed body so the caller can show the real
// reason and pick the right item status instead of an opaque
// "Chunk upload failed: 422".
export class ChunkUploadError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly serverMessage?: string;
  constructor(
    status: number,
    errorBody: { error?: string; message?: string } = {},
  ) {
    super(uploadFinalizeErrorMessage(status, errorBody));
    this.name = "ChunkUploadError";
    this.status = status;
    this.code = errorBody.error;
    this.serverMessage = errorBody.message;
  }
}

// Codes that mean "these exact bytes will never pass" — the file finished
// uploading but failed manifest validation or was rejected as a disallowed
// type. Both hash-mismatch codes are deliberately EXCLUDED here: they are
// handled as retryable-with-a-cap (see RETRYABLE_HASH_MISMATCH_CODES). A
// manifest/type rejection, by contrast, is permanent for the given bytes.
const NON_RETRYABLE_FINALIZE_CODES = new Set<string>([
  "SCAN_MANIFEST_INVALID",
  "SCAN_MANIFEST_REQUIRED",
  "VIDEO_NOT_ALLOWED",
  "UNSUPPORTED_UPLOAD_TYPE",
]);

// Codes where re-reading the file from its source is the only fix and the
// manifest could not be verified at all. Hash mismatches are NOT here — they
// recover on retry (re-screen / re-read) until the attempt cap.
const RESELECT_FINALIZE_CODES = new Set<string>([
  "SCAN_MANIFEST_INVALID",
  "SCAN_MANIFEST_REQUIRED",
]);

// Finalize codes that mean "the bytes the server received did not match the
// hash the client declared." SCAN_HASH_MISMATCH is the active plaintext upload
// verdict. ENCRYPTED_MEDIA_HASH_MISMATCH remains recognized only so a stale
// response from an old in-flight encrypted session is still classified cleanly.
// They are retried up to MAX_FINALIZE_HASH_RETRIES, after which the source is
// treated as genuinely bad and the user re-selects.
const RETRYABLE_HASH_MISMATCH_CODES = new Set<string>([
  "SCAN_HASH_MISMATCH",
  "ENCRYPTED_MEDIA_HASH_MISMATCH",
]);

// Total finalize attempts allowed for a retryable hash mismatch before the item
// is forced to a terminal re-select. Three gives transient wire corruption two
// free recoveries while still bounding a truly-corrupt source.
export const MAX_FINALIZE_HASH_RETRIES = 3;

export function isNonRetryableFinalizeCode(code?: string): boolean {
  return code != null && NON_RETRYABLE_FINALIZE_CODES.has(code);
}

export function finalizeErrorRequiresReselect(code?: string): boolean {
  return code != null && RESELECT_FINALIZE_CODES.has(code);
}

export function isRetryableHashMismatchCode(code?: string): boolean {
  return code != null && RETRYABLE_HASH_MISMATCH_CODES.has(code);
}

// Decide what to do with a hash-mismatch finalize failure given how many times
// this item's finalize has already failed. Below the cap the user is offered
// Retry (which re-screens / re-reads fresh bytes); at the cap the item flips
// to a terminal re-select so a permanently-bad source cannot loop forever.
export function finalizeHashRetryDisposition(
  code: string | undefined,
  priorRetryCount: number,
): { retryable: boolean; requiresReselect: boolean } {
  if (!isRetryableHashMismatchCode(code)) {
    return { retryable: false, requiresReselect: false };
  }
  const attempts = priorRetryCount + 1;
  if (attempts >= MAX_FINALIZE_HASH_RETRIES) {
    return { retryable: false, requiresReselect: true };
  }
  return { retryable: true, requiresReselect: false };
}

// User-facing sentence once a hash mismatch has exhausted its retries. Names the
// file so a batch upload makes clear which one to re-select.
export function finalizeRetryExhaustedMessage(fileName: string): string {
  return `"${fileName}" still failed its integrity check after several attempts. Re-select the file from its original source and try again.`;
}

// Maps a finalize/chunk failure to a customer-readable sentence. The server
// already returns a `message` for some codes; when it does not, translate the
// machine `error` code so the photographer learns *why* the upload was
// rejected instead of seeing "Chunk upload failed: 422".
export function uploadFinalizeErrorMessage(
  status: number,
  errorBody: { error?: string; message?: string } = {},
): string {
  if (errorBody.message) return errorBody.message;
  switch (errorBody.error) {
    case "SCAN_HASH_MISMATCH":
      return "RawDrive could not verify this upload against its security scan. Retry will rescan the same file and upload it again.";
    case "ENCRYPTED_MEDIA_HASH_MISMATCH":
      return "RawDrive could not verify this upload's integrity. Retry will rescan and upload the file again.";
    case "SCAN_MANIFEST_INVALID":
    case "SCAN_MANIFEST_REQUIRED":
      return "RawDrive could not verify this file's security scan. Re-select the file and try again.";
    case "VIDEO_NOT_ALLOWED":
      return "Video files are not supported in photo galleries.";
    case "UNSUPPORTED_UPLOAD_TYPE":
      return "Photo galleries accept still-image uploads only.";
    default:
      break;
  }
  if (errorBody.error) return `Upload failed validation: ${errorBody.error}`;
  return `Chunk upload failed: ${status}`;
}

export function cancelUploadsConfirmationMessage(activeCount?: number): string {
  const countText =
    typeof activeCount === "number" && activeCount > 0
      ? `${activeCount} active/queued upload${activeCount === 1 ? "" : "s"}`
      : "active and queued uploads";
  return `Cancel ${countText}? Completed photos stay saved, but unfinished files will stop and must be selected again.`;
}

async function runScreener(
  file: File,
  apiUrl: string,
  fileId: string,
): Promise<ScanManifest> {
  const policyVersion = await activePolicyVersion(apiUrl);
  if (canUseScreeningWorker()) {
    return runScreeningWorker(
      file,
      policyVersion,
      DEFAULT_METADATA_BUDGET,
      fileId,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = screen(bytes, {
    metadataBudgetBytes: DEFAULT_METADATA_BUDGET,
    declaredType: file.type,
    // CD5b: mirror the worker path — the filename lets the screener backstop
    // TIFF-based RAW by extension when the browser reports a generic/empty MIME.
    declaredName: file.name,
  });
  const sha256 = await sha256Hex(bytes);
  return buildManifest({ file, policyVersion, sha256, result });
}

export function isFileReadPermissionError(err: unknown): boolean {
  const value = err as { name?: unknown; message?: unknown };
  const name = typeof value?.name === "string" ? value.name : "";
  const message =
    typeof value?.message === "string" ? value.message : String(err ?? "");
  return (
    name === "NotReadableError" ||
    name === "SecurityError" ||
    /could not be read|not readable|permission problem|permission denied|reference to a file was acquired|failed to read/i.test(
      message,
    )
  );
}

export function fileReadPermissionRecoveryMessage(fileName?: string): string {
  const prefix = fileName ? `${fileName}: ` : "";
  return `${prefix}RawDrive could not read this file after it was selected. Re-select the files or folder from the original camera card, drive, Photos/WhatsApp export, or local folder, and keep that source connected until upload finishes.`;
}

export function isActiveUploadStatus(status: UploadItem["status"]): boolean {
  return (
    status === "uploading" ||
    status === "pending" ||
    status === "screening" ||
    status === "encrypting" ||
    status === "indexing_faces" ||
    status === "paused"
  );
}

export function isRetryableUploadStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status >= 500 && status <= 599)
  );
}

export function uploadRetryDelayMs(
  attempt: number,
  retryAfterHeader?: string | null,
): number {
  const retryAfter = parseRetryAfterMs(retryAfterHeader);
  if (retryAfter !== null) return Math.min(retryAfter, MAX_RETRY_DELAY_MS);
  return Math.min(
    MAX_RETRY_DELAY_MS,
    INITIAL_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1),
  );
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
      if (
        !isRetryableUploadStatus(res.status) ||
        attempt === MAX_CHUNK_UPLOAD_ATTEMPTS
      ) {
        return res;
      }
      await sleepWithAbort(
        uploadRetryDelayMs(attempt, res.headers.get("Retry-After")),
        signal,
      );
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
  throw lastError instanceof Error
    ? lastError
    : new Error("Upload request failed");
}

async function fetchUploadOffset(
  uploadId: string,
  signal: AbortSignal,
): Promise<number | null> {
  const res = await retryUploadRequest(
    () =>
      authFetch(`/api/v1/uploads/${uploadId}`, {
        method: "HEAD",
        signal,
        requireAuth: true,
      }),
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
        requireAuth: true,
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
      if (
        remoteOffset !== null &&
        remoteOffset > offset &&
        remoteOffset <= totalSize
      ) {
        return { nextOffset: remoteOffset, response: res };
      }
    }

    if (
      !isRetryableUploadStatus(res.status) ||
      attempt === MAX_CHUNK_UPLOAD_ATTEMPTS
    ) {
      // Preserve the server's machine-readable reason (e.g. the finalize
      // Tier-D scan codes) so the caller can show why the upload failed
      // instead of a bare status. The body may be absent/non-JSON for a
      // genuine transport failure — ChunkUploadError degrades to the status.
      const errorBody = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      throw new ChunkUploadError(res.status, errorBody);
    }
    await sleepWithAbort(
      uploadRetryDelayMs(attempt, res.headers.get("Retry-After")),
      signal,
    );
  }
  throw new Error("Chunk upload failed after retries");
}

async function cancelUploadSession(uploadId: string): Promise<void> {
  try {
    await authFetch(`/api/v1/uploads/${encodeURIComponent(uploadId)}`, {
      method: "DELETE",
      keepalive: true,
      requireAuth: true,
    });
  } catch (err) {
    console.warn("Upload session cleanup failed", { uploadId, error: err });
  }
}

export function useUpload(
  apiUrl: string,
  token: string | null,
  options?: UseUploadOptions,
) {
  const destination = options?.destination;
  const [items, setItems] = useState<QueuedUploadItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const uploadSessionIds = useRef<Map<string, string>>(new Map());
  const pendingQueue = useRef<QueuedUploadItem[]>([]);
  const pausedItems = useRef<Set<string>>(new Set());
  const activeUploads = useRef(0);
  const pumpQueue = useRef<() => void>(() => {});
  const pausedRef = useRef(false);

  // Keep the latest destination in a ref so addFiles can snapshot the active
  // gallery/album onto every queued item without re-creating the queue when the
  // visible gallery state changes.
  const destinationRef = useRef<UploadDestination | undefined>(destination);

  // Latest onTermsRequired callback in a ref so the stable chunkedUpload
  // callback can invoke it without re-creating (and tearing the queue).
  const onTermsRequiredRef = useRef<UseUploadOptions["onTermsRequired"]>(
    options?.onTermsRequired,
  );

  // Sync both "latest value" refs after each commit. Writing a ref during
  // render is impure under the React Compiler; the stable callbacks read
  // .current asynchronously at upload time (well after commit), so effect
  // timing preserves the existing behavior.
  useEffect(() => {
    destinationRef.current = destination;
    onTermsRequiredRef.current = options?.onTermsRequired;
  });

  const updateItem = useCallback(
    (id: string, updates: Partial<QueuedUploadItem>) => {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
      );
    },
    [],
  );

  const chunkedUpload = useCallback(
    async (item: QueuedUploadItem) => {
      const controller = new AbortController();
      abortControllers.current.set(item.id, controller);
      let uploadIdForCleanup: string | undefined;
      let uploadSessionFinished = false;
      const itemDestination = item.uploadDestination ?? destinationRef.current;
      const itemOnTermsRequired =
        item.uploadOnTermsRequired ?? onTermsRequiredRef.current;

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
          const fileReadPermissionError = isFileReadPermissionError(err);
          updateItem(item.id, {
            status: "error",
            requiresReselect: fileReadPermissionError,
            error: fileReadPermissionError
              ? fileReadPermissionRecoveryMessage(item.file.name)
              : `screening failed: ${(err as Error).message}`,
          });
          return;
        }

        if (manifest.decision === "block") {
          updateItem(item.id, {
            status: "blocked",
            error:
              manifest.findings[0]?.message ??
              "local screening rejected the file",
            scanManifest: manifest,
          });
          return;
        }
        if (manifest.decision === "needs_desktop_scan") {
          updateItem(item.id, {
            status: "needs_desktop",
            error:
              manifest.findings[0]?.message ??
              "this format requires RawDrive Desktop for direct upload processing",
            scanManifest: manifest,
          });
          return;
        }

        updateItem(item.id, { status: "uploading", scanManifest: manifest });

        // S3-G4 / S3-G5: bind the session to the destination captured when the
        // user selected these files. This lets queued files continue after route
        // changes while still linking to the original gallery/sub-gallery.
        const dest = itemDestination;
        // total_size MUST be the size of what we actually chunk and PATCH.
        // New browser uploads use the direct plaintext file path. Legacy
        // encrypted assets still decrypt on view, but this path does not
        // generate or send client-side encryption manifests for new uploads.
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

        const createRes = await retryUploadRequest(
          () =>
            authFetch("/api/v1/uploads", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(createBody),
              signal: controller.signal,
              requireAuth: true,
            }),
          controller.signal,
        );

        if (!createRes.ok) {
          let errorBody: { error?: string; message?: string } = {};
          try {
            errorBody = await createRes.json();
          } catch {
            /* ignore — body may not be JSON */
          }
          if (
            createRes.status === 400 &&
            errorBody.error?.startsWith("SCAN_")
          ) {
            updateItem(item.id, {
              status: "blocked",
              error:
                errorBody.message ??
                `backend rejected manifest: ${errorBody.error}`,
            });
            return;
          }
          // Terms gate (safety-net). The frontend pre-checks acceptance before
          // starting an upload, but if the status was stale/unknown the backend
          // returns 403 TERMS_NOT_ACCEPTED. Keep this as a retryable error row:
          // once the modal is accepted, the same selected File can be retried
          // without reselecting it.
          if (
            createRes.status === 403 &&
            errorBody.error === "TERMS_NOT_ACCEPTED"
          ) {
            updateItem(item.id, {
              status: "error",
              requiresReselect: false,
              errorCode: "TERMS_NOT_ACCEPTED",
              error:
                errorBody.message ??
                "Accept the Terms of Service, then retry this upload.",
            });
            itemOnTermsRequired?.();
            return;
          }
          // Event gallery upload gates are intentional 403 responses: the
          // gallery is either view-only after its upload window, or the event
          // gallery storage allotment is full. Keep the row visible as blocked
          // with the backend's customer-readable message instead of surfacing a
          // raw "Create session failed: 403" error.
          if (
            createRes.status === 403 &&
            (errorBody.error === "gallery_upload_window_closed" ||
              errorBody.error === "gallery_event_storage_quota_exceeded")
          ) {
            updateItem(item.id, {
              status: "blocked",
              error:
                errorBody.message ??
                (errorBody.error === "gallery_upload_window_closed"
                  ? "This gallery is view-only. Upgrade to continue uploading."
                  : "This gallery has reached its configured storage quota. Upgrade to continue uploading."),
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
          if (
            createRes.status === 403 &&
            errorBody.error === "storage_quota_exceeded"
          ) {
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
          if (
            createRes.status === 404 &&
            (errorBody.error === "gallery not found" ||
              errorBody.error === "album not found")
          ) {
            updateItem(item.id, {
              status: "error",
              error:
                errorBody.error === "album not found"
                  ? "Couldn't link this upload to the selected sub-gallery (it may have been deleted). Try again."
                  : "Couldn't link this upload to this gallery (it may have been deleted). Try again.",
            });
            return;
          }
          throw new Error(
            uploadCreateSessionErrorMessage(createRes.status, errorBody),
          );
        }

        const { upload_id } = await createRes.json();
        uploadIdForCleanup = upload_id;
        uploadSessionIds.current.set(item.id, upload_id);
        let offset = 0;
        let finalAssetId: string | undefined;

        while (offset < item.file.size) {
          while (pausedRef.current || pausedItems.current.has(item.id)) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (controller.signal.aborted)
              throw new DOMException("Aborted", "AbortError");
          }
          await waitForOnline(controller.signal);

          const end = Math.min(offset + CHUNK_SIZE, item.file.size);
          const chunk = item.file.slice(offset, end);

          const { nextOffset, response: patchRes } =
            await uploadChunkWithResume({
              uploadId: upload_id,
              offset,
              end,
              chunk,
              totalSize: item.file.size,
              signal: controller.signal,
            });

          offset = nextOffset;
          if (offset >= item.file.size) {
            const body = (await patchRes.json().catch(() => ({}))) as {
              asset?: { id?: string };
            };
            finalAssetId = body.asset?.id;
            uploadSessionFinished = true;
            uploadSessionIds.current.delete(item.id);
          }
          updateItem(item.id, {
            progress: Math.round((offset / item.file.size) * 100),
          });
        }

        updateItem(item.id, {
          status: "complete",
          progress: 100,
          assetId: finalAssetId,
          faceIndexUnavailable: false,
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          if (
            uploadIdForCleanup &&
            !uploadSessionFinished &&
            uploadSessionIds.current.has(item.id)
          ) {
            uploadSessionIds.current.delete(item.id);
            void cancelUploadSession(uploadIdForCleanup);
          }
          return;
        }
        if (uploadIdForCleanup && !uploadSessionFinished) {
          uploadSessionIds.current.delete(item.id);
          await cancelUploadSession(uploadIdForCleanup);
        }
        // A finalize/chunk rejection with a known server code (the Tier-D scan
        // codes or the still-image gate) is surfaced as a real reason. Content
        // and manifest rejections are "blocked" (the same bytes will keep
        // failing).
        if (
          err instanceof ChunkUploadError &&
          isNonRetryableFinalizeCode(err.code)
        ) {
          updateItem(item.id, {
            status: "blocked",
            errorCode: err.code,
            requiresReselect: finalizeErrorRequiresReselect(err.code),
            error: err.message,
          });
          return;
        }
        // A hash-mismatch finalize verdict recovers on retry — Retry re-screens
        // fresh bytes and re-verifies server side. We count attempts so a
        // genuinely-corrupt source crosses the cap and is sent to a terminal
        // re-select instead of looping. finalizeRetryCount is preserved across
        // retry()/retryAll() via item spread.
        if (
          err instanceof ChunkUploadError &&
          isRetryableHashMismatchCode(err.code)
        ) {
          const nextRetryCount = (item.finalizeRetryCount ?? 0) + 1;
          const { requiresReselect } = finalizeHashRetryDisposition(
            err.code,
            item.finalizeRetryCount ?? 0,
          );
          updateItem(item.id, {
            status: "error",
            errorCode: err.code,
            finalizeRetryCount: nextRetryCount,
            requiresReselect,
            error: requiresReselect
              ? finalizeRetryExhaustedMessage(item.file.name)
              : err.message,
          });
          return;
        }
        const fileReadPermissionError = isFileReadPermissionError(err);
        updateItem(item.id, {
          status: "error",
          requiresReselect: fileReadPermissionError,
          error: fileReadPermissionError
            ? fileReadPermissionRecoveryMessage(item.file.name)
            : (err as Error).message,
        });
      } finally {
        abortControllers.current.delete(item.id);
        uploadSessionIds.current.delete(item.id);
        activeUploads.current = Math.max(0, activeUploads.current - 1);
        pumpQueue.current();
      }
    },
    [apiUrl, token, updateItem],
  );

  // Keep pumpQueue.current pointing at a closure over the latest chunkedUpload
  // after each commit (assigning a ref during render is impure under the React
  // Compiler). enqueueUploads invokes pumpQueue.current() from event handlers,
  // which always run after the initial commit, so the queue drains as before.
  useEffect(() => {
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
  });

  const enqueueUploads = useCallback((nextItems: QueuedUploadItem[]) => {
    pendingQueue.current.push(...nextItems);
    pumpQueue.current();
  }, []);

  const addFiles = useCallback(
    (files: File[], options?: AddUploadFilesOptions) => {
      const currentDestination = destinationRef.current
        ? { ...destinationRef.current }
        : undefined;
      const currentOnTermsRequired = onTermsRequiredRef.current;
      const newItems: QueuedUploadItem[] = files.map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        progress: 0,
        status: "pending" as const,
        uploadDestination: options?.destination ?? currentDestination,
        uploadOnTermsRequired: currentOnTermsRequired,
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
        const active = prev.filter((i) => isActiveUploadStatus(i.status));
        return [...active, ...newItems];
      });

      enqueueUploads(newItems);
    },
    [enqueueUploads],
  );

  const cancel = useCallback((id: string) => {
    pausedItems.current.delete(id);
    pendingQueue.current = pendingQueue.current.filter(
      (item) => item.id !== id,
    );
    const uploadId = uploadSessionIds.current.get(id);
    if (uploadId) {
      uploadSessionIds.current.delete(id);
      void cancelUploadSession(uploadId);
    }
    const controller = abortControllers.current.get(id);
    if (controller) controller.abort();
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pause = useCallback(
    (id: string) => {
      pausedItems.current.add(id);
      pendingQueue.current = pendingQueue.current.filter(
        (item) => item.id !== id,
      );
      updateItem(id, { status: "paused" });
    },
    [updateItem],
  );

  const resume = useCallback(
    (id: string) => {
      pausedItems.current.delete(id);
      const item = items.find((entry) => entry.id === id);
      if (!item) return;
      if (abortControllers.current.has(id)) {
        updateItem(id, { status: "uploading" });
        return;
      }
      const retryItem = {
        ...(item as QueuedUploadItem),
        status: "pending" as const,
      };
      updateItem(id, { status: "pending" });
      enqueueUploads([retryItem]);
    },
    [enqueueUploads, items, updateItem],
  );

  const retry = useCallback(
    (id: string) => {
      const item = items.find((entry) => entry.id === id);
      if (item) {
        if (item.requiresReselect) return;
        pausedItems.current.delete(id);
        const retryItem = {
          ...(item as QueuedUploadItem),
          status: "pending" as const,
          progress: 0,
        };
        updateItem(id, {
          status: "pending",
          progress: 0,
          error: undefined,
          errorCode: undefined,
          requiresReselect: undefined,
        });
        enqueueUploads([retryItem]);
      }
    },
    [enqueueUploads, items, updateItem],
  );

  // 2026-05-21: bulk-retry every item in the "error" set so the UI can offer
  // a single "Retry All" button on the persisted-after-failure upload panel.
  // Blocked / needs_desktop items are intentionally excluded — those were
  // rejected at the screening stage and the same file would block again.
  const retryAll = useCallback(() => {
    const failed = items.filter(
      (i) => i.status === "error" && !i.requiresReselect,
    );
    const retryItems = failed.map((item) => ({
      ...(item as QueuedUploadItem),
      status: "pending" as const,
      progress: 0,
    }));
    setItems((prev) =>
      prev.map((item) =>
        item.status === "error"
          ? {
              ...item,
              status: item.requiresReselect ? item.status : "pending",
              progress: item.requiresReselect ? item.progress : 0,
              error: item.requiresReselect ? item.error : undefined,
              errorCode: item.requiresReselect ? item.errorCode : undefined,
              requiresReselect: item.requiresReselect ? true : undefined,
            }
          : item,
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
      prev.filter((item) => isActiveUploadStatus(item.status)),
    );
  }, []);

  const cancelAll = useCallback(() => {
    pausedItems.current.clear();
    pendingQueue.current = [];
    const uploadIds = Array.from(uploadSessionIds.current.values());
    uploadSessionIds.current.clear();
    uploadIds.forEach((uploadId) => {
      void cancelUploadSession(uploadId);
    });
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
