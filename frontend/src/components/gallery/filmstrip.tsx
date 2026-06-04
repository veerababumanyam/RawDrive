"use client";

/**
 * Filmstrip — GAL-FR-093
 *
 * Horizontal thumbnail strip for the lightbox. Renders a bounded window of
 * thumbnails around the active photo and auto-scrolls the active thumb into
 * view on navigation. The window re-centers as the user navigates, so a
 * 500+ photo gallery mounts (and decrypts) a constant number of thumbs instead
 * of every one (PERF-25 — AGENTS.md "window large filmstrips"). Global indexing
 * is preserved because onSelect emits the asset id, not a windowed offset.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Asset } from "@/lib/api/assets";
import { getStoredAccessToken } from "@/lib/auth";
import {
  FILMSTRIP_VARIANTS,
  LIGHTBOX_VARIANTS,
} from "@/lib/media-encryption/asset-media";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";

interface Props {
  assets: Asset[];
  activeId: string;
  onSelect: (id: string) => void;
}

function FilmstripThumb({
  asset,
  active,
  activeRef,
  onSelect,
}: {
  asset: Asset;
  active: boolean;
  activeRef: RefObject<HTMLButtonElement | null> | null;
  onSelect: (id: string) => void;
}) {
  const [useDisplayFallback, setUseDisplayFallback] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const variants = useDisplayFallback ? LIGHTBOX_VARIANTS : FILMSTRIP_VARIANTS;
  const media = useDecryptedAssetUrl(asset, variants, getStoredAccessToken());

  const handleImageError = () => {
    if (!useDisplayFallback) {
      setImageFailed(false);
      setUseDisplayFallback(true);
      return;
    }
    setImageFailed(true);
  };

  return (
    <button
      ref={active ? activeRef : null}
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={asset.filename}
      onClick={() => onSelect(asset.id)}
      className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
        active
          ? "border-text-media scale-105 shadow-lg"
          : "border-text-media/20 opacity-60 hover:opacity-100"
      }`}
    >
      {media.loading ? (
        <div className="h-full w-full animate-pulse bg-surface-overlay/5" />
      ) : media.src && !imageFailed ? (
        <img
          src={media.src}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          draggable={false}
          onError={handleImageError}
        />
      ) : (
        <div className="h-full w-full bg-surface-overlay/5" />
      )}
    </button>
  );
}

// Number of thumbs rendered on each side of the active photo. ±15 keeps the
// strip full with overscan for in-strip scrolling while bounding the mounted
// thumb (and decrypt) count to a constant regardless of gallery size.
const FILMSTRIP_WINDOW = 15;

export function Filmstrip({ assets, activeId, onSelect }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);

  // Render only a bounded window of thumbs around the active photo so large
  // galleries don't mount every thumbnail (PERF-25). Computed from props during
  // render (pure — no effect, React-Compiler safe). onSelect still emits the
  // asset id, so the consumer maps it back to the correct global index.
  const activeIndex = assets.findIndex((a) => a.id === activeId);
  const center = activeIndex < 0 ? 0 : activeIndex;
  const windowStart = Math.max(0, center - FILMSTRIP_WINDOW);
  const windowEnd = Math.min(assets.length, center + FILMSTRIP_WINDOW + 1);
  const windowed = assets.slice(windowStart, windowEnd);

  // Scroll the active thumb into view whenever it changes. `behavior: smooth`
  // matches Apple Photos' centering animation; `inline: center` keeps the
  // active photo near the horizontal midpoint.
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeId]);

  return (
    <div
      className="flex gap-2 overflow-x-auto scroll-smooth px-4 py-3"
      role="tablist"
      aria-label="Photo filmstrip"
    >
      {windowed.map((a) => {
        const active = a.id === activeId;
        return (
          <FilmstripThumb
            key={a.id}
            asset={a}
            active={active}
            activeRef={activeRef}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}
