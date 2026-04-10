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

import { useEffect, useRef } from "react";
import type { Asset } from "@/lib/api/assets";

interface Props {
  assets: Asset[];
  activeId: string;
  onSelect: (id: string) => void;
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
        const thumbUrl =
          a.thumbnail_urls?.thumb_sm_webp ||
          a.thumbnail_urls?.thumb_sm ||
          a.thumbnail_urls?.sm ||
          a.thumbnail_urls?.thumb_md ||
          "";
        return (
          <button
            key={a.id}
            ref={active ? activeRef : null}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={a.filename}
            onClick={() => onSelect(a.id)}
            className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
              active
                ? "border-white scale-105 shadow-lg"
                : "border-white/20 opacity-60 hover:opacity-100"
            }`}
          >
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="h-full w-full bg-white/5" />
            )}
          </button>
        );
      })}
    </div>
  );
}
