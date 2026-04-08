"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { getAsset, type Asset } from "@/lib/api/assets";
import {
  getGallery,
  listGalleryAssets,
  type Gallery,
  type GalleryAsset,
} from "@/lib/api/galleries";
import { listProofingSelections, type ProofingSelection } from "@/lib/api/proofing";
import {
  galleryStatusClasses,
  galleryTypeClasses,
  getAssetPreviewUrl,
  proofingStatusClasses,
} from "@/lib/dashboard-ui";
import { cn } from "@/lib/utils";

type GalleryAssetRecord = GalleryAsset & {
  asset: Asset | null;
};

export default function GalleryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [assets, setAssets] = useState<GalleryAssetRecord[]>([]);
  const [selections, setSelections] = useState<ProofingSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getStoredAccessToken();

    if (!token) {
      setError("Your session expired. Please log in again.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadGallery = async () => {
      setLoading(true);
      setError("");

      try {
        const [galleryData, galleryAssets, gallerySelections] = await Promise.all([
          getGallery(token, id),
          listGalleryAssets(token, id),
          listProofingSelections(token, id).catch((err) => { console.warn("Failed to load proofing selections:", err?.message); return []; }),
        ]);

        const hydratedAssets = await Promise.all(
          galleryAssets.map(async (entry) => {
            try {
              const asset = await getAsset(token, entry.asset_id);
              return { ...entry, asset };
            } catch {
              return { ...entry, asset: null };
            }
          }),
        );

        if (cancelled) {
          return;
        }

        setGallery(galleryData);
        setAssets(hydratedAssets);
        setSelections(gallerySelections);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load gallery.");
          setGallery(null);
          setAssets([]);
          setSelections([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadGallery();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const selectionCounts = useMemo(() => {
    return selections.reduce<Record<string, number>>((counts, selection) => {
      counts[selection.status] = (counts[selection.status] || 0) + 1;
      return counts;
    }, {});
  }, [selections]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-surface-sunken" />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
            <div className="h-[420px] rounded-2xl bg-surface-sunken" />
            <div className="h-[420px] rounded-2xl bg-surface-sunken" />
          </div>
        </div>
      </div>
    );
  }

  if (!gallery) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-text-secondary">{error || "Gallery not found."}</p>
        <Link href="/galleries" className="btn-tertiary mt-4 px-3 py-2 text-sm">
          Back to galleries
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Link href="/galleries" className="btn-tertiary px-0 py-0 text-sm">
            Back to galleries
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">{gallery.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
              {gallery.description || "This gallery is ready for proofing, delivery, and selection review."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                galleryTypeClasses[gallery.gallery_type] || "status-badge status-badge--neutral",
              )}
            >
              {gallery.gallery_type}
            </span>
            <span
              className={cn(
                galleryStatusClasses[gallery.status] || "status-badge status-badge--neutral",
              )}
            >
              {gallery.status}
            </span>
            <span className={gallery.is_published ? "status-badge status-badge--success" : "status-badge status-badge--neutral"}>
              {gallery.is_published ? "Published" : "Unpublished"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href={`/galleries/${gallery.id}/proofing`} className="btn-primary px-4 py-2.5 text-sm">
            Review proofing
          </Link>
          <span className="status-badge status-badge--accent">
            Created {new Date(gallery.created_at).toLocaleDateString("en-IN")}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="surface-panel p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Assets</p>
              <p className="mt-3 text-2xl font-semibold text-text-primary">{assets.length}</p>
            </div>
            <div className="surface-panel p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Selections</p>
              <p className="mt-3 text-2xl font-semibold text-text-primary">{selections.length}</p>
            </div>
            <div className="surface-panel p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Selection limit</p>
              <p className="mt-3 text-2xl font-semibold text-text-primary">
                {gallery.max_selections > 0 ? gallery.max_selections : "Open"}
              </p>
            </div>
          </div>

          <div className="surface-panel space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Assets</h2>
              <p className="text-sm text-text-secondary">
                {assets.length === 0 ? "No linked assets yet" : `${assets.length} linked assets`}
              </p>
            </div>

            {assets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-default bg-surface-sunken/40 px-6 py-12 text-center text-sm text-text-secondary">
                This gallery does not have any linked assets yet.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {assets.map((entry) => {
                  const previewUrl = getAssetPreviewUrl(entry.asset || undefined);

                  return (
                    <article key={entry.id} className="surface-panel overflow-hidden">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={entry.asset?.filename || "Gallery asset preview"}
                          className="aspect-[4/3] w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[4/3] w-full items-center justify-center bg-surface-sunken text-xs text-text-tertiary">
                          Preview unavailable
                        </div>
                      )}
                      <div className="space-y-2 p-4">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {entry.asset?.filename || "Unresolved asset"}
                        </p>
                        <div className="flex items-center justify-between text-xs text-text-secondary">
                          <span>Sort #{entry.sort_order}</span>
                          {entry.is_hero && <span className="status-badge status-badge--accent">Hero</span>}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="surface-panel space-y-4 p-5">
            <h2 className="text-lg font-semibold text-text-primary">Proofing status</h2>
            <div className="flex flex-wrap gap-2">
              <span className="status-badge status-badge--accent">
                Selected {selectionCounts.selected || 0}
              </span>
              <span className="status-badge status-badge--success">
                Approved {selectionCounts.approved || 0}
              </span>
              <span className="status-badge status-badge--danger">
                Rejected {selectionCounts.rejected || 0}
              </span>
            </div>
          </div>

          <div className="surface-panel space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Recent selections</h2>
              <span className="text-xs text-text-tertiary">{selections.length}</span>
            </div>

            {selections.length === 0 ? (
              <p className="text-sm text-text-secondary">No proofing selections have been submitted yet.</p>
            ) : (
              <div className="space-y-3">
                {selections.slice(0, 6).map((selection) => (
                  <div key={selection.id} className="rounded-2xl border border-border-default bg-surface-container-low p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{selection.client_name}</p>
                        <p className="text-xs text-text-secondary">{selection.client_email}</p>
                      </div>
                      <span
                        className={cn(
                          proofingStatusClasses[selection.status] || "status-badge status-badge--neutral",
                        )}
                      >
                        {selection.status}
                      </span>
                    </div>
                    {selection.note && (
                      <p className="mt-3 text-sm leading-relaxed text-text-secondary">{selection.note}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
