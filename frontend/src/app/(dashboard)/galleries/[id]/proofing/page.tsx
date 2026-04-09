"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { getAsset, type Asset } from "@/lib/api/assets";
import { getGallery, type Gallery } from "@/lib/api/galleries";
import {
  listProofingSelections,
  updateSelectionStatus,
  listProofingSessions,
  setStarRating as apiSetStarRating,
  type ProofingSelection,
  type ProofingSession,
} from "@/lib/api/proofing";
import { StarRating } from "@/components/gallery/star-rating";
import { getAssetPreviewUrl, proofingStatusClasses } from "@/lib/dashboard-ui";
import { cn } from "@/lib/utils";

type AssetMap = Record<string, Asset>;

export default function GalleryProofingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [selections, setSelections] = useState<ProofingSelection[]>([]);
  const [assetsById, setAssetsById] = useState<AssetMap>({});
  const [sessions, setSessions] = useState<ProofingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeSelectionId, setActiveSelectionId] = useState("");

  useEffect(() => {
    const token = getStoredAccessToken();

    if (!token) {
      setError("Your session expired. Please log in again.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadProofing = async () => {
      setLoading(true);
      setError("");

      try {
        const [galleryData, selectionData, sessionData] = await Promise.all([
          getGallery(token, id),
          listProofingSelections(token, id),
          listProofingSessions(token, id).catch(() => [] as ProofingSession[]),
        ]);

        const assetEntries = await Promise.allSettled(
          Array.from(new Set(selectionData.map((selection) => selection.asset_id))).map(async (assetId) => {
            const asset = await getAsset(token, assetId);
            return [assetId, asset] as const;
          }),
        );

        if (cancelled) {
          return;
        }

        const nextAssetMap: AssetMap = {};
        assetEntries.forEach((result) => {
          if (result.status === "fulfilled") {
            const [assetId, asset] = result.value;
            nextAssetMap[assetId] = asset;
          }
        });

        setGallery(galleryData);
        setSelections(selectionData);
        setAssetsById(nextAssetMap);
        setSessions(sessionData);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load proofing selections.");
          setGallery(null);
          setSelections([]);
          setAssetsById({});
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadProofing();

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

  const handleUpdate = async (selectionId: string, status: string) => {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Your session expired. Please log in again.");
      return;
    }

    setActiveSelectionId(selectionId);
    setError("");

    try {
      await updateSelectionStatus(token, id, selectionId, status);
      setSelections((current) =>
        current.map((selection) =>
          selection.id === selectionId ? { ...selection, status } : selection,
        ),
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update selection.");
    } finally {
      setActiveSelectionId("");
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-72 rounded bg-surface-sunken" />
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-40 rounded-2xl bg-surface-sunken" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!gallery) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-text-secondary">{error || "Proofing view unavailable."}</p>
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
          <Link href={`/galleries/${gallery.id}`} className="btn-tertiary px-0 py-0 text-sm">
            Back to gallery
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Proofing Queue</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Review client selections for <span className="font-medium text-text-primary">{gallery.title}</span>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="status-badge status-badge--accent">Selected {selectionCounts.selected || 0}</span>
            <span className="status-badge status-badge--success">Approved {selectionCounts.approved || 0}</span>
            <span className="status-badge status-badge--danger">Rejected {selectionCounts.rejected || 0}</span>
          </div>
          {sessions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-xs text-text-secondary">Lists:</span>
              {sessions.map(s => (
                <span key={s.id} className="status-badge status-badge--neutral text-xs">
                  {s.name} {s.is_system ? "(system)" : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div
          className="surface-panel p-4 text-sm"
          style={{ borderColor: "color-mix(in srgb, var(--feedback-error) 24%, transparent)", color: "var(--feedback-error)" }}
        >
          {error}
        </div>
      )}

      {selections.length === 0 ? (
        <div className="surface-panel px-6 py-14 text-center text-sm text-text-secondary">
          No proofing selections have been submitted yet.
        </div>
      ) : (
        <div className="space-y-4">
          {selections.map((selection) => {
            const asset = assetsById[selection.asset_id];
            const previewUrl = getAssetPreviewUrl(asset);
            const isBusy = activeSelectionId === selection.id;

            return (
              <article
                key={selection.id}
                className="surface-panel grid gap-4 overflow-hidden p-4 md:grid-cols-[180px_minmax(0,1fr)]"
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={asset?.filename || "Proofing asset preview"}
                    className="aspect-[4/3] h-full w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-surface-sunken text-xs text-text-tertiary">
                    Preview unavailable
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-base font-semibold text-text-primary">{selection.client_name}</p>
                      <p className="text-sm text-text-secondary">{selection.client_email}</p>
                      {asset?.filename && (
                        <p className="mt-2 text-xs text-text-tertiary">Asset: {asset.filename}</p>
                      )}
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
                    <p className="rounded-2xl bg-surface-container-low p-3 text-sm leading-relaxed text-text-secondary">
                      {selection.note}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleUpdate(selection.id, "selected")}
                        className="surface-button text-sm"
                      >
                        Mark selected
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleUpdate(selection.id, "approved")}
                        className="status-button status-button--success px-4 py-2.5 text-sm"
                      >
                        {isBusy && selection.status !== "approved" ? "Updating..." : "Approve"}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleUpdate(selection.id, "rejected")}
                        className="status-button status-button--danger px-4 py-2.5 text-sm"
                      >
                        Reject
                      </button>
                    </div>
                    {/* M13: Star rating */}
                    <StarRating
                      rating={(selection as unknown as Record<string, unknown>).star_rating as number || 0}
                      onChange={async (rating) => {
                        const token = getStoredAccessToken();
                        if (token) {
                          try {
                            await apiSetStarRating(token, id, selection.id, rating);
                            setSelections(prev => prev.map(s =>
                              s.id === selection.id ? { ...s, star_rating: rating } as ProofingSelection : s
                            ));
                          } catch { /* silently fail — non-critical */ }
                        }
                      }}
                      size="sm"
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
