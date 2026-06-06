"use client";
import { getApiBaseUrl } from "@/lib/api/base-url";

/**
 * PublicGalleryGrid — client-side masonry grid for the public gallery page.
 *
 * Replaces the server-rendered grid markup so that an interactive feature
 * from the M13 deferred FR closure can actually change what the viewer sees:
 *
 *   - GAL-FR-107/108/109: FaceID result filter — listens for
 *     `rawdrive:face-filter` window events dispatched by FaceIDGate and
 *     reduces the rendered asset set to the matched IDs. When the user
 *     clicks "Browse all" in the fallback chip, a `rawdrive:face-filter-clear`
 *     event restores the full set.
 *
 * 2026-05-19: the GAL-FR-099 Grid/Map view toggle was removed from this
 * surface because the Map view was distracting for the typical guest
 * (wedding clients viewing curated highlights, not exploring by location).
 * The MapView component still exists in the codebase and could be
 * remounted in a follow-up if studios ask for the affordance back.
 *
 * The grid intentionally keeps the CSS-columns masonry layout from the
 * server version so visual output is identical when no filter is active.
 * Server → client conversion is the minimum necessary to make the filter
 * real; nothing else about the gallery shell changes.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import type { PublicAsset } from "@/lib/api/galleries";
import type { PublicDesignConfig } from "@/lib/gallery-design-config";
import {
  FILMSTRIP_VARIANTS,
  GRID_VARIANTS,
  LIGHTBOX_VARIANTS,
  assetUsesClientMediaEncryption,
  originalManifest,
  variantManifest,
} from "@/lib/media-encryption/asset-media";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";
import {
  buildAssetSrcSet,
  GRID_SIZES,
} from "@/lib/media-encryption/asset-srcset";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { decryptBlobWithAvailableMediaKeys } from "@/lib/media-encryption/media-key-store";
import { publicMediaErrorMessage } from "@/lib/media-encryption/public-media-error";
import {
  appendCurrentGalleryKeyFragment,
  setUrlSearchParamBeforeFragment,
} from "@/lib/media-encryption/share-url";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import {
  ChevronLeft,
  ChevronRight,
  XMark,
  ZoomIn,
  ZoomOut,
  CheckCircle,
  Download,
  Expand,
  Compress,
  Star,
  Share,
  EllipsisVertical,
} from "@/components/icons";
import {
  addPublicFavorite,
  listPublicFavoriteAssetIds,
  removePublicFavorite,
} from "@/lib/api/favorites";
import { submitPublicProofing } from "@/lib/api/proofing";

// API base mirrors what dashboard-ui.ts and lib/api/galleries.ts use. The
// public asset download endpoint lives on the Go API (port 8081 in dev)
// while the Next site serves /g/<slug> from a different origin (3000/3001),
// so we always need an absolute URL for the download <a href>.
const PUBLIC_API_BASE =
  getApiBaseUrl();

function absoluteApiUrl(url?: string | null) {
  if (!url) return "";
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:")
  )
    return url;
  return `${PUBLIC_API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

type WatermarkDisplay = {
  text: string;
  opacity: number;
  position: string;
  mode: "text" | "logo";
  logoUrl: string;
};

// Stable per-browser guest session id. One UUID per browser, shared across
// every gallery this browser visits. Used as the partition key for the
// gallery_favorites table so the photographer's "favorited by N guests"
// count is meaningful: clicking through to two share links from the same
// device counts as one session, the same client on phone + laptop counts
// as two.
const GUEST_SESSION_STORAGE_KEY = "rawdrive-guest-session-id";

// Public-grid incremental rendering. A public gallery can hold thousands of
// photos; rendering every tile eagerly builds one DOM node (plus click /
// keyboard handlers) per asset, inflating the JS heap and dropping frames
// while a guest scrolls on a low-end phone. We render an initial window and
// append a batch each time an IntersectionObserver sentinel near the end of
// the grid scrolls into view. Network was already throttled (img
// loading="lazy"), but the DOM tree was not — this caps it.
//
// The lightbox, filmstrip, keyboard nav and deep-link still operate over the
// FULL visibleAssets array, so paging the grid never limits what a guest can
// open or navigate to; opening an asset beyond the current window just grows
// the window to include it.
const INITIAL_GRID_RENDER_COUNT = 60;
const GRID_RENDER_BATCH = 60;
const FULLSCREEN_CHROME_IDLE_MS = 2200;

/**
 * getPrefetchRootMargin returns how far ahead of the viewport the
 * IntersectionObserver sentinel pre-mounts the next batch of grid tiles. The
 * 800px desktop default is deliberately aggressive for smooth scrolling, but on
 * slow or data-saver mobile connections that eagerly mounts (and lazy-loads)
 * tiles the guest may never reach. Shrink the lookahead when the Network
 * Information API reports a constrained connection; fall back to the
 * fast-network default when the API is unavailable (Safari/Firefox).
 */
export function getPrefetchRootMargin(): string {
  if (typeof navigator !== "undefined") {
    const connection = (
      navigator as Navigator & {
        connection?: { effectiveType?: string; saveData?: boolean };
      }
    ).connection;
    if (connection?.saveData) return "200px 0px";
    switch (connection?.effectiveType) {
      case "slow-2g":
      case "2g":
        return "200px 0px";
      case "3g":
        return "400px 0px";
    }
  }
  return "800px 0px";
}

type PublicDownloadFormat = "webp" | "thumbnail" | "original";

function downloadFormatsForQuality(
  value: string | undefined | null,
): PublicDownloadFormat[] {
  if (value === "original") return ["original"];
  if (value === "thumbnail") return ["thumbnail"];
  return ["webp"];
}

function publicDownloadLabel(format: PublicDownloadFormat): string {
  if (format === "original") return "Download original";
  if (format === "thumbnail") return "Download thumbnail";
  return "Download WebP";
}

function publicDownloadFilename(
  asset: PublicAsset,
  format: PublicDownloadFormat,
): string {
  if (format === "original") return asset.filename;
  if (format === "thumbnail")
    return "thumb_" + asset.filename.replace(/\.[^.]+$/, ".webp");
  return asset.filename.replace(/\.[^.]+$/, ".webp");
}

