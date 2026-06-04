"use client";

// Public per-person photo grid on the guest gallery.
// Mirrors the studio /galleries/{id}/people/{personId} but read-only:
// no rename, no merge, no split. Endpoints resolve by slug + personId
// (cluster_label UUID).

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  listPublicPeople,
  listPublicPersonPhotos,
  type PublicPersonSummary,
} from "@/lib/api/ai";
import type { PublicAsset } from "@/lib/api/galleries";
import { DecryptedThumb } from "@/components/gallery/decrypted-thumb";

export default function PublicPersonPhotosPage({
  params,
}: {
  params: Promise<{ slug: string; personId: string }>;
}) {
  const { slug, personId } = use(params);
  const [person, setPerson] = useState<PublicPersonSummary | null>(null);
  const [assetIds, setAssetIds] = useState<string[] | null>(null);
  // Decryptable asset records (parallel to assetIds) used to render decrypted
  // thumbnails on E2EE galleries.
  const [assets, setAssets] = useState<PublicAsset[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Two parallel loads:
        // (a) list of people → pick the one matching personId (for name +
        //     counts). We don't have a single-person endpoint and adding
        //     one is more backend churn than it's worth — the list is
        //     small (O(10s)) and already cached client-side after the
        //     People page load.
        // (b) the person's asset_ids in this gallery.
        const [list, photos] = await Promise.all([
          listPublicPeople(slug),
          listPublicPersonPhotos(slug, personId),
        ]);
        if (cancelled) return;
        setPerson(list.find((p) => p.id === personId) ?? null);
        setAssetIds(photos.asset_ids);
        setAssets(photos.assets ?? null);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load person",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, personId]);

  const displayName = person?.name?.trim() || "Unnamed person";

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <Link
        href={`/g/${slug}/people`}
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <ChevronLeft className="h-4 w-4" />
        All people
      </Link>

      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">
          Person
        </p>
        <h1 className="text-2xl font-semibold text-text-primary">
          {displayName}
        </h1>
        {person && (
          <p className="text-sm text-text-secondary">
            {person.asset_count} {person.asset_count === 1 ? "photo" : "photos"}
          </p>
        )}
      </header>

      {error && (
        <div className="rounded-xl border border-feedback-error/30 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}

      {assetIds === null && !error && (
        <div className="rounded-xl border border-border-subtle bg-surface-container-low p-8 text-center text-sm text-text-secondary">
          Loading photos…
        </div>
      )}

      {assetIds !== null && assetIds.length === 0 && !error && (
        <div className="surface-panel p-8 text-center text-sm text-text-secondary">
          No photos found for this person.
        </div>
      )}

      {assetIds !== null && assetIds.length > 0 && (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          role="list"
        >
          {(assets ?? []).map((asset) => (
            <Link
              key={asset.id}
              href={`/g/${slug}/photo/${asset.id}`}
              className="group block aspect-square overflow-hidden rounded-xl border border-border-subtle bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-accent"
              role="listitem"
              aria-label={`Photo ${asset.id}`}
            >
              <DecryptedThumb
                asset={asset}
                alt=""
                className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
