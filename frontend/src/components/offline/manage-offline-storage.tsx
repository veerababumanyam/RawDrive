"use client";

import { useEffect, useState } from "react";
import { listSaved, removeGallery } from "@/lib/offline/catalog";
import type { SavedGalleryMeta } from "@/lib/offline/types";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Trash } from "@/components/icons";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ManageOfflineStorage() {
  const [galleries, setGalleries] = useState<SavedGalleryMeta[] | null>(null);
  const [totalUsage, setTotalUsage] = useState<number | null>(null);

  // Load saved galleries on mount, sorted by lastViewedAt desc
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const all = await listSaved();
      if (!cancelled) {
        setGalleries(all.slice().sort((a, b) => b.lastViewedAt - a.lastViewedAt));
      }
    };
    void load();

    // Read storage estimate if available
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      void navigator.storage.estimate().then((est) => {
        if (!cancelled && typeof est.usage === "number") {
          setTotalUsage(est.usage);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRemove = async (gallery: SavedGalleryMeta) => {
    await removeGallery(gallery.slug);

    // Notify service worker to delete the cache bucket
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.ready;
      reg?.active?.postMessage({ type: "offline:deleteBucket", galleryId: gallery.galleryId });
    }

    // Update local state
    setGalleries((prev) => prev?.filter((g) => g.slug !== gallery.slug) ?? []);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-text-primary">Offline galleries</h2>
        {totalUsage !== null && (
          <span className="text-sm text-text-secondary">{formatBytes(totalUsage)} used</span>
        )}
      </div>

      {/* Loading skeleton */}
      {galleries === null && (
        <p className="text-sm text-text-tertiary">Loading…</p>
      )}

      {/* Empty state */}
      {galleries !== null && galleries.length === 0 && (
        <div className="rounded-2xl bg-surface-container-low/40 border border-white/[0.05] px-5 py-8 text-center">
          <p className="text-sm text-text-secondary">No galleries saved offline yet.</p>
        </div>
      )}

      {/* Gallery list */}
      {galleries !== null && galleries.length > 0 && (
        <ul className="flex flex-col gap-2">
          {galleries.map((gallery) => (
            <li
              key={gallery.slug}
              className="flex items-center gap-3 rounded-2xl bg-surface-container-low/40 border border-white/[0.05] px-4 py-3 backdrop-blur-md"
            >
              {/* Gallery info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{gallery.title}</p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {formatBytes(gallery.approxBytes)}
                  {" · "}
                  {new Date(gallery.lastViewedAt).toLocaleDateString()}
                </p>
              </div>

              {/* Remove action */}
              <GlassIconButton
                variant="danger"
                size="md"
                label={`Remove offline copy of ${gallery.title}`}
                onClick={() => void handleRemove(gallery)}
              >
                <Trash />
              </GlassIconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
