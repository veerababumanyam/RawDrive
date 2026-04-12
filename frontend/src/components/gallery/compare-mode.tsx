"use client";

/**
 * CompareMode — GAL-FR-092
 *
 * Side-by-side photo compare for the lightbox. Shows two images of the same
 * aspect ratio with a draggable vertical divider between them. Used by
 * photographers comparing near-duplicates (e.g., an Indian wedding session
 * producing 3 bracketed exposures per moment) to pick the sharpest frame.
 *
 * Inputs:
 *   - left / right assets (both must be loaded)
 *   - onExit callback to leave compare mode
 *
 * Design note: this uses a CSS `clip-path: inset()` with a percentage that
 * tracks the divider position rather than two side-by-side images. The
 * reason is that clipping lets us show each full image on top of the other,
 * so when the divider is at 0% or 100% we see one full image without any
 * layout shift. Dragging the divider is pure state — no DOM thrash.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Asset } from "@/lib/api/assets";
import { getStoredAccessToken } from "@/lib/auth";

interface Props {
  left: Asset;
  right: Asset;
  onExit: () => void;
}

function largeUrl(a: Asset, token: string | null): string {
  const raw =
    a.thumbnail_urls?.display_webp ||
    a.thumbnail_urls?.thumb_lg_webp ||
    a.thumbnail_urls?.thumb_lg ||
    a.thumbnail_urls?.lg ||
    a.thumbnail_urls?.cover_1920 ||
    a.download_url ||
    Object.values(a.thumbnail_urls || {})[0] ||
    "";
  if (!raw || !token || !raw.includes("/storage/") || raw.includes("token=")) return raw;
  const sep = raw.includes("?") ? "&" : "?";
  return `${raw}${sep}token=${encodeURIComponent(token)}`;
}

export function CompareMode({ left, right, onExit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dividerPct, setDividerPct] = useState(50);
  const dragging = useRef(false);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setDividerPct(pct);
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  const token = getStoredAccessToken();
  const leftUrl = largeUrl(left, token);
  const rightUrl = largeUrl(right, token);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black select-none"
    >
      {/* Left image (base layer) */}
      <img
        src={leftUrl}
        alt={left.filename}
        className="absolute inset-0 h-full w-full object-contain"
        draggable={false}
      />
      {/* Right image, clipped from the divider to the right edge */}
      <img
        src={rightUrl}
        alt={right.filename}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ clipPath: `inset(0 0 0 ${dividerPct}%)` }}
        draggable={false}
      />

      {/* Draggable divider — absolute line with a circular grab handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(dividerPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        className="absolute top-0 bottom-0 w-0.5 bg-white/80 cursor-ew-resize z-10"
        style={{ left: `${dividerPct}%` }}
        onPointerDown={() => {
          dragging.current = true;
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setDividerPct((p) => Math.max(0, p - 2));
          else if (e.key === "ArrowRight") setDividerPct((p) => Math.min(100, p + 2));
        }}
      >
        <div className="absolute top-1/2 left-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-black text-xs font-bold">
          ⇔
        </div>
      </div>

      {/* Filename tags */}
      <div className="absolute top-4 left-4 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1 text-xs text-white/90">
        {left.filename}
      </div>
      <div className="absolute top-4 right-4 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1 text-xs text-white/90">
        {right.filename}
      </div>

      {/* Exit button */}
      <button
        type="button"
        onClick={onExit}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 backdrop-blur-xl border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/20"
      >
        Exit compare
      </button>
    </div>
  );
}
