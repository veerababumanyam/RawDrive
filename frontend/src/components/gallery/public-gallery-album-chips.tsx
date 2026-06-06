"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PublicGalleryAlbum } from "@/lib/api/galleries";

// Public-facing album filter chip strip that sits between the gallery
// hero cover and the asset grid on /g/<slug>. Mirrors the dashboard's
// Sub-galleries chip row but is intentionally guest-flat — no Share,
// no QR, no per-chip overflow menu. Clients tap a chip and the gallery
// reloads with the corresponding ?album=<id> filter applied by the
// server (the public ListAssets / ListAlbumAssets endpoints already
// scope to the album).
//
// Server component — pure read-only rendering of links. No client state.
// All navigation is via Next.js Link → search-param change → page re-fetch.

interface PublicGalleryAlbumChipsProps {
  slug: string;
  albums: PublicGalleryAlbum[];
  totalAssetCount: number;
  activeAlbumId?: string;
  baseHref?: string;
}

export function PublicGalleryAlbumChips({
  slug,
  albums,
  totalAssetCount,
  activeAlbumId,
  baseHref,
}: PublicGalleryAlbumChipsProps) {
  // No albums to show → no chip strip. The "All Photos" chip alone
  // would be a no-op affordance, so we hide the strip entirely.
  if (albums.length === 0) return null;

  // Order: "All Photos" first, then albums by their stored position so
  // the photographer's intentional ordering survives the round trip.
  const sorted = [...albums].sort((a, b) => a.position - b.position);

  const rootHref = baseHref || `/g/${slug}`;
  const allPhotosHref = rootHref;
  const isAllActive = !activeAlbumId;

  return (
    <div
      className="mx-auto max-w-6xl px-4 pt-6"
      data-testid="public-album-chips"
      aria-label="Filter gallery by album"
    >
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <Link
          href={allPhotosHref}
          aria-current={isAllActive ? "page" : undefined}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
            isAllActive
              ? "border-accent-primary bg-accent-subtle text-accent-primary"
              : "border-border-default bg-surface-container text-text-secondary hover:border-accent-primary/60 hover:text-text-primary",
          )}
        >
          <span>All Photos</span>
          <span className="text-text-tertiary">{totalAssetCount}</span>
        </Link>

        {sorted.map((album) => {
          const href = `${rootHref}?album=${encodeURIComponent(album.id)}`;
          const isActive = album.id === activeAlbumId;
          return (
            <Link
              key={album.id}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                isActive
                  ? "border-accent-primary bg-accent-subtle text-accent-primary"
                  : "border-border-default bg-surface-container text-text-secondary hover:border-accent-primary/60 hover:text-text-primary",
              )}
            >
              <span>{album.name}</span>
              <span className="text-text-tertiary">{album.asset_count}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
