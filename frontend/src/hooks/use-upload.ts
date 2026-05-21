"use client";

import { useState, useCallback, useRef } from "react";
import type { UploadItem } from "@/components/upload/upload-progress";
import type { ScanManifest } from "@/lib/upload-screening/types";
import { screen } from "@/lib/upload-screening/screen";
import { sha256HexChunked } from "@/lib/upload-screening/hash";
import { buildManifest } from "@/lib/upload-screening/manifest";
import { activePolicyVersion } from "@/lib/upload-screening/policy";
import { authFetch } from "@/lib/api/authFetch";

const CHUNK_SIZE = 5 * 1024 * 1024;
const DEFAULT_METADATA_BUDGET = 512 * 1024;

async function runScreener(
  file: File,
  apiUrl: string,
): Promise<ScanManifest> {
  const policyVersion = await activePolicyVersion(apiUrl);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = screen(bytes, {
    metadataBudgetBytes: DEFAULT_METADATA_BUDGET,
    declaredType: file.type,
  });
  const sha256 = await sha256HexChunked(file);
  return buildManifest({ file, policyVersion, sha256, result });
}

export function useUpload(apiUrl: string, token: string) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const pausedRef = useRef(false);

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
        manifest = await runScreener(item.file, apiUrl);
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

      const createRes = await authFetch("/api/v1/uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: item.file.name,
          content_type: item.file.type || "application/octet-stream",
          total_size: item.file.size,
          chunk_size: CHUNK_SIZE,
          scan_manifest: manifest,
        }),
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
    }
  }, [apiUrl, token, updateItem]);

  const addFiles = useCallback((files: File[]) => {
    const newItems: UploadItem[] = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      progress: 0,
      status: "pending" as const,
    }));

    setItems((prev) => [...prev, ...newItems]);

    for (const item of newItems) {
      void chunkedUpload(item);
    }
  }, [chunkedUpload]);

  const cancel = useCallback((id: string) => {
    const controller = abortControllers.current.get(id);
    if (controller) controller.abort();
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const retry = useCallback((id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (item) {
      void chunkedUpload({ ...item, status: "pending", progress: 0 });
    }
  }, [chunkedUpload, items]);

  // 2026-05-21: bulk-retry every item in the "error" set so the UI can offer
  // a single "Retry All" button on the persisted-after-failure upload panel.
  // Blocked / needs_desktop items are intentionally excluded — those were
  // rejected at the screening stage and the same file would block again.
  const retryAll = useCallback(() => {
    const failed = items.filter((i) => i.status === "error");
    for (const item of failed) {
      void chunkedUpload({ ...item, status: "pending", progress: 0 });
    }
  }, [chunkedUpload, items]);

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
