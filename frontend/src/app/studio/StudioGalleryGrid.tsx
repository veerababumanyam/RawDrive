"use client";

import { useCallback, useState } from "react";
import {
  getPublicStudioLanding,
  type PublicStudioGallery,
} from "@/lib/api/galleries";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";

function pickGalleryCover(gallery?: PublicStudioGallery | null): string {
  const variants = gallery?.cover_thumbnails;
  if (!variants) return "";
  const url =
    variants.thumb_lg_webp ||
    variants.thumb_md_webp ||
    variants.thumb_sm_webp ||
    variants.display_webp ||
    "";
  return getStorageBackedUrl(url);
}

function GalleryCard({ gallery }: { gallery: PublicStudioGallery }) {
  const cover = pickGalleryCover(gallery);

  return (
    <a
      href={gallery.public_url}
      className="group block overflow-hidden rounded-2xl border border-border-subtle bg-surface-elevated shadow-glass transition hover:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus"
    >
      <div className="aspect-[4/3] bg-surface-sunken">
        {cover ? (
          <img
            src={cover}
            alt={`${gallery.title} cover`}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-text-tertiary">
            Preview coming soon
          </div>
        )}
      </div>
      <div className="space-y-2 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-text-primary">
            {gallery.title}
          </h2>
          <span className="status-badge status-badge--success">Published</span>
        </div>
        {gallery.description ? (
          <p className="line-clamp-2 text-sm text-text-secondary">
            {gallery.description}
          </p>
        ) : null}
      </div>
    </a>
  );
}

interface StudioGalleryGridProps {
  subdomain: string;
  initialGalleries: PublicStudioGallery[];
  initialNextCursor?: string | null;
}

// StudioGalleryGrid renders the public studio's published-gallery cards and,
// when the studio has more than one page of published galleries (PUB-CAP),
// progressively loads the rest via the keyset cursor. The first page is
// server-rendered (good for SEO + LCP); subsequent pages are fetched on demand.
export function StudioGalleryGrid({
  subdomain,
  initialGalleries,
  initialNextCursor,
}: StudioGalleryGridProps) {
  const [galleries, setGalleries] =
    useState<PublicStudioGallery[]>(initialGalleries);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialNextCursor ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const page = await getPublicStudioLanding(subdomain, nextCursor);
      setGalleries((prev) => {
        // De-duplicate defensively in case a TTL-window publish shifts the
        // keyset boundary between page fetches.
        const seen = new Set(prev.map((g) => g.id));
        const merged = [...prev];
        for (const g of page.galleries) {
          if (!seen.has(g.id)) merged.push(g);
        }
        return merged;
      });
      setNextCursor(page.next_cursor ?? null);
    } catch {
      setError("Could not load more galleries. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [subdomain, nextCursor, loading]);

  if (galleries.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-8 text-center text-text-secondary shadow-glass">
        No published galleries are available yet.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {galleries.map((gallery) => (
          <GalleryCard key={gallery.id} gallery={gallery} />
        ))}
      </div>

      {error ? (
        <p
          role="alert"
          className="text-center text-sm font-medium text-feedback-error"
        >
          {error}
        </p>
      ) : null}

      {nextCursor ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            aria-busy={loading}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle bg-surface-elevated/70 px-6 py-3 text-sm font-semibold text-text-primary glass-blur-soft transition hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Loading…" : "Load more galleries"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
