"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { use, useEffect, useState } from "react";
import { GalleryWorkspaceNav } from "@/components/gallery/gallery-workspace-nav";
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
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {/* Workspace nav first so the section dropdown is the topmost
          element on mobile (matches the cover and settings sub-pages). */}
      <GalleryWorkspaceNav galleryId={id} />

      <Link
        href={`/galleries/${id}`}
        className="btn-tertiary px-0 py-0 text-sm"
      >
        Back to gallery
      </Link>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">
          Gallery AI
        </p>
        <h1 className="text-2xl font-semibold text-text-primary">
          {gallery?.title ? `${gallery.title} AI` : "Gallery AI"}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
          Run gallery-scoped automation here so face matching, culling support,
          and client discovery stay attached to the delivery workspace.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {token && <GalleryAIPanel galleryId={id} token={token} />}
    </div>
  );
}
