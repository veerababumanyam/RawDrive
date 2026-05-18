"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { GalleryWorkspaceNav } from "@/components/gallery/gallery-workspace-nav";
import { PeopleGrid } from "@/components/gallery/people-grid";
import { getGallery, type Gallery } from "@/lib/api/galleries";
import { getStoredAccessToken } from "@/lib/auth";

// People tab — face-recognition-grouped view of a gallery.
//
// Renders a grid of person tiles (PeopleGrid). Each tile links to
// /galleries/{id}/people/{clusterLabel} (handled by the nested
// [personId] route) for the filtered photo view.
//
// Why a dedicated tab vs filter chips on the main gallery view: the
// existing FaceFilter chip strip is great for "filter photos by face"
// but obscures the cluster as a first-class entity. A dedicated People
// page makes it clear that the system identifies *people*, not just
// classified photos — closer to how Apple Photos / Google Photos
// surface the same data.
export default function GalleryPeoplePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [token] = useState(() => getStoredAccessToken());
  const [loadError, setLoadError] = useState("");
  const error = token ? loadError : "Your session expired. Please log in again.";

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getGallery(token, id)
      .then((next) => {
        if (!cancelled) setGallery(next);
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
      <GalleryWorkspaceNav galleryId={id} />

      <Link href={`/galleries/${id}`} className="btn-tertiary px-0 py-0 text-sm">
        Back to gallery
      </Link>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">People</p>
        <h1 className="text-2xl font-semibold text-text-primary">
          {gallery?.title ? `${gallery.title} — People` : "People"}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
          Photos grouped by the people who appear in them. Tap a person to see every photo they&apos;re in.
          Names you set here also drive the face filter on the main gallery view.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-feedback-error/30 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}

      {token && <PeopleGrid galleryId={id} token={token} />}
    </div>
  );
}
