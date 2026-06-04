"use client";

import { use, useEffect, useState } from "react";
import { SalesContinuityPanel } from "@/components/gallery/sales-continuity-panel";
import { GalleryWorkspaceNav } from "@/components/gallery/gallery-workspace-nav";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { getGallery, type Gallery } from "@/lib/api/galleries";
import { getStoredAccessToken } from "@/lib/auth";

export default function GallerySalesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [token] = useState(() => getStoredAccessToken());
  const [loadError, setLoadError] = useState("");
  const error = token
    ? loadError
    : "Your session expired. Please log in again.";

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getGallery(token, id)
      .then((nextGallery) => {
        if (!cancelled) setGallery(nextGallery);
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(
            err instanceof Error ? err.message : "Failed to load gallery",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  return (
    <PageContainer>
      {/* Workspace nav first so the section dropdown is the topmost
          element on mobile (matches the AI and settings sub-pages). */}
      <GalleryWorkspaceNav galleryId={id} />

      <PageHeader
        eyebrow="Sales"
        title={
          gallery?.title
            ? `${gallery.title} sales continuity`
            : "Sales continuity"
        }
        description="Invoices, deals, and projects linked to this gallery roll up here so commerce stays in the same workspace as the photos."
        backHref={`/galleries/${id}`}
        backLabel="Back to gallery"
      />

      {error && <InlineAlert variant="error">{error}</InlineAlert>}

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
    </PageContainer>
  );
}
