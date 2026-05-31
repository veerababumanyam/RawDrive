"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { SalesContinuityPanel } from "@/components/gallery/sales-continuity-panel";
import { GalleryWorkspaceNav } from "@/components/gallery/gallery-workspace-nav";
import { getGallery, type Gallery } from "@/lib/api/galleries";
import { getStoredAccessToken } from "@/lib/auth";

export default function GallerySalesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [token] = useState(() => getStoredAccessToken());
  const [loadError, setLoadError] = useState("");
  const error = token ? loadError : "Your session expired. Please log in again.";

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getGallery(token, id)
      .then((nextGallery) => {
        if (!cancelled) setGallery(nextGallery);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load gallery");
      });
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {/* Workspace nav first so the section dropdown is the topmost
          element on mobile (matches the AI and settings sub-pages). */}
      <GalleryWorkspaceNav galleryId={id} />

      <Link href={`/galleries/${id}`} className="btn-tertiary px-0 py-0 text-sm">
        Back to gallery
      </Link>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Sales</p>
        <h1 className="text-2xl font-semibold text-text-primary">
          {gallery?.title ? `${gallery.title} sales continuity` : "Sales continuity"}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
          Invoices, deals, and projects linked to this gallery roll up here so commerce stays in the
          same workspace as the photos.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {/* The Gallery object carries the CRM linkage ids (invoice_id / deal_id /
          project_id). cartCount stays 0 — there is no per-gallery cart/order
          count helper in the API surface, so we do not invent one. */}
      {token && gallery && (
        <SalesContinuityPanel
          invoiceId={gallery.invoice_id}
          dealId={gallery.deal_id}
          projectId={gallery.project_id}
          cartCount={0}
        />
      )}
    </div>
  );
}
