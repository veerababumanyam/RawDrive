"use client";

import { useState, useCallback, useRef } from "react";
import type { UploadItem } from "@/components/upload/upload-progress";
import type { ScanManifest } from "@/lib/upload-screening/types";
import { screen } from "@/lib/upload-screening/screen";
import { sha256HexChunked } from "@/lib/upload-screening/hash";
import { buildManifest } from "@/lib/upload-screening/manifest";
import { activePolicyVersion } from "@/lib/upload-screening/policy";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

// M16 E47-S1/S3: metadata budget for browser screening. Kept in sync with
// the policy row seeded in migration 054. If the backend publishes a new
// policy with a different budget the worker picks it up automatically via
// the policy catalog — this constant is only the fallback.
const DEFAULT_METADATA_BUDGET = 512 * 1024;

/**
 * M16 E47-S1: Run the upload screening pipeline for a single File.
 *
 * We run the screener on the main thread (instead of dispatching to a
 * Web Worker) because the browser's <ImageBitmap> decode path already
 * runs off-thread inside the browser, and our pure-function screener
 * is O(file.size) with very small constants. The Web Worker variant
 * (src/workers/upload-screening.worker.ts) exists for future scale-up
 * and for environments where the main thread is budget-constrained.
 *
 * The screening pipeline is:
 *   1. Fetch the active policy version (10-minute cached)
 *   2. Structural screen via screen() — decides pass/block/needs_desktop_scan
 *   3. SHA-256 the file (chunked)
 *   4. Build the canonical manifest
 */
async function runScreener(
  file: File,
  apiUrl: string
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

  const updateItem = (id: string, updates: Partial<UploadItem>) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...updates } : i))
    );
  };

  const addFiles = useCallback(
    (files: File[]) => {
      const newItems: UploadItem[] = files.map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        progress: 0,
        status: "pending" as const,
      }));

      setItems((prev) => [...prev, ...newItems]);

      for (const item of newItems) {
        chunkedUpload(item);
      }
    },
    [apiUrl, token]
  );

  const chunkedUpload = async (item: UploadItem) => {
    const controller = new AbortController();
    abortControllers.current.set(item.id, controller);

    try {
      // ──────────────── M16 E47-S4: Tier D pre-flight screening ────────────
      // Run the local structural screener BEFORE opening a TUS session so
      // that a blocked file never sends bytes over the wire. This is the
      // happy path; the backend re-validates at session create for the
      // trust boundary.
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
          error:
            "this format requires the RawDrive Desktop companion (M17)",
          scanManifest: manifest,
        });
        return;
      }

      updateItem(item.id, { status: "uploading", scanManifest: manifest });

      // Step 1: Create upload session (with scan manifest attached).
      const createRes = await fetch(`${apiUrl}/api/v1/uploads`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
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
        // Server-side validation rejected the manifest. Map the error code
        // to a user-facing status so the UI can surface the right message.
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
        throw new Error(`Create session failed: ${createRes.status}`);
      }
      const { upload_id } = await createRes.json();

      // Step 2: Upload chunks
      let offset = 0;
      while (offset < item.file.size) {
        // Check pause
        while (pausedRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        }

        const end = Math.min(offset + CHUNK_SIZE, item.file.size);
        const chunk = item.file.slice(offset, end);

        const patchRes = await fetch(`${apiUrl}/api/v1/uploads/${upload_id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/offset+octet-stream",
            "Upload-Offset": String(offset),
          },
          body: chunk,
          signal: controller.signal,
        });

        if (!patchRes.ok) throw new Error(`Chunk upload failed: ${patchRes.status}`);

        offset = end;
        const progress = Math.round((offset / item.file.size) * 100);
        updateItem(item.id, { progress });
      }

      updateItem(item.id, { status: "complete", progress: 100 });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      updateItem(item.id, {
        status: "error",
        error: (err as Error).message,
      });
    } finally {
      abortControllers.current.delete(item.id);
    }
  };

  const cancel = useCallback((id: string) => {
    const controller = abortControllers.current.get(id);
    if (controller) controller.abort();
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const retry = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      if (item) chunkedUpload({ ...item, status: "pending", progress: 0 });
    },
    [items]
  );

  const cancelAll = useCallback(() => {
    abortControllers.current.forEach((c) => c.abort());
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
    cancelAll,
    pauseAll,
    resumeAll,
    isPaused,
  };
}
