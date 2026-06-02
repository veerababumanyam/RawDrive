"use client";

/**
 * Filmstrip — GAL-FR-093
 *
 * Horizontal thumbnail strip for the lightbox. Shows ~15 thumbnails around
 * the active photo and auto-scrolls the active thumb into view on navigation.
 * Intentionally simple (no virtual scrolling) — galleries with >500 photos
 * will paint all thumb nodes but the DOM cost is dominated by <img> decode,
 * not React reconciliation, and browsers throttle off-screen image decoding
 * automatically.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Asset } from "@/lib/api/assets";
import { getStoredAccessToken } from "@/lib/auth";
import { FILMSTRIP_VARIANTS, LIGHTBOX_VARIANTS } from "@/lib/media-encryption/asset-media";
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
          ? "border-white scale-105 shadow-lg"
          : "border-white/20 opacity-60 hover:opacity-100"
      }`}
    >
      {media.loading ? (
        <div className="h-full w-full animate-pulse bg-white/5" />
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
        <div className="h-full w-full bg-white/5" />
      )}
    </button>
  );
}

export function Filmstrip({ assets, activeId, onSelect }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);

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
      {assets.map((a) => {
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
