"use client";

// Public People page on the guest gallery.
// Mirrors the studio /galleries/{id}/people but is read-only and
// resolves data by slug (no JWT). Server gates the lookup on both
// workspaces.face_recognition_enabled and galleries.face_detection_enabled;
// when either is off the list comes back empty and we render a
// "feature not enabled for this gallery" notice.

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, UserRound } from "lucide-react";
import { listPublicPeople, type PublicPersonSummary } from "@/lib/api/ai";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function PublicPeoplePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [people, setPeople] = useState<PublicPersonSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listPublicPeople(slug)
      .then((next) => {
        if (!cancelled) setPeople(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load people");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <Link
        href={`/g/${slug}`}
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to gallery
      </Link>

      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">People</p>
        <h1 className="text-2xl font-semibold text-text-primary">People in this gallery</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
          Photos grouped by the people who appear in them. Tap a person to see every photo they&apos;re in.
        </p>
        {/* Photo Search entry — appears alongside the People list so
            guests don't have to know the URL. The page itself handles
            the "feature not enabled for this gallery" case gracefully
            if the studio has face recognition turned off. */}
        <Link
          href={`/g/${slug}/photo-search`}
          className="inline-flex items-center gap-2 rounded-full border border-border-default bg-surface-container px-4 py-2 text-sm text-text-primary hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
        >
          Find me with my camera
        </Link>
      </header>

      {error && (
        <div className="rounded-xl border border-feedback-error/30 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}

      {people === null && !error && (
        <div className="rounded-xl border border-border-subtle bg-surface-container-low p-8 text-center text-sm text-text-secondary">
          Loading people…
        </div>
      )}

      {people !== null && people.length === 0 && !error && (
        <div className="surface-panel p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high">
            <UserRound className="h-6 w-6 text-text-tertiary" aria-hidden />
          </div>
          <p className="text-sm font-medium text-text-primary">No people to show yet</p>
          <p className="mt-1 text-xs text-text-secondary">
            Either the photographer hasn&apos;t enabled face recognition for this gallery,
            or detection is still processing.
          </p>
        </div>
      )}

      {people !== null && people.length > 0 && (
        <div
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          role="list"
          aria-label="Identified people"
        >
          {people.map((p) => (
            <PublicPersonTile key={p.id} slug={slug} person={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PublicPersonTile({ slug, person }: { slug: string; person: PublicPersonSummary }) {
  // Public asset thumbnails are served by the storage proxy at /storage/*.
  // For the cover we use the same path the studio People tab uses — the
  // thumbnails are public-readable (no token required because the storage
  // path for thumbnails is not auth-gated; see lib/dashboard-ui.ts and
  // the /storage/* proxy in cmd/api/main.go).
  //
  // The cover_asset_id resolves to a thumbnail URL we don't have until
  // we fetch the asset's thumbnail_urls. To avoid an extra N round-trips
  // we use a deterministic fallback URL pattern that points to the
  // medium webp thumbnail — same key the upload pipeline writes
  // (service.webpStorageKey: "thumbnails/{assetID}/thumb_md_webp.webp").
  const previewUrl = `${API_BASE}/storage/thumbnails/${person.cover_asset_id}/thumb_md_webp.webp`;
  const displayName = person.name?.trim() || "Unnamed person";

  return (
    <Link
      href={`/g/${slug}/people/${person.id}`}
      className="group block focus:outline-none"
      aria-label={`${displayName}, ${person.asset_count} ${person.asset_count === 1 ? "photo" : "photos"}`}
      role="listitem"
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-border-subtle bg-surface-container-high transition-transform group-hover:scale-[1.02] group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2">
        <img
          src={previewUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          // If the thumbnail isn't available (e.g. wrong content-type, video,
          // or storage path mismatch), fall back to the placeholder icon by
          // hiding the image with a small inline style trick.
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
          {person.asset_count}
        </span>
      </div>

      <div className="mt-2 px-1">
        <p className="truncate text-sm font-semibold text-text-primary">{displayName}</p>
        <p className="text-xs text-text-tertiary">
          {person.asset_count} {person.asset_count === 1 ? "photo" : "photos"}
        </p>
      </div>
    </Link>
  );
}
