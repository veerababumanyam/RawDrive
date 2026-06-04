"use client";

/**
 * GalleryViewSwitcher — the photo-view mode selector.
 *
 * Composed FROM GlassIconButton (per the liquid-glass system rules) as a single
 * keyboard radiogroup: roving tabindex + arrow/Home/End navigation, aria-checked
 * state, ≥44px targets, token focus ring. Token-pure (no hardcoded values) and
 * theme-aware across liquid-glass / liquid-glass-dark / midnight.
 *
 * Persistence: `useGalleryViewMode(galleryId)` remembers the per-gallery choice in
 * localStorage via useSyncExternalStore (React-Compiler-safe — no impure read at render).
 */

import { useCallback, useRef, useSyncExternalStore } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Grid, Masonry, Carousel, Justified, Stack, type LucideIcon } from "@/components/icons";

export type GalleryViewMode = "grid" | "masonry" | "carousel" | "justified" | "stack";

export const GALLERY_VIEW_MODES: ReadonlyArray<{
  id: GalleryViewMode;
  label: string;
  Icon: LucideIcon;
}> = [
  { id: "grid", label: "Grid view", Icon: Grid },
  { id: "masonry", label: "Masonry view", Icon: Masonry },
  { id: "carousel", label: "Carousel view", Icon: Carousel },
  { id: "justified", label: "Justified view", Icon: Justified },
  { id: "stack", label: "Stack view", Icon: Stack },
];

const MODE_IDS = GALLERY_VIEW_MODES.map((m) => m.id);
const DEFAULT_MODE: GalleryViewMode = "grid";

function isMode(v: unknown): v is GalleryViewMode {
  return typeof v === "string" && (MODE_IDS as string[]).includes(v);
}

interface GalleryViewSwitcherProps {
  value: GalleryViewMode;
  onChange: (mode: GalleryViewMode) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function GalleryViewSwitcher({
  value,
  onChange,
  size = "md",
  className,
}: GalleryViewSwitcherProps) {
  const groupRef = useRef<HTMLDivElement>(null);

  const focusIndex = useCallback((idx: number) => {
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.[idx]?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      let next = index;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          next = (index + 1) % GALLERY_VIEW_MODES.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          next = (index - 1 + GALLERY_VIEW_MODES.length) % GALLERY_VIEW_MODES.length;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = GALLERY_VIEW_MODES.length - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      onChange(GALLERY_VIEW_MODES[next].id);
      focusIndex(next);
    },
    [onChange, focusIndex],
  );

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Gallery view mode"
      className={`glass-surface inline-flex items-center gap-1 rounded-full p-1${
        className ? ` ${className}` : ""
      }`}
    >
      {GALLERY_VIEW_MODES.map(({ id, label, Icon }, index) => {
        const active = value === id;
        return (
          <GlassIconButton
            key={id}
            label={label}
            size={size}
            variant={active ? "accent" : "glass"}
            active={active}
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(id)}
            onKeyDown={(e: React.KeyboardEvent) => handleKeyDown(e, index)}
          >
            <Icon aria-hidden="true" />
          </GlassIconButton>
        );
      })}
    </div>
  );
}

// ── Per-gallery persistence (React-Compiler-safe) ──────────────────────────
const STORAGE_PREFIX = "rawdrive:gallery-view:";
const CHANGE_EVENT = "rawdrive:gallery-view-change";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function useGalleryViewMode(
  galleryId: string,
): [GalleryViewMode, (mode: GalleryViewMode) => void] {
  const key = `${STORAGE_PREFIX}${galleryId}`;

  const getSnapshot = useCallback((): GalleryViewMode => {
    if (typeof window === "undefined") return DEFAULT_MODE;
    const stored = window.localStorage.getItem(key);
    return isMode(stored) ? stored : DEFAULT_MODE;
  }, [key]);

  const mode = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_MODE);

  const setMode = useCallback(
    (next: GalleryViewMode) => {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(key, next);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [key],
  );

  return [mode, setMode];
}
