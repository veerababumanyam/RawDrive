"use client";

/**
 * PublicGalleryGrid — client-side masonry grid for the public gallery page.
 *
 * Replaces the server-rendered grid markup so that two interactive features
 * from the M13 deferred FR closure can actually change what the viewer sees:
 *
 *   - GAL-FR-099: Map view toggle (grid ↔ map) — MapView is mounted here
 *   - GAL-FR-107/108/109: FaceID result filter — listens for
 *     `rawdrive:face-filter` window events dispatched by FaceIDGate and
 *     reduces the rendered asset set to the matched IDs. When the user
 *     clicks "Browse all" in the fallback chip, a `rawdrive:face-filter-clear`
 *     event restores the full set.
 *
 * The grid intentionally keeps the CSS-columns masonry layout from the
 * server version so visual output is identical when no filter is active.
 * Server → client conversion is the minimum necessary to make the filter
 * real; nothing else about the gallery shell changes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicAsset } from "@/lib/api/galleries";
import { MapView } from "./map-view";
import type { Asset } from "@/lib/api/assets";
import type { PublicDesignConfig } from "@/lib/gallery-design-config";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { ChevronLeft, ChevronRight, XMark, ZoomIn, ZoomOut, CheckCircle, Download, Expand, Compress, Star, Share } from "@/components/icons";
import {
  addPublicFavorite,
  listPublicFavoriteAssetIds,
  removePublicFavorite,
} from "@/lib/api/favorites";

// API base mirrors what dashboard-ui.ts and lib/api/galleries.ts use. The
// public asset download endpoint lives on the Go API (port 8081 in dev)
// while the Next site serves /g/<slug> from a different origin (3000/3001),
// so we always need an absolute URL for the download <a href>.
const PUBLIC_API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Stable per-browser guest session id. One UUID per browser, shared across
// every gallery this browser visits. Used as the partition key for the
// gallery_favorites table so the photographer's "favorited by N guests"
// count is meaningful: clicking through to two share links from the same
// device counts as one session, the same client on phone + laptop counts
// as two.
const GUEST_SESSION_STORAGE_KEY = "rawdrive-guest-session-id";

function getOrCreateGuestSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(GUEST_SESSION_STORAGE_KEY);
    if (existing) return existing;
    // crypto.randomUUID is in Safari 15.4+, Chrome 92+, Firefox 95+.
    // The Math.random fallback is for the (rare) older browser case and
    // for jsdom test environments where crypto.randomUUID is undefined.
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `g-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    window.localStorage.setItem(GUEST_SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    // Private mode / quota — return a per-tab ephemeral id. Favorites
    // persist server-side but the session resets on page reload.
    return `eph-${Math.random().toString(36).slice(2)}`;
  }
}

// Server-backed favorites with a localStorage fallback. Behavior:
//
//   1. Mount: generate/load the guest session id, then call the server
//      to hydrate the favorites Set. If the server is reachable, that
//      result wins (truth lives on the server). If the fetch fails, we
//      fall back to localStorage so the Star buttons still render in the
//      correct state offline / behind a firewall.
//   2. Toggle: optimistic — Set updates immediately. POST or DELETE
//      fires in the background. On 2xx, also write localStorage so a
//      subsequent offline load still paints the right state. On error,
//      we don't roll back the optimistic toggle (the user's intent
//      shouldn't snap back); the next mount will re-sync from server.
//
// localStorage key is gallery-scoped so a guest visiting two galleries
// on one device sees the right favorites per gallery.
function useGalleryFavorites(slug: string) {
  const storageKey = `rawdrive-favorites-${slug}`;
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const sessionId = getOrCreateGuestSessionId();
    if (!sessionId) return;

    // Optimistic local read so the UI shows *something* immediately
    // while the server fetch is in flight.
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe hydration of external store from localStorage.
          setFavorites(
            new Set(parsed.filter((v): v is string => typeof v === "string")),
          );
        }
      }
    } catch {
      // Corrupt localStorage — skip the local seed; the server fetch
      // below will populate fresh.
    }

    // Authoritative read from the server. Replaces local seed when
    // it lands. Failures are silent — localStorage state stays as-is.
    void listPublicFavoriteAssetIds(slug, sessionId)
      .then((ids) => {
        if (cancelled) return;
        const next = new Set(ids);
        setFavorites(next);
        try {
          window.localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch { /* quota — no-op */ }
      })
      .catch(() => {
        // Server unreachable / gallery unpublished — fall through with
        // whatever localStorage gave us.
      });

    return () => { cancelled = true; };
  }, [slug, storageKey]);

  const toggle = useCallback(
    (assetId: string) => {
      const sessionId = getOrCreateGuestSessionId();
      // Read the current state at the call site rather than smuggling
      // it out of a setFavorites callback via a mutable closure var.
      // The setFavorites updater may be invoked asynchronously (or
      // double-invoked under React strict mode) which made the
      // previous closure-mutation pattern unreliable in tests.
      const wasFavorited = favorites.has(assetId);
      const nextFavorites = new Set(favorites);
      if (wasFavorited) {
        nextFavorites.delete(assetId);
      } else {
        nextFavorites.add(assetId);
      }
      setFavorites(nextFavorites);

      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            storageKey,
            JSON.stringify([...nextFavorites]),
          );
        } catch { /* quota — no-op */ }
      }

      if (!sessionId) return;

      // Fire-and-forget server sync. Optimistic UI already updated.
      // Failure is silent so a brief network blip doesn't snap the
      // Star back to its previous state — next mount re-syncs.
      const op = wasFavorited
        ? removePublicFavorite(slug, assetId, sessionId)
        : addPublicFavorite(slug, assetId, sessionId);
      void op.catch(() => { /* sync failed; local state retained */ });
    },
    [favorites, slug, storageKey],
  );

  return { favorites, toggle };
}