function encryptedDownloadManifest(
  asset: PublicAsset,
  format: PublicDownloadFormat,
) {
  if (format === "original") return originalManifest(asset);
  if (format === "thumbnail") {
    return (
      variantManifest(asset, "thumb_lg_webp") ||
      variantManifest(asset, "thumb_md_webp") ||
      variantManifest(asset, "thumb_sm_webp")
    );
  }
  return (
    variantManifest(asset, "display_webp") ||
    variantManifest(asset, "thumb_lg_webp") ||
    variantManifest(asset, "thumb_md_webp") ||
    variantManifest(asset, "thumb_sm_webp")
  );
}

function PublicAssetTileImage({
  asset,
  className,
  assetAccessToken = null,
  viewerToken = null,
}: {
  asset: PublicAsset;
  className?: string;
  // Gated-gallery byte-auth token (origin/main security control).
  assetAccessToken?: string | null;
  // Owner-preview bearer token (View as client). Null on the public route.
  viewerToken?: string | null;
}) {
  const media = useDecryptedAssetUrl(
    asset,
    GRID_VARIANTS,
    viewerToken,
    assetAccessToken,
  );
  // Responsive ladder (200/600/1200/2400w) so phones fetch thumb_md instead
  // of the desktop-size display variant. Null for encrypted/blob-backed media.
  const srcSet = buildAssetSrcSet(asset, null, assetAccessToken);
  if (media.loading) {
    return (
      <div className="aspect-[4/3] w-full animate-pulse bg-surface-sunken" />
    );
  }
  if (media.src) {
    return (
      <img
        src={media.src}
        srcSet={media.src.startsWith("blob:") ? undefined : (srcSet ?? undefined)}
        sizes={
          media.src.startsWith("blob:") || !srcSet ? undefined : GRID_SIZES
        }
        alt={asset.filename}
        loading="lazy"
        decoding="async"
        className={className}
      />
    );
  }
  return (
    <div className="flex aspect-[4/3] w-full items-center justify-center bg-surface-sunken text-xs text-text-tertiary">
      {publicMediaErrorMessage(media.error) || "Image unavailable"}
    </div>
  );
}

function PublicLightboxImage({
  photo,
  zoom,
  watermarkOverlay,
  assetAccessToken = null,
  viewerToken = null,
}: {
  photo: PublicAsset;
  zoom: number;
  watermarkOverlay: WatermarkDisplay | null;
  // Gated-gallery byte-auth token (origin/main security control).
  assetAccessToken?: string | null;
  // Owner-preview bearer token (View as client). Null on the public route.
  viewerToken?: string | null;
}) {
  const media = useDecryptedAssetUrl(
    photo,
    LIGHTBOX_VARIANTS,
    viewerToken,
    assetAccessToken,
  );
  if (media.loading) {
    return <p className="text-sm text-text-media/40">Decrypting photo...</p>;
  }
  if (!media.src) {
    return (
      <p className="text-sm text-text-media/40">
        {publicMediaErrorMessage(media.error) || "Image unavailable"}
      </p>
    );
  }
  return (
    <div className="relative flex h-full w-full min-h-0 min-w-0 items-center justify-center">
      <img
        src={media.src}
        alt={photo.filename}
        className="h-full w-full object-contain transition-transform duration-200"
        style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
        draggable={false}
      />
      {watermarkOverlay && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
        >
          <WatermarkOverlay
            text={watermarkOverlay.text}
            opacity={watermarkOverlay.opacity}
            position={watermarkOverlay.position}
            mode={watermarkOverlay.mode}
            logoUrl={watermarkOverlay.logoUrl}
          />
        </div>
      )}
    </div>
  );
}

function PublicFilmstripThumb({
  asset,
  active,
  assetAccessToken = null,
  viewerToken = null,
  index,
  onSelect,
}: {
  asset: PublicAsset;
  active: boolean;
  // Gated-gallery byte-auth token (origin/main security control). Threaded
  // into the media hook so protected thumbnail bytes authenticate for
  // password/private/share-gated galleries.
  assetAccessToken?: string | null;
  // Owner-preview bearer token (View as client). Null on the public route.
  viewerToken?: string | null;
  index: number;
  onSelect: (index: number) => void;
}) {
  const [useDisplayFallback, setUseDisplayFallback] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const variants = useDisplayFallback ? LIGHTBOX_VARIANTS : FILMSTRIP_VARIANTS;
  const media = useDecryptedAssetUrl(
    asset,
    variants,
    viewerToken,
    assetAccessToken,
  );

  const handleImageError = () => {
    if (!useDisplayFallback) {
      setImageFailed(false);
      setUseDisplayFallback(true);
      return;
    }
    setImageFailed(true);
  };

  // Build the click handler here (inside the thumb component) rather than as an
  // inline arrow in the lightbox's render-time IIFE — onSelect reaches the
  // chrome-timer ref via goToPhoto, which the compiler flags when the call is
  // created inside that IIFE. Stopping propagation keeps the surface-click
  // (close) handler from also firing.
  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onSelect(index);
    },
    [onSelect, index],
  );

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={handleClick}
      className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 transition-all ${
        active
          ? "border-text-media scale-105 shadow-lg"
          : "border-text-media/20 opacity-50 hover:opacity-100"
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

async function downloadPublicAsset(
  slug: string,
  asset: PublicAsset,
  format: PublicDownloadFormat,
  assetAccessToken?: string | null,
  workspaceScope?: string | null,
): Promise<void> {
  const url = new URL(
    `${PUBLIC_API_BASE}/api/v1/public/galleries/${slug}/assets/${asset.id}/download`,
  );
  url.searchParams.set("format", format);
  if (workspaceScope) {
    url.searchParams.set("ws", workspaceScope);
  }
  if (assetAccessToken) {
    url.searchParams.set("at", assetAccessToken);
  }
  if (!assetUsesClientMediaEncryption(asset)) {
    window.open(url.toString(), "_blank");
    return;
  }

  const manifest = encryptedDownloadManifest(asset, format);
  if (!manifest) return;
  const res = await fetch(url.toString());
  if (!res.ok) return;
  const plaintext = await decryptBlobWithAvailableMediaKeys(
    await res.blob(),
    manifest,
  );
  const objectUrl = URL.createObjectURL(plaintext);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = publicDownloadFilename(asset, format);
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

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
function useGalleryFavorites(
  slug: string,
  gallerySessionToken?: string | null,
  workspaceScope?: string | null,
) {
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
    const loadFavorites =
      gallerySessionToken || workspaceScope
        ? listPublicFavoriteAssetIds(
            slug,
            sessionId,
            gallerySessionToken,
            workspaceScope,
          )
        : listPublicFavoriteAssetIds(slug, sessionId);
    void loadFavorites
      .then((ids) => {
        if (cancelled) return;
        const next = new Set(ids);
        setFavorites(next);
        try {
          window.localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          /* quota — no-op */
        }
      })
      .catch(() => {
        // Server unreachable / gallery unpublished — fall through with
        // whatever localStorage gave us.
      });

    return () => {
      cancelled = true;
    };
  }, [gallerySessionToken, slug, storageKey, workspaceScope]);

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
        } catch {
          /* quota — no-op */
        }
      }

      if (!sessionId) return;

      // Fire-and-forget server sync. Optimistic UI already updated.
      // Failure is silent so a brief network blip doesn't snap the
      // Star back to its previous state — next mount re-syncs.
      const op =
        gallerySessionToken || workspaceScope
          ? wasFavorited
            ? removePublicFavorite(
                slug,
                assetId,
                sessionId,
                gallerySessionToken,
                workspaceScope,
              )
            : addPublicFavorite(
                slug,
                assetId,
                sessionId,
                gallerySessionToken,
                workspaceScope,
              )
          : wasFavorited
            ? removePublicFavorite(slug, assetId, sessionId)
            : addPublicFavorite(slug, assetId, sessionId);
      void op.catch(() => {
        /* sync failed; local state retained */
      });
    },
    [favorites, gallerySessionToken, slug, storageKey, workspaceScope],
  );

  return { favorites, toggle };
}

