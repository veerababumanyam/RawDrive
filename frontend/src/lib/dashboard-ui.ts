export const invoiceStatusClasses: Record<string, string> = {
  draft: "status-badge status-badge--neutral",
  sent: "status-badge status-badge--info",
  paid: "status-badge status-badge--success",
  partially_paid: "status-badge status-badge--warning",
  overdue: "status-badge status-badge--danger",
  cancelled: "status-badge status-badge--neutral",
};

export const leadStageClasses: Record<string, string> = {
  new: "status-badge status-badge--info",
  contacted: "status-badge status-badge--warning",
  qualified: "status-badge status-badge--accent",
  proposal: "status-badge status-badge--warning",
  negotiation: "status-badge status-badge--info",
  won: "status-badge status-badge--success",
  lost: "status-badge status-badge--danger",
};

export const calendarEventClasses: Record<string, string> = {
  shoot: "status-badge status-badge--accent",
  meeting: "status-badge status-badge--info",
  editing: "status-badge status-badge--accent",
  personal: "status-badge status-badge--success",
  travel: "status-badge status-badge--warning",
  blocked: "status-badge status-badge--danger",
  other: "status-badge status-badge--neutral",
};

export const moderationReasonClasses: Record<string, string> = {
  auto_flagged: "status-badge status-badge--warning",
  reported: "status-badge status-badge--danger",
};

export const availabilityClasses: Record<string, string> = {
  available: "status-badge status-badge--success",
  unavailable: "status-badge status-badge--danger",
};

export const proofingStatusClasses: Record<string, string> = {
  selected: "status-badge status-badge--accent",
  approved: "status-badge status-badge--success",
  rejected: "status-badge status-badge--danger",
};

export const galleryStatusClasses: Record<string, string> = {
  draft: "status-badge status-badge--neutral",
  active: "status-badge status-badge--accent",
  archived: "status-badge status-badge--neutral",
};

export const galleryTypeClasses: Record<string, string> = {
  proofing: "status-badge status-badge--accent",
  delivery: "status-badge status-badge--info",
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Returns true when the backend has accepted an upload but the
 * thumbnail/derivative worker has not yet produced the variants the
 * gallery grid needs to render. Used to swap a fully-rendered tile
 * for a "Processing…" skeleton during the (~10s) window between
 * `POST /galleries/{id}/assets → 201` and the worker's
 * `asset.ready` publish.
 *
 * An asset is considered processing when either:
 *   - the asset row is missing (race between link + getAsset),
 *   - `status` is anything other than "ready" (status="processing",
 *     "error", or the initial empty string on a freshly-inserted row),
 *   - `thumbnail_urls` is missing or has zero keys (worker hasn't
 *     written derivatives yet, regardless of what status says).
 *
 * The thumbnail_urls check is the load-bearing one — see the bug
 * traced in the M41 fix session where the worker updated thumbnails
 * and status in two separate UPDATEs, leaving a brief window where a
 * listing fetch could return status="ready" with no thumbnails.
 */
export function assetIsProcessing(asset: {
  status?: string;
  thumbnail_urls?: Record<string, string> | null;
} | null | undefined): boolean {
  if (!asset) return true;
  if (asset.status && asset.status !== "ready") return true;
  const thumbs = asset.thumbnail_urls;
  if (!thumbs || Object.keys(thumbs).length === 0) return true;
  return false;
}

/**
 * Build an absolute, optionally-authenticated URL for a `/storage/*` byte.
 *
 * Two independent auth tokens can be attached, because the storage proxy on
 * the Go API accepts both:
 *
 *   - `token`              → dashboard JWT, appended as `?token=` for the
 *                            owner/workspace-authenticated surfaces.
 *   - `gallerySessionToken`→ S4-G1: the gallery-session token (password- or
 *                            share-PIN-scoped) appended as `?gs=`. REQUIRED for
 *                            protected gallery bytes when the page and the API
 *                            are on different origins (the default split-origin
 *                            deployment): the httpOnly `gallery_session` cookie
 *                            is `SameSite=Strict` on the API origin, so a
 *                            cross-origin <img> request never carries it. The
 *                            `?gs=` query param is the same-origin-independent
 *                            channel the storage proxy reads (see
 *                            cmd/api/main.go authorizeThumbnailByte). For a
 *                            truly same-origin deployment the cookie suffices
 *                            and `gs` is harmlessly redundant.
 *
 * Only ONE of the two should generally be present for a given surface: the
 * dashboard uses `token`; the public viewer uses `gallerySessionToken`.
 */
export function getStorageBackedUrl(
  url: string | undefined | null,
  token?: string | null,
  gallerySessionToken?: string | null,
): string {
  if (!url) return "";

  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  if (url.startsWith("/") && !url.startsWith("/storage/")) {
    return url;
  }

  const storagePath = url.startsWith("/storage/") ? url : `/storage/${url.replace(/^\/+/, "")}`;
  let absoluteUrl = `${API_BASE}${storagePath}`;
  if (!absoluteUrl.includes("/storage/")) {
    return absoluteUrl;
  }

  if (token && !absoluteUrl.includes("token=")) {
    const sep = absoluteUrl.includes("?") ? "&" : "?";
    absoluteUrl = `${absoluteUrl}${sep}token=${encodeURIComponent(token)}`;
  }

  if (gallerySessionToken && !absoluteUrl.includes("gs=")) {
    const sep = absoluteUrl.includes("?") ? "&" : "?";
    absoluteUrl = `${absoluteUrl}${sep}gs=${encodeURIComponent(gallerySessionToken)}`;
  }

  return absoluteUrl;
}

/**
 * Build a preview URL for an asset, selecting the best available thumbnail.
 * Backend `/storage/*` paths must be absolute because images render from the
 * Next.js origin while storage is served by the Go API.
 *
 * Variant preference is WebP-first, then JPG fallback, at the size that
 * matches the canonical render surface (gallery grid tile at ~400px wide on
 * desktop, 1/2/3-column layout). The picker chooses `thumb_md_webp` (600px
 * source) over `thumb_sm_webp` (200px source) because the former scales
 * down cleanly to the tile whereas the latter is upscaled and looks blurry
 * AND triggers an extra render pass once the higher-res variant arrives.
 *
 * Both `thumb_sm_webp` and `thumb_md_webp` live under the public
 * `thumbnails/` storage prefix (see service.webpStorageKey), so neither
 * pays the per-tile JWT validation cost — the auth tax is reserved for
 * the full-res `display_webp` lightbox variant only.
 */
export function getAssetPreviewUrl(
  asset?: {
    thumbnail_urls?: Record<string, string>;
    download_url?: string;
  },
  token?: string | null,
): string {
  if (!asset) return "";

  const variants = asset.thumbnail_urls ?? {};
  const preferred =
    variants.thumb_md_webp ??
    variants.thumb_sm_webp ??
    variants.thumb_md ??
    variants.thumb_sm ??
    variants.thumb_lg;
  const chosen = preferred ?? Object.values(variants)[0] ?? asset.download_url ?? "";
  return getStorageBackedUrl(chosen, token);
}