// Build the canonical share URL for a single asset. Mirrors what the
// preview-chrome Share button produces for the whole gallery; here the
// URL carries the `?asset=<id>` deep-link param so the recipient's
// browser auto-opens the lightbox to the same photo (handled by the
// useEffect below). Falls back to a relative path on SSR where
// window.location.origin is undefined.
function buildAssetShareUrl(slug: string, assetId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/g/${slug}?asset=${assetId}`;
}

interface Props {
  slug: string;
  assets: PublicAsset[];
  galleryType?: string;
  maxSelections?: number;
  downloadEnabled?: boolean;
  // Optional design config from the Gallery Design Studio. Drives the
  // grid layout (masonry vs uniform grid vs justified vs carousel), the
  // column count, the gap between thumbnails, and whether to show the
  // asset filename beneath each photo. When absent the grid falls back
  // to the hard-coded `columns-1 sm:columns-2 lg:columns-3 gap-4` masonry
  // that shipped before the design studio was wired through to the
  // public viewer.
  design?: PublicDesignConfig | null;
}

// Bound the studio's columns value into the responsive scale the public
// grid actually supports. The studio allows 1–6 columns. On the public
// viewer we cap at 6 (CSS columns supports it natively) and floor at 1.
function clampColumns(n: number | undefined): number {
  if (!n || !Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(6, Math.floor(n)));
}

// Bound the studio's gap value to a reasonable px range. The studio
// emits gap as a literal pixel number; we render with inline style so
// any value the studio writes survives the round-trip.
function clampGap(n: number | undefined): number {
  if (!n || !Number.isFinite(n)) return 16;
  return Math.max(0, Math.min(64, Math.floor(n)));
}

type GridConfig = NonNullable<PublicDesignConfig["grid"]>;

function designGridContainerClass(grid: GridConfig | undefined): string {
  if (!grid || !grid.layout) {
    return "columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4";
  }
  if (grid.layout === "carousel") {
    return "flex overflow-x-auto snap-x snap-mandatory pb-2";
  }
  if (grid.layout === "grid") {
    return "grid";
  }
  // masonry & justified → CSS columns
  return "";
}

function designGridContainerStyle(grid: GridConfig | undefined): React.CSSProperties | undefined {
  if (!grid || !grid.layout) return undefined;
  const columns = clampColumns(grid.columns);
  const gap = clampGap(grid.gap);
  if (grid.layout === "carousel") {
    return { gap: `${gap}px` };
  }
  if (grid.layout === "grid") {
    return {
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: `${gap}px`,
    };
  }
  return {
    columnCount: columns,
    columnGap: `${gap}px`,
  };
}

function designGridItemClass(grid: GridConfig | undefined): string {
  if (!grid || !grid.layout) {
    return "break-inside-avoid rounded-xl overflow-hidden bg-surface-sunken cursor-pointer transition-all hover:shadow-lg relative group";
  }
  if (grid.layout === "carousel") {
    return "shrink-0 w-72 sm:w-96 snap-start rounded-xl overflow-hidden bg-surface-sunken cursor-pointer transition-all hover:shadow-lg relative group";
  }
  if (grid.layout === "grid") {
    return "rounded-xl overflow-hidden bg-surface-sunken cursor-pointer transition-all hover:shadow-lg relative group aspect-[4/3]";
  }
  return "break-inside-avoid mb-[var(--design-row-gap,16px)] rounded-xl overflow-hidden bg-surface-sunken cursor-pointer transition-all hover:shadow-lg relative group";
}

function designGridItemStyle(grid: GridConfig | undefined): React.CSSProperties | undefined {
  if (!grid || !grid.layout) return undefined;
  // For CSS columns layouts, the vertical gap between items in the same
  // column is `margin-bottom` on each child (CSS columns ignores
  // row-gap). Pipe the studio's gap value through a CSS variable the
  // item class can pick up.
  if (grid.layout === "masonry" || grid.layout === "justified") {
    const gap = clampGap(grid.gap);
    return { ["--design-row-gap" as never]: `${gap}px`, marginBottom: `${gap}px` };
  }
  return undefined;
}

type ViewMode = "grid" | "map";

export function PublicGalleryGrid({ slug, assets, galleryType, maxSelections = 0, downloadEnabled = true, design = null }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [faceFilterIds, setFaceFilterIds] = useState<Set<string> | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);

  // Fullscreen mode for lightbox
  const lightboxRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const chromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Client-side favorite store + "share link copied" feedback. The
  // feedback flag is local to the lightbox toolbar — flips true for ~1.6s
  // after the share button's clipboard write succeeds, then resets.
  const { favorites, toggle: toggleFavorite } = useGalleryFavorites(slug);
  const [shareCopied, setShareCopied] = useState(false);

  const toggleFullscreen = useCallback(() => {
    if (!lightboxRef.current) return;
    if (!document.fullscreenElement) {
      lightboxRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Sync fullscreen state with browser
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Auto-hide toolbar/filmstrip after 3s idle in fullscreen
  const resetChromeTimer = useCallback(() => {
    setChromeVisible(true);
    if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
    if (isFullscreen) {
      chromeTimerRef.current = setTimeout(() => setChromeVisible(false), 3000);
    }
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) { setChromeVisible(true); return; }
    // Start the hide timer on entering fullscreen
    chromeTimerRef.current = setTimeout(() => setChromeVisible(false), 3000);
    return () => { if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current); };
  }, [isFullscreen]);

  // Exit fullscreen when lightbox closes
  useEffect(() => {
    if (lightboxIdx === null && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, [lightboxIdx]);

  // M19 F-009: Proofing selection state (BUG-GAL-014 fix)
  const isProofing = galleryType === "proofing";
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitName, setSubmitName] = useState("");
  const [submitEmail, setSubmitEmail] = useState("");
  const [submitNote, setSubmitNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const toggleSelection = useCallback((assetId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        if (maxSelections > 0 && next.size >= maxSelections) return prev;
        next.add(assetId);
      }
      return next;
    });
  }, [maxSelections]);

  const handleSubmitSelections = async () => {
    if (selectedIds.size === 0 || !submitEmail) return;
    setSubmitting(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      const res = await fetch(`${apiBase}/api/v1/public/galleries/${slug}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_ids: Array.from(selectedIds),
          client_name: submitName,
          client_email: submitEmail,
          note: submitNote,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setShowSubmit(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Listen for face filter events dispatched by FaceIDGate (via
  // PublicGalleryEnhancements). The event carries the matched asset IDs;
  // we store them in a Set so the filtering below is O(1) per asset.
  useEffect(() => {
    function onFilter(e: Event) {
      const detail = (e as CustomEvent<{ assetIds: string[] }>).detail;
      if (!detail || !Array.isArray(detail.assetIds)) return;
      setFaceFilterIds(new Set(detail.assetIds));
    }
    function onFilterClear() {
      setFaceFilterIds(null);
    }
    window.addEventListener("rawdrive:face-filter", onFilter as EventListener);
    window.addEventListener("rawdrive:face-filter-clear", onFilterClear);
    return () => {
      window.removeEventListener("rawdrive:face-filter", onFilter as EventListener);
      window.removeEventListener("rawdrive:face-filter-clear", onFilterClear);
    };
  }, []);

  const visibleAssets = useMemo(() => {
    if (!faceFilterIds) return assets;
    return assets.filter((a) => faceFilterIds.has(a.id));
  }, [assets, faceFilterIds]);

  // Deep-link auto-open. Pairs with the Share button's clipboard URL
  // (?asset=<id>). When a recipient lands on the share link, find the
  // matching asset in the rendered set and open the lightbox there so
  // the link actually feels like sharing the photo, not just the
  // gallery. Runs once after assets are populated; tolerates a stale id
  // (asset filtered out by face-filter etc.) by silently doing nothing.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (lightboxIdx !== null) return;
    const params = new URLSearchParams(window.location.search);
    const requestedAsset = params.get("asset");
    if (!requestedAsset) return;
    const idx = visibleAssets.findIndex((a) => a.id === requestedAsset);
    if (idx >= 0) {
      setLightboxIdx(idx);
      setZoom(1);
    }
    // intentionally one-shot: we only auto-open on first navigation. If
    // the user closes the lightbox we don't keep re-opening it on
    // re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleAssets]);

  // Helper to change photo and reset zoom in one update
  const goToPhoto = (idx: number | null) => {
    setLightboxIdx(idx);
    setZoom(1);
  };

  // Keyboard handling for the lightbox
  useEffect(() => {
    if (lightboxIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case "Escape": setLightboxIdx(null); break;
        case "ArrowLeft": setLightboxIdx((i) => i !== null && i > 0 ? i - 1 : i); break;
        case "ArrowRight": setLightboxIdx((i) => i !== null && i < visibleAssets.length - 1 ? i + 1 : i); break;
        case "+": case "=": setZoom((z) => Math.min(z + 0.25, 3)); break;
        case "-": setZoom((z) => Math.max(z - 0.25, 0.5)); break;
        case "0": setZoom(1); break;
        case "f": case "F": toggleFullscreen(); break;
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [lightboxIdx, visibleAssets.length, toggleFullscreen]);

  // Adapt PublicAsset → Asset shape for the MapView component. PublicAsset
  // doesn't carry EXIF GPS, so the map filters based on assets with
  // populated `gps_latitude`/`gps_longitude` — when nothing matches the map
  // shows its empty state, which is the correct fallback.
  const mapAssets: Asset[] = useMemo(
    () =>
      visibleAssets.map((a) => ({
        id: a.id,
        workspace_id: "",
        filename: a.filename,
        content_type: a.content_type,
        size_bytes: 0,
        storage_key: "",
        width: a.width,
        height: a.height,
        blurhash: a.blurhash,
        exif_data: {},
        thumbnail_urls: a.thumbnail_urls,
        status: "ready",
        created_at: "",
      })),
    [visibleAssets],
  );

  if (visibleAssets.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-text-secondary">
          {faceFilterIds ? "No matching photos." : "This gallery is empty."}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* View toggle — only surfaces when the gallery has more than one
          photo; solo-photo galleries don't benefit from a map. */}
      {assets.length > 1 && (
        <div className="mb-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            aria-pressed={viewMode === "grid"}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === "grid"
                ? "bg-accent-primary text-accent-primary-contrast"
                : "border border-border-subtle text-text-secondary hover:text-text-primary"
            }`}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setViewMode("map")}
            aria-pressed={viewMode === "map"}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === "map"
                ? "bg-accent-primary text-accent-primary-contrast"
                : "border border-border-subtle text-text-secondary hover:text-text-primary"
            }`}
          >
            Map
          </button>
        </div>
      )}

      {viewMode === "map" ? (
        <div className="h-[600px]" aria-label={`Map view for gallery ${slug}`}>
          <MapView
            assets={mapAssets}
            onSelect={(assetId) => {
              // Map selection — switch to grid view then scroll the target
              // asset into view. React batches state updates, so we must
              // defer the DOM lookup until after the grid commits. Double
              // rAF: first tick lands after React commit, second after
              // browser paint when the grid DOM is actually mounted.
              setViewMode("grid");
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  const el = document.getElementById(`asset-${assetId}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                });
              });
            }}
          />
        </div>
      ) : (
        <div
          // Container layout driven by the design config when present.
          // - masonry / justified: CSS columns flow — the studio's "justified"
          //   row-mode lands here as a close-enough vertical-flow approximation
          //   (real justified row layout would need an aspect-ratio packer;
          //   keeping it CSS-only avoids the JS measurement cost on the
          //   public viewer hot path).
          // - grid: CSS grid with uniform-aspect tiles.
          // - carousel: horizontal scroll filmstrip.
          // Falls back to the original masonry styling when no design is
          // present so existing shared links don't visually shift.
          className={designGridContainerClass(design?.grid)}
          style={designGridContainerStyle(design?.grid)}
          aria-label={`Grid view for gallery ${slug}`}
        >
          {visibleAssets.map((asset) => {
            // Prefer the mandatory WebP derivatives for public display,
            // but keep legacy JPEG keys as fallbacks for older rows.
            const thumbUrl = getStorageBackedUrl(
              asset.thumbnail_urls?.thumb_md_webp ||
              asset.thumbnail_urls?.thumb_lg_webp ||
              asset.thumbnail_urls?.thumb_sm_webp ||
              asset.thumbnail_urls?.display_webp ||
              asset.thumbnail_urls?.thumb_lg ||
              asset.thumbnail_urls?.thumb_md ||
              asset.thumbnail_urls?.thumb_sm ||
              asset.thumbnail_urls?.lg ||
              asset.thumbnail_urls?.md ||
              asset.thumbnail_urls?.sm,
            );
            return (
              <div
                key={asset.id}
                id={`asset-${asset.id}`}
                className={`${designGridItemClass(design?.grid)} ${
                  isProofing && selectedIds.has(asset.id)
                    ? "ring-3 ring-accent-primary shadow-lg"
                    : ""
                }`}
                style={designGridItemStyle(design?.grid)}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (isProofing) {
                    toggleSelection(asset.id);
                  } else {
                    const idx = visibleAssets.findIndex((a) => a.id === asset.id);
                    if (idx >= 0) goToPhoto(idx);
                  }
                }}
                onDoubleClick={() => {
                  // In proofing mode, double-click still opens lightbox
                  if (isProofing) {
                    const idx = visibleAssets.findIndex((a) => a.id === asset.id);
                    if (idx >= 0) goToPhoto(idx);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (isProofing) {
                      toggleSelection(asset.id);
                    } else {
                      const idx = visibleAssets.findIndex((a) => a.id === asset.id);
                      if (idx >= 0) goToPhoto(idx);
                    }
                  }
                }}
              >
                {/* M19: Selection checkmark overlay */}
                {isProofing && selectedIds.has(asset.id) && (
                  <div className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-accent-primary flex items-center justify-center shadow-md">
                    <CheckCircle className="w-5 h-5 text-accent-primary-contrast" />
                  </div>
                )}
                {/* Per-tile actions — Favorite + Download.
                    2026-05-18 visibility revision: favorite button is
                    now ALWAYS visible in both states (was previously
                    hover-reveal when unfavorited), with high-contrast
                    fills so it reads against bright wedding photos:
                      - Unfavorited: dark scrim backdrop + white outline
                        star + ring-white halo. Universal "tap to like"
                        affordance.
                      - Favorited: amber bg-feedback-warning fill +
                        white filled star. Instantly recognizable.
                    Previously the button used GlassIconButton's `glass`
                    variant (bg-white/[0.12]) which disappeared on
                    light/busy photos.
                    Download keeps the legacy hover-reveal pattern —
                    less critical to the public-viewer experience and
                    over-chroming the tiles hurts gallery aesthetics.
                    Proofing mode hides both — proofing uses tile-click
                    for selection and the action chrome would clash. */}
                {!isProofing && (
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={favorites.has(asset.id) ? "Remove from favorites" : "Add to favorites"}
                      aria-pressed={favorites.has(asset.id)}
                      title={favorites.has(asset.id) ? "Remove from favorites" : "Add to favorites"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(asset.id);
                      }}
                      className={
                        favorites.has(asset.id)
                          ? "inline-flex h-9 w-9 items-center justify-center rounded-full bg-feedback-warning text-white shadow-elevation-1 ring-2 ring-surface-raised/60 transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-feedback-warning/60"
                          : "inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white shadow-elevation-1 ring-2 ring-white/30 backdrop-blur-md transition-all hover:bg-black/70 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-white/50"
                      }
                    >
                      {/* fill-current makes the star "lit up" when
                          favorited — matches the universal "active
                          star" affordance. Unfavorited keeps it as
                          an outline (no fill). */}
                      <Star className={favorites.has(asset.id) ? "h-4 w-4 fill-current" : "h-4 w-4"} />
                    </button>
                    {downloadEnabled && (
                      <div className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <GlassIconButton
                          size="sm"
                          label="Download"
                          onClick={(e) => {
                            e.stopPropagation();
                            const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
                            window.open(`${apiBase}/api/v1/public/galleries/${slug}/assets/${asset.id}/download`, "_blank");
                          }}
                        >
                          <Download />
                        </GlassIconButton>
                      </div>
                    )}
                  </div>
                )}
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={asset.filename}
                    width={asset.width || undefined}
                    height={asset.height || undefined}
                    loading="lazy"
                    decoding="async"
                    className={
                      design?.grid?.layout === "grid"
                        ? "absolute inset-0 h-full w-full object-cover"
                        : "w-full h-auto object-cover"
                    }
                  />
                ) : (
                  <div
                    className="w-full aspect-[4/3] bg-surface-sunken flex items-center justify-center"
                    role="img"
                    aria-label={asset.filename}
                  >
                    <span className="text-xs text-text-tertiary">Processing...</span>
                  </div>
                )}
                {/* Studio-opt-in filename caption. Renders only when the
                    design config explicitly sets showInfo=true so existing
                    galleries that never enabled this don't suddenly show
                    "_DSC0042.NEF" plastered under every tile. */}
                {design?.grid?.showInfo && asset.filename && (
                  <p className="px-2 py-1 text-[11px] text-text-tertiary truncate">
                    {asset.filename}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* End-of-gallery indicator */}
      <div className="mt-12 text-center pb-8">
        <div className="inline-block h-px w-16 bg-border-subtle" />
        <p className="mt-3 text-xs text-text-tertiary">
          {visibleAssets.length} {visibleAssets.length === 1 ? "photo" : "photos"}
        </p>
      </div>

      {/* M19 F-009: Proofing selection floating bar */}
      {isProofing && selectedIds.size > 0 && !submitted && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-surface-elevated/95 backdrop-blur-xl border-t border-border-subtle px-4 py-3 shadow-lg">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">
              {selectedIds.size} {selectedIds.size === 1 ? "photo" : "photos"} selected
              {maxSelections > 0 && (
                <span className="text-text-tertiary"> of {maxSelections}</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 text-xs rounded-lg border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setShowSubmit(true)}
                className="px-4 py-1.5 text-sm font-medium rounded-lg bg-accent-primary text-accent-primary-contrast hover:opacity-90 transition-opacity"
              >
                Submit Selections
              </button>
            </div>
          </div>
        </div>
      )}

      {/* M19: Submission success message */}
      {submitted && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-green-600/95 backdrop-blur-xl px-4 py-3 shadow-lg">
          <div className="max-w-6xl mx-auto text-center">
            <p className="text-sm font-medium text-white">
              Your selections have been submitted! The photographer will review them shortly.
            </p>
          </div>
        </div>
      )}

      {/* M19: Submit selections dialog */}
      {showSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSubmit(false)}>
          <div className="bg-surface-elevated rounded-2xl shadow-xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-text-primary mb-1">Submit Your Selections</h3>
            <p className="text-sm text-text-secondary mb-4">
              {selectedIds.size} {selectedIds.size === 1 ? "photo" : "photos"} selected
            </p>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Your name"
                value={submitName}
                onChange={(e) => setSubmitName(e.target.value)}
                className="input-base w-full"
              />
              <input
                type="email"
                placeholder="Your email *"
                value={submitEmail}
                onChange={(e) => setSubmitEmail(e.target.value)}
                className="input-base w-full"
                required
              />
              <textarea
                placeholder="Message to photographer (optional)"
                value={submitNote}
                onChange={(e) => setSubmitNote(e.target.value)}
                rows={3}
                className="input-base w-full resize-none"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowSubmit(false)}
                className="flex-1 px-4 py-2 text-sm rounded-lg border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitSelections}
                disabled={!submitEmail || submitting}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-accent-primary text-accent-primary-contrast hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client-facing lightbox */}
      {lightboxIdx !== null && visibleAssets[lightboxIdx] && (() => {
        const photo = visibleAssets[lightboxIdx];
        // Public lightbox renders the image via plain <img src> — public
        // share-link visitors have no JWT, so the URL MUST resolve to a
        // path the storage layer serves without auth.
        //
        // Migration 104 (M41) split storage into two prefixes:
        //   /storage/thumbnails/<id>/thumb_*_webp.webp  — PUBLIC
        //   /storage/derivatives/<id>/display_webp.webp — AUTH-REQUIRED
        //
        // The previous order (display_webp first) 401'd the image for
        // every unauthenticated viewer — the lightbox opened on a black
        // background with just the alt-text filename visible. Prefer the
        // largest public thumb variant (thumb_lg_webp, ~1200px) which is
        // still high enough resolution for a desktop lightbox. Keep
        // display_webp in the fallback chain for assets that haven't
        // been reprocessed under the new path (legacy/transient state).
        const fullUrl = getStorageBackedUrl(
          photo.thumbnail_urls?.thumb_lg_webp ||
          photo.thumbnail_urls?.thumb_md_webp ||
          photo.thumbnail_urls?.thumb_lg ||
          photo.thumbnail_urls?.lg ||
          photo.thumbnail_urls?.display_webp ||
          Object.values(photo.thumbnail_urls || {})[0] ||
          "",
        );
        return (
          <div
            ref={lightboxRef}
            className="fixed inset-0 z-50 bg-black/95"
            onClick={(e) => { if (e.target === e.currentTarget) setLightboxIdx(null); }}
            onMouseMove={resetChromeTimer}
            role="dialog"
            aria-modal="true"
            aria-label={`Photo: ${photo.filename}`}
          >
            {/* Toolbar — auto-hides in fullscreen after 3s idle */}
            <div className={`absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 py-3 transition-opacity duration-300 ${
              chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}>
              <span className="text-sm text-white font-medium truncate max-w-[300px]">
                {photo.filename}
                {zoom !== 1 && <span className="ml-2 text-white/40 text-xs">{Math.round(zoom * 100)}%</span>}
              </span>
              <div className="flex items-center gap-1.5">
                <GlassIconButton size="sm" label="Zoom out" onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}><ZoomOut /></GlassIconButton>
                <GlassIconButton size="sm" label="Zoom in" onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}><ZoomIn /></GlassIconButton>
                <div className="w-px h-6 bg-white/10 mx-1" />
                {/* Client actions — favorite (localStorage), download
                    (public asset endpoint), share (copy deep-link). Kept
                    together as one cluster so the lightbox toolbar reads
                    as: [view controls] | [actions] | [window controls]. */}
                <GlassIconButton
                  size="sm"
                  variant={favorites.has(photo.id) ? "accent" : "glass"}
                  active={favorites.has(photo.id)}
                  label={favorites.has(photo.id) ? "Remove from favorites" : "Add to favorites"}
                  onClick={() => toggleFavorite(photo.id)}
                >
                  <Star />
                </GlassIconButton>
                {downloadEnabled && (
                  <GlassIconButton
                    size="sm"
                    label="Download original"
                    onClick={() => {
                      // The public download endpoint sets
                      // Content-Disposition: attachment, so navigating
                      // to it triggers a download instead of replacing
                      // the page. window.open with _self keeps the
                      // lightbox state intact across the brief redirect.
                      const url = `${PUBLIC_API_BASE}/api/v1/public/galleries/${slug}/assets/${photo.id}/download`;
                      window.open(url, "_self");
                    }}
                  >
                    <Download />
                  </GlassIconButton>
                )}
                <GlassIconButton
                  size="sm"
                  variant={shareCopied ? "success" : "glass"}
                  label={shareCopied ? "Share link copied" : "Copy share link"}
                  onClick={async () => {
                    const url = buildAssetShareUrl(slug, photo.id);
                    try {
                      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(url);
                      } else if (typeof document !== "undefined") {
                        // execCommand fallback for older Safari and
                        // non-HTTPS local-dev contexts (clipboard API
                        // is gated on secure-origin in some browsers).
                        const ta = document.createElement("textarea");
                        ta.value = url;
                        ta.setAttribute("readonly", "");
                        ta.style.position = "fixed";
                        ta.style.opacity = "0";
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand("copy");
                        document.body.removeChild(ta);
                      }
                      setShareCopied(true);
                      window.setTimeout(() => setShareCopied(false), 1600);
                    } catch {
                      // Silent: the chrome already shows a Share state.
                      // If clipboard write fails the user can long-press
                      // the URL bar after the lightbox closes.
                    }
                  }}
                >
                  <Share />
                </GlassIconButton>
                <div className="w-px h-6 bg-white/10 mx-1" />
                <GlassIconButton size="sm" label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFullscreen}>
                  {isFullscreen ? <Compress /> : <Expand />}
                </GlassIconButton>
                <GlassIconButton size="sm" variant="ghost" label="Close" onClick={() => setLightboxIdx(null)}><XMark /></GlassIconButton>
              </div>
            </div>

            {/* Image */}
            <div
              className="absolute inset-0 flex items-center justify-center overflow-auto"
              onClick={(e) => { if (e.target === e.currentTarget) setLightboxIdx(null); }}
            >
              {lightboxIdx > 0 && (
                <GlassIconButton
                  size="lg"
                  label="Previous"
                  className="absolute left-4 z-10"
                  onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => i !== null && i > 0 ? i - 1 : i); }}
                >
                  <ChevronLeft />
                </GlassIconButton>
              )}

              {fullUrl ? (
                <img
                  src={fullUrl}
                  alt={photo.filename}
                  className="h-full w-full object-contain transition-transform duration-200"
                  style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
                  draggable={false}
                />
              ) : (
                <p className="text-white/40 text-sm">Image unavailable</p>
              )}

              {lightboxIdx < visibleAssets.length - 1 && (
                <GlassIconButton
                  size="lg"
                  label="Next"
                  className="absolute right-4 z-10"
                  onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => i !== null && i < visibleAssets.length - 1 ? i + 1 : i); }}
                >
                  <ChevronRight />
                </GlassIconButton>
              )}
            </div>

            {/* Filmstrip — scrollable thumbnail strip for quick navigation, auto-hides in fullscreen */}
            {visibleAssets.length > 1 && (
              <div className={`absolute bottom-8 left-0 right-0 z-20 flex gap-1.5 overflow-x-auto scroll-smooth px-4 py-2 transition-opacity duration-300 ${
                chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"
              }`} role="tablist" aria-label="Photo filmstrip">
                {visibleAssets.map((a, i) => {
                  const thumb = getStorageBackedUrl(
                    a.thumbnail_urls?.thumb_sm_webp ||
                    a.thumbnail_urls?.thumb_md_webp ||
                    a.thumbnail_urls?.thumb_sm ||
                    a.thumbnail_urls?.sm ||
                    a.thumbnail_urls?.thumb_md ||
                    Object.values(a.thumbnail_urls || {})[0] ||
                    "",
                  );
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="tab"
                      aria-selected={i === lightboxIdx}
                      onClick={(e) => { e.stopPropagation(); goToPhoto(i); }}
                      className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                        i === lightboxIdx ? "border-white scale-105 shadow-lg" : "border-white/20 opacity-50 hover:opacity-100"
                      }`}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        <div className="h-full w-full bg-white/5" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Bottom hints */}
            <div className={`absolute bottom-0 left-0 right-0 z-20 px-4 pb-4 transition-opacity duration-300 ${
              chromeVisible ? "opacity-100" : "opacity-0"
            }`}>
              <div className="flex items-center justify-center gap-3 text-[10px] text-white/20 tracking-wide">
                <span>← → Navigate</span>
                <span>+/- Zoom</span>
                <span>F Fullscreen</span>
                <span>Esc Close</span>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