// Build the canonical share URL for a single asset.
//
// 2026-05-18: switched from `/g/{slug}?asset=<id>` (which opened the full
// gallery and deep-linked the lightbox) to the dedicated single-photo
// route `/g/{slug}/photo/{assetId}`. The new route renders ONLY the shared
// photo — no grid, no chips, no products — matching the user-facing rule
// that a share-link recipient should not see the rest of the gallery.
//
// The `?asset=<id>` deep-link auto-open behaviour in the public viewer
// (see useEffect further down) is preserved for legacy share URLs already
// floating around in email/WhatsApp, but new Share button clicks emit the
// single-photo URL.
//
// Falls back to a relative path on SSR where window.location.origin is
// undefined.
function buildAssetShareUrl(
  slug: string,
  assetId: string,
  workspaceScope?: string | null,
): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = setUrlSearchParamBeforeFragment(
    `${origin}/g/${slug}/photo/${assetId}`,
    "ws",
    workspaceScope,
  );
  if (typeof window === "undefined") return url;
  return appendCurrentGalleryKeyFragment(url);
}

// Web Share API + clipboard fallback. Returns the verdict so the caller
// can flip a "Link copied" success state. `copy-fallback` means we used
// clipboard; `shared` means the native sheet completed; `cancelled` means
// the user dismissed the sheet (suppress the copied state in that case so
// they don't see a confusing toast); `error` means everything failed.
async function shareOrCopy(
  url: string,
  title: string,
): Promise<"shared" | "copy-fallback" | "cancelled" | "error"> {
  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await (
        navigator as Navigator & {
          share: (d: { title: string; url: string }) => Promise<void>;
        }
      ).share({ title, url });
      return "shared";
    } catch (err) {
      // AbortError = user cancelled. Treat as "cancelled" so the caller
      // doesn't show a copy-success toast they didn't ask for.
      if (err instanceof DOMException && err.name === "AbortError")
        return "cancelled";
      // Other Web Share failures (permission denied, no targets) fall
      // through to the clipboard path below.
    }
  }
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return "copy-fallback";
    }
    if (typeof document !== "undefined") {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return "copy-fallback";
    }
  } catch {
    /* fall through to error */
  }
  return "error";
}

