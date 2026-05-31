"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { DeliveryContinuityPanel } from "@/components/gallery/delivery-continuity-panel";
import { GalleryWorkspaceNav } from "@/components/gallery/gallery-workspace-nav";
import { getGallery, listGalleryAssets, type Gallery } from "@/lib/api/galleries";
import { listProofingSelections, type ProofingSelection } from "@/lib/api/proofing";
import { getStoredAccessToken } from "@/lib/auth";

export default function GalleryDeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  // Real proofing/asset state — drives selectedCount/totalCount. Sourced the
  // same way the gallery overview page does: listProofingSelections for the
  // client selections and listGalleryAssets for the linked asset count.
  const [selections, setSelections] = useState<ProofingSelection[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [token] = useState(() => getStoredAccessToken());
  const [loadError, setLoadError] = useState("");
  const error = token ? loadError : "Your session expired. Please log in again.";

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([
      getGallery(token, id),
      // Proofing selections may legitimately fail (no clients yet / endpoint
      // outage) — mirror the overview page and degrade to an empty list so
      // the panel shows "Proofing not started" rather than crashing.
      listProofingSelections(token, id).catch(() => [] as ProofingSelection[]),
      listGalleryAssets(token, id).catch(() => []),
    ])
      .then(([nextGallery, nextSelections, nextAssets]) => {
        if (cancelled) return;
        setGallery(nextGallery);
        setSelections(nextSelections);
        setTotalCount(nextAssets.length);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load gallery");
      });
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  // selectedCount = distinct assets a client has actually selected. A
  // proofing_selections row defaults to status 'selected' (migration 015),
  // and multiple clients can select the same asset, so we dedupe by asset_id
  // and exclude any non-selected status (e.g. 'rejected'). This is the same
  // status-keyed reduction the overview page applies via proofingFilterAssetIds.
  const selectedCount = useMemo(() => {
    const ids = new Set<string>();
    for (const s of selections) {
      if (s.status === "selected") ids.add(s.asset_id);
    }
    return ids.size;
  }, [selections]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {/* Workspace nav first so the section dropdown is the topmost
          element on mobile (matches the AI and settings sub-pages). */}
      <GalleryWorkspaceNav galleryId={id} />

      <Link href={`/galleries/${id}`} className="btn-tertiary px-0 py-0 text-sm">
        Back to gallery
      </Link>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Delivery</p>
        <h1 className="text-2xl font-semibold text-text-primary">
          {gallery?.title ? `${gallery.title} delivery continuity` : "Delivery continuity"}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
          Downloads, views, and proofing progress stay attached to this gallery workspace so hand-off
          status never drifts into a separate module.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {token && (
        <DeliveryContinuityPanel
          galleryId={id}
          token={token}
          selectedCount={selectedCount}
          totalCount={totalCount}
        />
      )}
    </div>
  );
}
