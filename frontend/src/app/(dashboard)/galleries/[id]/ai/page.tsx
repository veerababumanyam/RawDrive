"use client";

import dynamic from "next/dynamic";
import { use, useEffect, useState } from "react";
import { GalleryWorkspaceNav } from "@/components/gallery/gallery-workspace-nav";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { getGallery, type Gallery } from "@/lib/api/galleries";
import { getStoredAccessToken } from "@/lib/auth";

// PERF-SPLIT: the GalleryAIPanel only mounts once a session token resolves
// ({token && <GalleryAIPanel/>}), and it carries the face-scan polling +
// API surface. Load it in an async chunk instead of the AI route's
// first-load JS. ssr:false is safe — this is a "use client" panel that
// reads localStorage for the token and never renders on the server.
const GalleryAIPanel = dynamic(
  () =>
    import("@/components/gallery/gallery-ai-panel").then(
      (m) => m.GalleryAIPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-40 w-full animate-pulse rounded-2xl border border-border-subtle bg-surface-sunken"
        aria-busy="true"
        aria-label="Loading gallery AI tools"
      />
    ),
  },
);

export default function GalleryAIPage({
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
          element on mobile (matches the cover and settings sub-pages). */}
      <GalleryWorkspaceNav galleryId={id} />

      <PageHeader
        eyebrow="Gallery AI"
        title={gallery?.title ? `${gallery.title} AI` : "Gallery AI"}
        description="Run gallery-scoped automation here so face matching, culling support, and client discovery stay attached to the delivery workspace."
        backHref={`/galleries/${id}`}
        backLabel="Back to gallery"
      />

      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      {token && <GalleryAIPanel galleryId={id} token={token} />}
    </PageContainer>
  );
}