interface Props {
  slug: string;
  assets: PublicAsset[];
  galleryType?: string;
  maxSelections?: number;
  downloadEnabled?: boolean;
  downloadQuality?: string | null;
  favoritesDisabledReason?: string;
  // Optional design config from the Gallery Design Studio. Drives the
  // grid layout (masonry vs uniform grid vs justified vs carousel), the
  // column count, the gap between thumbnails, and whether to show the
  // asset filename beneath each photo. When absent the grid falls back
  // to the hard-coded `columns-1 sm:columns-2 lg:columns-3 gap-4` masonry
  // that shipped before the design studio was wired through to the
  // public viewer.
  design?: PublicDesignConfig | null;
  // 2026-05-18: Watermark config from gallery.watermark_config (set on
  // /galleries/[id]/settings). When enabled, an absolutely-positioned
  // CSS overlay renders over every grid tile (and the lightbox <img>).
  // Shape we read: { enabled?: boolean, text?: string, opacity?: number
  // (10..90), position?: "center"|"bottom-right"|"bottom-left"|"diagonal" }.
  // We accept the loose Record<string, unknown> from the gallery row
  // rather than a typed interface so settings-side schema additions
  // (font, color, use_logo) flow through without a Props change.
  watermark?: Record<string, unknown> | null;
  // S4-G1: the gallery-session token (password- or share-PIN-scoped) minted
  // after a successful unlock. When set, it is appended as `?gs=` to every
  // protected image URL so cross-origin <img> requests authenticate without
  // relying on the SameSite=Strict gallery_session cookie. Undefined for open
  // (public/unlisted, non-password) galleries, where the bytes serve
  // anonymously and no token is needed.
  gallerySessionToken?: string | null;
  // SEC-1: the short-lived, gallery-scoped asset-access token
  // (gallery.settings.asset_access_token) appended as `?at=` to protected
  // image/byte/download URLs. Distinct from gallerySessionToken (the durable
  // session, used for the header-authenticated JSON APIs: favorites, proofing
  // submit) — a byte token in a URL cannot be replayed as a session.
  assetAccessToken?: string | null;
  // Optional workspace subdomain scope (`?ws=`) from per-business public URLs.
  // Public proofing, favorites, and downloads must preserve it so every
  // follow-up API call targets the same workspace-scoped gallery as the page.
  workspaceScope?: string | null;
  // Owner "View as client" preview only. The authenticated photographer's
  // access token (getStoredAccessToken), threaded into useDecryptedAssetUrl as
  // its bearer `token` so protected/encrypted /storage byte fetches carry
  // `Authorization: Bearer` and decrypt for unpublished/private galleries —
  // mirroring the working dashboard detail tile (GalleryAssetTileImage). The
  // public /g/[slug] route never sets this (anonymous viewers have no bearer),
  // so it defaults to null and that path is unchanged.
  viewerToken?: string | null;
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

function designGridContainerStyle(
  grid: GridConfig | undefined,
): React.CSSProperties | undefined {
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

function designGridItemStyle(
  grid: GridConfig | undefined,
): React.CSSProperties | undefined {
  if (!grid || !grid.layout) return undefined;
  // For CSS columns layouts, the vertical gap between items in the same
  // column is `margin-bottom` on each child (CSS columns ignores
  // row-gap). Pipe the studio's gap value through a CSS variable the
  // item class can pick up.
  if (grid.layout === "masonry" || grid.layout === "justified") {
    const gap = clampGap(grid.gap);
    return {
      ["--design-row-gap" as never]: `${gap}px`,
      marginBottom: `${gap}px`,
    };
  }
  return undefined;
}

// Watermark overlay primitive — shared by every grid tile (and could be
// reused in the lightbox / preview chrome in a follow-up). Renders the
// configured text as an absolutely-positioned white-with-shadow label
// at one of four positions:
//   - center           — centered, large, used as a "PROOF" deterrent
//   - bottom-right     — small corner mark (default)
//   - bottom-left      — same, opposite corner
//   - diagonal         — rotated 45° tile across the whole frame for
//                        max deterrence against right-click + crop
// pointer-events:none so the tile's click handler (lightbox open,
// proofing select) keeps working through the overlay. select-none +
// user-select:none prevent the watermark text from being selected
// and copied separately from the image.
function WatermarkOverlay({
  text,
  opacity,
  position,
  mode,
  logoUrl,
}: {
  text: string;
  opacity: number;
  position: string;
  mode?: "text" | "logo";
  logoUrl?: string;
}) {
  const shared =
    "pointer-events-none absolute select-none font-semibold tracking-widest uppercase text-text-media";
  // text-shadow on both axes survives both bright and dark photos
  // without needing a backdrop scrim — keeps the photo visible.
  const style: React.CSSProperties = {
    opacity,
    textShadow: "var(--cover-text-shadow)",
  };

  if (mode === "logo" && logoUrl) {
    const corner =
      position === "bottom-left"
        ? "bottom-3 left-3"
        : position === "center"
          ? "inset-0 flex items-center justify-center"
          : "bottom-3 right-3";
    return (
      <div
        aria-hidden
        style={{ opacity }}
        className={`pointer-events-none absolute ${corner} select-none`}
      >
        <img
          src={logoUrl}
          alt=""
          className="h-14 w-14 object-contain drop-shadow-lg sm:h-16 sm:w-16"
        />
      </div>
    );
  }

  if (position === "center") {
    return (
      <div
        aria-hidden
        style={style}
        className={`${shared} inset-0 flex items-center justify-center text-2xl sm:text-3xl md:text-4xl`}
      >
        {text}
      </div>
    );
  }
  if (position === "diagonal") {
    // -45° rotation. Wide letter-spacing + repeated text once would
    // approach a tiled effect; keeping it as one rotated line is the
    // safe middle ground (no overflow on very wide tiles).
    return (
      <div
        aria-hidden
        style={{
          ...style,
          transform: "translate(-50%, -50%) rotate(-30deg)",
          left: "50%",
          top: "50%",
        }}
        className={`${shared} text-2xl sm:text-3xl whitespace-nowrap`}
      >
        {text}
      </div>
    );
  }
  // bottom-left / bottom-right (default). Padded inward from the
  // edge so the text doesn't bleed against the tile's rounded corner.
  const corner =
    position === "bottom-left" ? "bottom-3 left-3" : "bottom-3 right-3";
  return (
    <div
      aria-hidden
      style={style}
      className={`${shared} ${corner} text-xs sm:text-sm`}
    >
      {text}
    </div>
  );
}

export function PublicGalleryGrid({
  slug,
  assets,
  galleryType,
  maxSelections = 0,
  downloadEnabled = true,
  downloadQuality = "webp",
  favoritesDisabledReason,
  design = null,
  watermark = null,
  gallerySessionToken = null,
  assetAccessToken = null,
  workspaceScope = null,
  viewerToken = null,
}: Props) {
  // Memoize the resolved watermark display state. Returns null when
  // disabled / misconfigured so the render path can short-circuit to
  // a plain <img>. Keeping the derivation in one place means the
  // grid and lightbox both read the same canonical values.
  const watermarkOverlay: WatermarkDisplay | null = (() => {
    if (!watermark || watermark.enabled !== true) return null;
    const rawText =
      typeof watermark.text === "string" ? watermark.text.trim() : "";
    const mode: WatermarkDisplay["mode"] =
      watermark.mode === "logo" ? "logo" : "text";
    const logoUrl =
      mode === "logo" && typeof watermark.logo_url === "string"
        ? absoluteApiUrl(watermark.logo_url)
        : "";
    if (rawText.length === 0 && !logoUrl) return null;
    const rawOpacity =
      typeof watermark.opacity === "number" ? watermark.opacity : 40;
    // Settings UI stores opacity as 10..90 (integer percent); clamp +
    // convert to a CSS 0..1 number. Caps at 0.9 because a fully-
    // opaque overlay defeats the point of seeing the photo.
    const opacity = Math.max(0.1, Math.min(0.9, rawOpacity / 100));
    const position =
      typeof watermark.position === "string"
        ? watermark.position
        : "bottom-right";
    return { text: rawText, opacity, position, mode, logoUrl };
  })();
  // viewMode + the Grid/Map toggle were removed 2026-05-19. The grid is
  // now the only render path; see the file header for context.
  const [faceFilterIds, setFaceFilterIds] = useState<Set<string> | null>(null);
  // Incremental grid rendering window (see INITIAL_GRID_RENDER_COUNT). Grows
  // via the IntersectionObserver sentinel below; resets when the filtered set
  // changes so a newly-applied face filter starts from the top.
  const [visibleCount, setVisibleCount] = useState(INITIAL_GRID_RENDER_COUNT);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);

  // Fullscreen mode for lightbox
  const lightboxRef = useRef<HTMLDivElement>(null);
  // a11y: the inline lightbox is a modal dialog (aria-modal) — move focus in
  // when it opens, trap Tab within it, and restore focus to the trigger tile
  // on close. Engaged only while a photo is open (lightboxIdx !== null).
  useFocusTrap(lightboxRef, lightboxIdx !== null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const chromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearChromeTimer = useCallback(() => {
    if (chromeTimerRef.current) {
      clearTimeout(chromeTimerRef.current);
      chromeTimerRef.current = null;
    }
  }, []);

  const revealChrome = useCallback(() => {
    setChromeVisible(true);
    clearChromeTimer();
  }, [clearChromeTimer]);

  const resetChromeTimer = useCallback(() => {
    setChromeVisible(true);
    clearChromeTimer();
    if (isFullscreen) {
      chromeTimerRef.current = setTimeout(
        () => setChromeVisible(false),
        FULLSCREEN_CHROME_IDLE_MS,
      );
    }
  }, [clearChromeTimer, isFullscreen]);

  // Client-side favorite store + "share link copied" feedback. The
  // feedback flag is local to the lightbox toolbar — flips true for ~1.6s
  // after the share button's clipboard write succeeds, then resets.
  const { favorites, toggle: toggleFavorite } = useGalleryFavorites(
    slug,
    gallerySessionToken,
    workspaceScope,
  );
  const [favoriteNotice, setFavoriteNotice] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  // Per-tile share-copied feedback. Keyed by asset id so only the tile the
  // user just clicked flashes a success state — not every Share button on
  // the grid. Cleared on a per-id timer so two quick clicks on different
  // tiles each animate independently.
  const [tileShareCopiedId, setTileShareCopiedId] = useState<string | null>(
    null,
  );
  const [tileMenuOpenId, setTileMenuOpenId] = useState<string | null>(null);
  const allowedDownloadFormats = useMemo(
    () => (downloadEnabled ? downloadFormatsForQuality(downloadQuality) : []),
    [downloadEnabled, downloadQuality],
  );

  const handleToggleFavorite = useCallback(
    (assetId: string) => {
      if (favoritesDisabledReason) {
        setFavoriteNotice(favoritesDisabledReason);
        return;
      }
      setFavoriteNotice("");
      toggleFavorite(assetId);
    },
    [favoritesDisabledReason, toggleFavorite],
  );

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

  // Reveal the fullscreen chrome the moment we enter fullscreen, via the
  // adjust-state-during-render pattern (tracking the last fullscreen value in
  // state) so it lands in the same render fullscreen turns on. Chrome
  // visibility is consulted exclusively as `isFullscreen && !chromeVisible`,
  // so its value is irrelevant while we're not in fullscreen — no need to
  // force it back to `true` on exit.
  const [lastIsFullscreen, setLastIsFullscreen] = useState(isFullscreen);
  if (lastIsFullscreen !== isFullscreen) {
    setLastIsFullscreen(isFullscreen);
    if (isFullscreen) setChromeVisible(true);
  }

  useEffect(() => {
    // Synchronize only the external idle timer with fullscreen state; the
    // chrome reveal on entry is handled by the render-time adjust above. The
    // timer's setChromeVisible(false) runs in a deferred callback, not
    // synchronously within the effect.
    if (!isFullscreen) {
      clearChromeTimer();
      return;
    }
    clearChromeTimer();
    chromeTimerRef.current = setTimeout(
      () => setChromeVisible(false),
      FULLSCREEN_CHROME_IDLE_MS,
    );
    return clearChromeTimer;
  }, [clearChromeTimer, isFullscreen]);

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
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const toggleSelection = useCallback(
    (assetId: string) => {
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
    },
    [maxSelections],
  );

  const handleSubmitSelections = async () => {
    const clientName = submitName.trim();
    const clientEmail = submitEmail.trim();
    if (selectedIds.size === 0 || !clientName || !clientEmail) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await submitPublicProofing(
        slug,
        {
          asset_ids: Array.from(selectedIds),
          client_name: clientName,
          client_email: clientEmail,
          note: submitNote,
        },
        gallerySessionToken,
        workspaceScope,
      );
      setSubmitted(true);
      setShowSubmit(false);
      setSelectedIds(new Set());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submission failed.";
      if (message === "selection_limit_reached") {
        setSubmitError(
          "You have reached the selection limit for this gallery.",
        );
      } else if (message === "gallery password required") {
        setSubmitError(
          "Please unlock the gallery again before submitting selections.",
        );
      } else {
        setSubmitError(message);
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
      window.removeEventListener(
        "rawdrive:face-filter",
        onFilter as EventListener,
      );
      window.removeEventListener("rawdrive:face-filter-clear", onFilterClear);
    };
  }, []);

  const visibleAssets = useMemo(() => {
    if (!faceFilterIds) return assets;
    return assets.filter((a) => faceFilterIds.has(a.id));
  }, [assets, faceFilterIds]);

  // Reset the render window whenever the visible set changes (filter applied
  // or cleared, or the asset list itself changes) so paging always restarts
  // from the top of the freshly-shown set. Adjust-state-during-render (keyed on
  // the faceFilterIds + assets identities held in state) rather than an effect,
  // so the window is already reset in the render that shows the new set — the
  // grid never momentarily renders the old visibleCount against new content.
  const [lastVisibleSetKey, setLastVisibleSetKey] = useState<{
    faceFilterIds: Set<string> | null;
    assets: typeof assets;
  }>({ faceFilterIds, assets });
  if (
    lastVisibleSetKey.faceFilterIds !== faceFilterIds ||
    lastVisibleSetKey.assets !== assets
  ) {
    setLastVisibleSetKey({ faceFilterIds, assets });
    setVisibleCount(INITIAL_GRID_RENDER_COUNT);
  }

  // IntersectionObserver is supported in every browser this public viewer
  // targets; when it is unavailable (very old browser / jsdom without a
  // polyfill) we render everything so no photo is ever unreachable. Captured
  // once at mount — availability never changes at runtime — so the
  // "render everything" fallback is expressed as an effective render count
  // instead of a synchronous setState inside the observer effect below.
  const [hasIntersectionObserver] = useState(
    () => typeof IntersectionObserver !== "undefined",
  );

  // The slice of visibleAssets actually mounted into the grid DOM. Lightbox /
  // filmstrip / keyboard nav deliberately keep using the full visibleAssets
  // array — only the grid tiles are paged. Without IntersectionObserver there
  // is no sentinel to grow the window, so we mount the full set up front.
  const effectiveVisibleCount = hasIntersectionObserver
    ? visibleCount
    : visibleAssets.length;
  const renderedAssets = useMemo(
    () => visibleAssets.slice(0, effectiveVisibleCount),
    [visibleAssets, effectiveVisibleCount],
  );

  const hasMoreToRender = effectiveVisibleCount < visibleAssets.length;

  // Grow the render window as the sentinel scrolls into view. When
  // IntersectionObserver is unavailable, effectiveVisibleCount already equals
  // visibleAssets.length so hasMoreToRender is false and this effect no-ops —
  // the full set is mounted up front (see hasIntersectionObserver above).
  useEffect(() => {
    if (!hasMoreToRender) return;
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) =>
            Math.min(c + GRID_RENDER_BATCH, visibleAssets.length),
          );
        }
      },
      { rootMargin: getPrefetchRootMargin() },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreToRender, visibleAssets.length]);

  // Deep-link auto-open. Pairs with the Share button's clipboard URL
  // (?asset=<id>). When a recipient lands on the share link, find the
  // matching asset in the rendered set and open the lightbox there so
  // the link actually feels like sharing the photo, not just the
  // gallery. Runs once after assets are populated; tolerates a stale id
  // (asset filtered out by face-filter etc.) by silently doing nothing.
  // The open must stay a post-mount side effect (reading window.location
  // during render would desync hydration), so we apply it off a microtask
  // rather than synchronously in the effect body. The deepLinkOpenedRef
  // guard keeps it strictly one-shot across re-renders / async resolution.
  const deepLinkOpenedRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (deepLinkOpenedRef.current) return;
    if (lightboxIdx !== null) return;
    const params = new URLSearchParams(window.location.search);
    const requestedAsset = params.get("asset");
    if (!requestedAsset) return;
    const idx = visibleAssets.findIndex((a) => a.id === requestedAsset);
    if (idx < 0) return;
    deepLinkOpenedRef.current = true;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLightboxIdx(idx);
      setZoom(1);
    });
    return () => {
      cancelled = true;
    };
  }, [visibleAssets, lightboxIdx]);

  // Helper to change photo and reset zoom in one update. Also wakes the
  // fullscreen chrome briefly so keyboard users get visual feedback without
  // losing the photo-first idle state.
  const goToPhoto = useCallback(
    (idx: number | null) => {
      setLightboxIdx(idx);
      setZoom(1);
      resetChromeTimer();
    },
    [resetChromeTimer],
  );

  // Prev/Next click handlers are hoisted to stable callbacks (rather than
  // inline arrows inside the lightbox's render-time IIFE) so they read as
  // event handlers, not render-time work — goToPhoto reaches the chrome-timer
  // ref, which the compiler flags if the call is created inside the IIFE.
  const goToPrev = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (lightboxIdx === null) return;
      goToPhoto(lightboxIdx > 0 ? lightboxIdx - 1 : lightboxIdx);
    },
    [goToPhoto, lightboxIdx],
  );

  const goToNext = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (lightboxIdx === null) return;
      goToPhoto(
        lightboxIdx < visibleAssets.length - 1 ? lightboxIdx + 1 : lightboxIdx,
      );
    },
    [goToPhoto, lightboxIdx, visibleAssets.length],
  );

  // Keyboard handling for the lightbox
  useEffect(() => {
    if (lightboxIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const currentIdx = lightboxIdx;
      if (currentIdx === null) return;
      resetChromeTimer();
      switch (e.key) {
        case "Escape":
          setLightboxIdx(null);
          break;
        case "ArrowLeft":
          goToPhoto(currentIdx > 0 ? currentIdx - 1 : currentIdx);
          break;
        case "PageUp":
          goToPhoto(currentIdx > 0 ? currentIdx - 1 : currentIdx);
          break;
        case "ArrowRight":
          goToPhoto(
            currentIdx < visibleAssets.length - 1 ? currentIdx + 1 : currentIdx,
          );
          break;
        case "PageDown":
          goToPhoto(
            currentIdx < visibleAssets.length - 1 ? currentIdx + 1 : currentIdx,
          );
          break;
        case "Home":
          goToPhoto(0);
          break;
        case "End":
          goToPhoto(visibleAssets.length - 1);
          break;
        case "+":
        case "=":
          setZoom((z) => Math.min(z + 0.25, 3));
          break;
        case "-":
          setZoom((z) => Math.max(z - 0.25, 0.5));
          break;
        case "0":
          setZoom(1);
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [
    goToPhoto,
    lightboxIdx,
    resetChromeTimer,
    visibleAssets.length,
    toggleFullscreen,
  ]);

  const handleLightboxSurfaceClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (isFullscreen && !chromeVisible) {
        resetChromeTimer();
        return;
      }
      setLightboxIdx(null);
    },
    [chromeVisible, isFullscreen, resetChromeTimer],
  );

  const fullscreenChromeClass =
    isFullscreen && !chromeVisible
      ? "pointer-events-none opacity-0"
      : "opacity-100";

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
      {favoriteNotice && (
        <p
          role="status"
          aria-live="polite"
          className="mb-4 rounded-xl border border-feedback-warning/30 bg-feedback-warning/10 px-4 py-3 text-sm text-feedback-warning"
        >
          {favoriteNotice}
        </p>
      )}

      {/* Grid render — single render path. The legacy Grid/Map toggle
          was removed 2026-05-19 (see file header). */}
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
        {renderedAssets.map((asset) => (
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
                <CheckCircle className="w-5 h-5 text-text-inverse" />
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
              <div className="absolute top-2 right-2 z-10">
                {/* 3-dot toggle — single entry point for all per-tile actions */}
                <GlassIconButton
                  size="sm"
                  label="Photo options"
                  aria-haspopup="true"
                  aria-expanded={tileMenuOpenId === asset.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTileMenuOpenId((cur) =>
                      cur === asset.id ? null : asset.id,
                    );
                  }}
                  active={tileMenuOpenId === asset.id}
                >
                  <EllipsisVertical className="h-4 w-4" />
                </GlassIconButton>

                {tileMenuOpenId === asset.id && (
                  <>
                    {/* Invisible overlay to close the menu on outside click */}
                    <div
                      className="fixed inset-0 z-10"
                      aria-hidden="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTileMenuOpenId(null);
                      }}
                    />
                    <div
                      role="menu"
                      className="absolute right-0 top-11 z-20 min-w-[140px] overflow-hidden rounded-2xl border border-border bg-surface-elevated/90 shadow-elevation-2 glass-blur-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Favorite */}
                      <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={favorites.has(asset.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFavorite(asset.id);
                          setTileMenuOpenId(null);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-sm text-text-primary transition-colors hover:bg-surface-container-low"
                      >
                        <Star
                          className={
                            favorites.has(asset.id)
                              ? "h-4 w-4 text-feedback-warning fill-current"
                              : "h-4 w-4"
                          }
                        />
                        <span>
                          {favorites.has(asset.id)
                            ? "Remove favorite"
                            : "Add to favorites"}
                        </span>
                      </button>

                      {/* Share */}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const url = buildAssetShareUrl(
                            slug,
                            asset.id,
                            workspaceScope,
                          );
                          const result = await shareOrCopy(url, asset.filename);
                          if (result === "copy-fallback") {
                            setTileShareCopiedId(asset.id);
                            window.setTimeout(() => {
                              setTileShareCopiedId((cur) =>
                                cur === asset.id ? null : cur,
                              );
                            }, 1600);
                          }
                          setTileMenuOpenId(null);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface-container-low"
                      >
                        <Share
                          className={
                            tileShareCopiedId === asset.id
                              ? "h-4 w-4 text-feedback-success"
                              : "h-4 w-4 text-text-primary"
                          }
                        />
                        <span
                          className={
                            tileShareCopiedId === asset.id
                              ? "text-feedback-success"
                              : "text-text-primary"
                          }
                        >
                          {tileShareCopiedId === asset.id
                            ? "Link copied!"
                            : "Share photo"}
                        </span>
                      </button>

                      {/* Download — one explicit item per studio-allowed format */}
                      {allowedDownloadFormats.map((format) => (
                        <button
                          key={format}
                          type="button"
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            void downloadPublicAsset(
                              slug,
                              asset,
                              format,
                              assetAccessToken,
                              workspaceScope,
                            );
                            setTileMenuOpenId(null);
                          }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-sm text-text-primary transition-colors hover:bg-surface-container-low"
                        >
                          <Download className="h-4 w-4" />
                          <span>{publicDownloadLabel(format)}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <div
              className={
                design?.grid?.layout === "grid" ? "absolute inset-0" : ""
              }
            >
              <PublicAssetTileImage
                asset={asset}
                assetAccessToken={assetAccessToken}
                viewerToken={viewerToken}
                className={
                  design?.grid?.layout === "grid"
                    ? "absolute inset-0 h-full w-full object-cover"
                    : "h-auto w-full object-cover"
                }
              />
              {watermarkOverlay && (
                <WatermarkOverlay
                  text={watermarkOverlay.text}
                  opacity={watermarkOverlay.opacity}
                  position={watermarkOverlay.position}
                  mode={watermarkOverlay.mode}
                  logoUrl={watermarkOverlay.logoUrl}
                />
              )}
            </div>
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
        ))}
      </div>

      {/* Incremental-render sentinel. Sits below the rendered grid window;
          when it scrolls into view the IntersectionObserver above appends the
          next batch of tiles. Only mounted while more assets remain so guests
          who reach the true end of the gallery don't keep an idle observer. */}
      {hasMoreToRender && (
        <div
          ref={loadMoreRef}
          aria-hidden="true"
          className="h-px w-full"
          data-testid="grid-load-more-sentinel"
        />
      )}

      {/* End-of-gallery indicator */}
      <div className="mt-12 text-center pb-8">
        <div className="inline-block h-px w-16 bg-border-subtle" />
        <p className="mt-3 text-xs text-text-tertiary">
          {visibleAssets.length}{" "}
          {visibleAssets.length === 1 ? "photo" : "photos"}
        </p>
      </div>

      {/* M19 F-009: Proofing selection floating bar */}
      {isProofing && selectedIds.size > 0 && !submitted && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-surface-elevated/95 glass-blur-full border-t border-border-subtle px-4 py-3 shadow-lg">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">
              {selectedIds.size} {selectedIds.size === 1 ? "photo" : "photos"}{" "}
              selected
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
                className="px-4 py-1.5 text-sm font-medium rounded-lg bg-accent-primary text-text-inverse hover:opacity-90 transition-opacity"
              >
                Submit Selections
              </button>
            </div>
          </div>
        </div>
      )}

      {/* M19: Submission success message */}
      {submitted && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-feedback-success/95 glass-blur-full px-4 py-3 shadow-lg">
          <div className="max-w-6xl mx-auto text-center">
            <p className="text-sm font-medium text-text-inverse">
              Your selections have been submitted! The photographer will review
              them shortly.
            </p>
          </div>
        </div>
      )}

      {/* M19: Submit selections dialog */}
      {showSubmit && (
        <div
          className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setShowSubmit(false)}
        >
          <div
            className="bg-surface-elevated rounded-2xl shadow-xl max-w-md w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-text-primary mb-1">
              Submit Your Selections
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              {selectedIds.size} {selectedIds.size === 1 ? "photo" : "photos"}{" "}
              selected
            </p>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Your name *"
                value={submitName}
                onChange={(e) => setSubmitName(e.target.value)}
                className="input-base w-full"
                required
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
              {submitError && (
                <p
                  role="alert"
                  className="rounded-lg border border-feedback-error/20 bg-feedback-error/10 px-3 py-2 text-sm text-feedback-error"
                >
                  {submitError}
                </p>
              )}
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
                disabled={
                  !submitName.trim() || !submitEmail.trim() || submitting
                }
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-accent-primary text-text-inverse hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client-facing lightbox */}
      {lightboxIdx !== null &&
        visibleAssets[lightboxIdx] &&
        (() => {
          const photo = visibleAssets[lightboxIdx];
          // Public lightbox display goes through the WebP-only media picker in
          // PublicLightboxImage (useDecryptedAssetUrl). It prefers the largest
          // PUBLIC thumb variant (thumb_lg_webp, ~1200px) so unauthenticated
          // share-link visitors aren't 401'd by the migration-104 (M41) split
          // that auth-gates display_webp under /storage/derivatives/. If the
          // gallery is E2EE-shared, the URL hash carries the client key and the
          // hook decrypts the WebP blob in the browser. The gallery-session
          // token (for password/private/share-gated galleries) is threaded into
          // PublicLightboxImage for protected-byte auth.
          return (
            <div
              ref={lightboxRef}
              className="media-viewer-shell fixed inset-0 z-50 flex flex-col"
              onClick={handleLightboxSurfaceClick}
              onMouseMove={resetChromeTimer}
              onPointerDown={() => {
                if (isFullscreen && !chromeVisible) resetChromeTimer();
              }}
              role="dialog"
              aria-modal="true"
              aria-label={`Photo: ${photo.filename}`}
              tabIndex={-1}
            >
              {/* Toolbar — auto-hides in fullscreen after 3s idle */}
              <div
                className={`${isFullscreen ? "absolute left-0 right-0 top-0" : ""} ${fullscreenChromeClass} z-20 flex shrink-0 items-center justify-between px-4 py-3 transition-opacity duration-300`}
                onMouseEnter={isFullscreen ? revealChrome : undefined}
                onMouseLeave={isFullscreen ? resetChromeTimer : undefined}
                onFocus={isFullscreen ? revealChrome : undefined}
                onBlur={isFullscreen ? resetChromeTimer : undefined}
              >
                <span className="text-sm font-medium text-text-media truncate max-w-[300px]">
                  {photo.filename}
                  {zoom !== 1 && (
                    <span className="ml-2 text-text-media/40 text-xs">
                      {Math.round(zoom * 100)}%
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1.5">
                  <GlassIconButton
                    size="sm"
                    label="Zoom out"
                    onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
                  >
                    <ZoomOut />
                  </GlassIconButton>
                  <GlassIconButton
                    size="sm"
                    label="Zoom in"
                    onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
                  >
                    <ZoomIn />
                  </GlassIconButton>
                  <div className="media-viewer-divider mx-1 h-6 w-px" />
                  {/* Client actions — favorite (localStorage), download
                    (public asset endpoint), share (copy deep-link). Kept
                    together as one cluster so the lightbox toolbar reads
                    as: [view controls] | [actions] | [window controls]. */}
                  <GlassIconButton
                    size="sm"
                    variant={favorites.has(photo.id) ? "accent" : "glass"}
                    active={favorites.has(photo.id)}
                    label={
                      favorites.has(photo.id)
                        ? "Remove from favorites"
                        : "Add to favorites"
                    }
                    onClick={() => handleToggleFavorite(photo.id)}
                  >
                    <Star />
                  </GlassIconButton>
                  {allowedDownloadFormats.map((format) => (
                    <GlassIconButton
                      key={format}
                      size="sm"
                      label={publicDownloadLabel(format)}
                      onClick={() => {
                        void downloadPublicAsset(
                          slug,
                          photo,
                          format,
                          assetAccessToken,
                          workspaceScope,
                        );
                      }}
                    >
                      <Download />
                    </GlassIconButton>
                  ))}
                  <GlassIconButton
                    size="sm"
                    variant={shareCopied ? "success" : "glass"}
                    label={shareCopied ? "Share link copied" : "Share photo"}
                    onClick={async () => {
                      // 2026-05-18: use the shared shareOrCopy helper so the
                      // lightbox Share matches the per-tile Share (Web Share
                      // API on mobile, clipboard on desktop, suppressed
                      // toast on user-cancel). URL points to the new
                      // single-photo route — see buildAssetShareUrl notes.
                      const url = buildAssetShareUrl(
                        slug,
                        photo.id,
                        workspaceScope,
                      );
                      const result = await shareOrCopy(url, photo.filename);
                      if (result === "copy-fallback") {
                        setShareCopied(true);
                        window.setTimeout(() => setShareCopied(false), 1600);
                      }
                    }}
                  >
                    <Share />
                  </GlassIconButton>
                  <div className="media-viewer-divider mx-1 h-6 w-px" />
                  <GlassIconButton
                    size="sm"
                    label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                    onClick={toggleFullscreen}
                  >
                    {isFullscreen ? <Compress /> : <Expand />}
                  </GlassIconButton>
                  <GlassIconButton
                    size="sm"
                    variant="ghost"
                    label="Close"
                    onClick={() => setLightboxIdx(null)}
                  >
                    <XMark />
                  </GlassIconButton>
                </div>
              </div>

              {/* Image */}
              <div
                className={`${isFullscreen ? "absolute inset-0 p-2" : "relative flex-1 p-4"} flex min-h-0 min-w-0 items-center justify-center overflow-hidden`}
                onClick={handleLightboxSurfaceClick}
              >
                {lightboxIdx > 0 && (
                  <GlassIconButton
                    size="lg"
                    label="Previous"
                    className={`${fullscreenChromeClass} absolute left-4 z-10 transition-opacity duration-300`}
                    onClick={goToPrev}
                  >
                    <ChevronLeft />
                  </GlassIconButton>
                )}

                <PublicLightboxImage
                  photo={photo}
                  zoom={zoom}
                  watermarkOverlay={watermarkOverlay}
                  assetAccessToken={assetAccessToken}
                  viewerToken={viewerToken}
                />

                {lightboxIdx < visibleAssets.length - 1 && (
                  <GlassIconButton
                    size="lg"
                    label="Next"
                    className={`${fullscreenChromeClass} absolute right-4 z-10 transition-opacity duration-300`}
                    onClick={goToNext}
                  >
                    <ChevronRight />
                  </GlassIconButton>
                )}
              </div>

              {/* Filmstrip — scrollable thumbnail strip for quick navigation, auto-hides in fullscreen */}
              {visibleAssets.length > 1 && (
                <div
                  className={`${isFullscreen ? "absolute bottom-4 left-0 right-0" : ""} ${fullscreenChromeClass} z-20 flex shrink-0 gap-1.5 overflow-x-auto scroll-smooth px-4 py-2 transition-opacity duration-300`}
                  role="tablist"
                  aria-label="Photo filmstrip"
                  onMouseEnter={isFullscreen ? revealChrome : undefined}
                  onMouseLeave={isFullscreen ? resetChromeTimer : undefined}
                  onFocus={isFullscreen ? revealChrome : undefined}
                  onBlur={isFullscreen ? resetChromeTimer : undefined}
                >
                  {visibleAssets.map((a, i) => (
                    <PublicFilmstripThumb
                      key={a.id}
                      asset={a}
                      active={i === lightboxIdx}
                      assetAccessToken={assetAccessToken}
                      viewerToken={viewerToken}
                      index={i}
                      onSelect={goToPhoto}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })()}
    </>
  );
}
