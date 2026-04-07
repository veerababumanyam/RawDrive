"use client";

import { useState, useCallback, useRef } from "react";
import type { UploadItem } from "@/components/upload/upload-progress";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

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
    updateItem(item.id, { status: "uploading" });

    try {
      // Step 1: Create upload session
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
        }),
        signal: controller.signal,
      });

      if (!createRes.ok) throw new Error(`Create session failed: ${createRes.status}`);
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
