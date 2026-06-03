"use client";

import { useEffect, useState } from "react";
import { getGalleryMeta, touchViewed } from "@/lib/offline/catalog";
import type { SavedGalleryMeta, SavedAsset } from "@/lib/offline/types";
import type { PublicAsset } from "@/lib/api/galleries";
import { PublicGalleryGrid } from "./public-gallery-grid";

/**
 * Adapt a SavedAsset (offline catalog entry) to the PublicAsset shape
 * expected by PublicGalleryGrid.
 *
 * Key mapping:
 * - id, filename, width, height, blurhash — direct pass-through.
 * - thumbnailUrls → thumbnail_urls.
 * - is_encrypted — true when a manifest is present.
 * - content_type — always "image/webp" (all offline copies are WebP
 *   derivatives; originals are not cached).
 * - sort_order — 0 (ordering is preserved by array position from the catalog).
 *
 * E2EE decrypt-on-view: cacheGalleryForOffline persists ONLY the display_webp
 * `.enc` ciphertext (sync.ts) and stores its *variant* manifest on
 * SavedAsset.manifest (variantManifest(asset, "display_webp")). For the encrypted
 * branch of useDecryptedAssetUrl to fire offline, the adapted asset must:
 *   1. set is_encrypted + a media_encryption whose top-level `scheme` is
 *      rawdrive-e2ee-v1 (so assetUsesClientMediaEncryption() returns true), AND
 *   2. expose that manifest under media_encryption.variants.display_webp, because
 *      pickAssetMediaCandidates() reads the per-variant manifest via
 *      variantManifest() (= media_encryption.variants[variant]).
 * We therefore re-wrap the stored display_webp manifest as both the top-level
 * manifest (scheme gate) and the display_webp variant manifest (decrypt key),
 * and restrict thumbnail_urls to display_webp — the only variant whose bytes are
 * actually in Cache Storage offline.
 */
function adaptAsset(saved: SavedAsset): PublicAsset {
  const isEncrypted = saved.manifest !== null;

  if (isEncrypted) {
    const manifest = saved.manifest as unknown as Record<string, unknown>;
    return {
      id: saved.id,
      filename: saved.filename,
      content_type: "image/webp",
      width: saved.width,
      height: saved.height,
      blurhash: saved.blurhash,
      // Only display_webp is cached as `.enc` ciphertext offline. Point the grid
      // at the .enc storage key and let useDecryptedAssetUrl read it cache-first.
      thumbnail_urls: { display_webp: saved.displayKey },
      is_encrypted: true,
      media_encryption: {
        ...manifest,
        // Top-level scheme satisfies assetUsesClientMediaEncryption(); the
        // display_webp variant manifest is what pickAssetMediaCandidates decrypts.
        scheme: "rawdrive-e2ee-v1",
        variants: { display_webp: manifest },
      },
      sort_order: 0,
    };
  }

  return {
    id: saved.id,
    filename: saved.filename,
    content_type: "image/webp",
    width: saved.width,
    height: saved.height,
    blurhash: saved.blurhash,
    thumbnail_urls: {
      ...saved.thumbnailUrls,
      // Expose the display key as a fallback for lightbox variants too.
      display_webp: saved.displayKey,
    },
    is_encrypted: false,
    media_encryption: undefined,
    sort_order: 0,
  };
}

type ViewState = "loading" | "not-saved" | "ready";

/**
 * OfflineGalleryView — renders a saved (offline) gallery from the local
 * IndexedDB catalog + Cache Storage asset bytes.
 *
 * Route context: the service worker falls back to this component (via the
 * /g/[slug] route) when the network is unavailable. It reads metadata from
 * the offline catalog and passes adapted assets to PublicGalleryGrid. The
 * grid's asset-image hook (useDecryptedAssetUrl) paints the network URL then
 * upgrades from the offline Cache Storage bucket when the network is
 * unavailable (encrypted galleries decrypt cache-first).
 */
export function OfflineGalleryView({ slug }: { slug: string }) {
  const [state, setState] = useState<ViewState>("loading");
  const [meta, setMeta] = useState<SavedGalleryMeta | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const found = await getGalleryMeta(slug);
      if (cancelled) return;

      if (!found) {
        setState("not-saved");
        return;
      }

      setMeta(found);
      setState("ready");

      // Fire-and-forget: update the last-viewed timestamp.
      void touchViewed(slug, Date.now());
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state === "loading") {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-sm text-text-secondary">Loading saved gallery…</p>
      </div>
    );
  }

  if (state === "not-saved" || !meta) {
    return (
      <div className="flex min-h-[200px] items-center justify-center px-4 text-center">
        <p className="text-sm text-text-secondary">
          This gallery isn&#39;t saved for offline viewing. Reconnect to load it.
        </p>
      </div>
    );
  }

  const adaptedAssets: PublicAsset[] = meta.assets.map(adaptAsset);

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8">
      {/* Offline indicator chip */}
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-border-subtle bg-surface-container-low px-3 py-1 text-xs font-medium text-text-secondary">
          Offline · saved copy
        </span>
      </div>

      {/* Gallery title */}
      <h1 className="mb-6 text-2xl font-semibold text-text-primary">{meta.title}</h1>

      {/* Grid — tokens null because bytes come from Cache Storage */}
      <PublicGalleryGrid
        slug={slug}
        assets={adaptedAssets}
        gallerySessionToken={null}
        assetAccessToken={null}
        downloadEnabled={false}
        workspaceScope={meta.ws}
      />
    </div>
  );
}
