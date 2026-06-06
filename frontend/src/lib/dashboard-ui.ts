import { getBrowserApiBaseUrl } from "@/lib/api/base-url";
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
export function assetIsProcessing(
  asset:
    | {
        status?: string;
        thumbnail_urls?: Record<string, string> | null;
      }
    | null
    | undefined,
): boolean {
  if (!asset) return true;
  if (asset.status && asset.status !== "ready") return true;
  const thumbs = asset.thumbnail_urls;
  return !hasWebPDisplayVariant(thumbs);
}

/**
 * Build an absolute URL for a `/storage/*` byte.
 *
 * Dashboard storage auth is cookie/header based: auth handlers set an HttpOnly
 * access-token cookie for browser subresource requests, while fetch callers can
 * still use Authorization. Do not append bearer access tokens to storage URLs.
 *
 * Public protected-gallery bytes carry the short-lived, gallery-scoped
 * `assetAccessToken` as `?at=` (SEC-1, security audit 2026-05-30). This is NOT
 * the durable gallery session (which is header/cookie-only and must never be put
 * in a URL); it is a byte-read-only token with a distinct JWT audience that
 * cannot unlock the gallery or be replayed as a session.
 */
export function getStorageBackedUrl(
  url: string | undefined | null,
  token?: string | null,
  assetAccessToken?: string | null,
): string {
  void token;
  if (!url) return "";

  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }

  if (url.startsWith("/") && !url.startsWith("/storage/")) {
    return url;
  }

  let absoluteUrl = "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const parsed = new URL(url);
      if (!parsed.pathname.startsWith("/storage/")) {
        return url;
      }
      const origin = parsed.hostname.includes(".")
        ? parsed.origin
        : getBrowserApiBaseUrl();
      absoluteUrl = `${origin}${parsed.pathname}${parsed.search}`;
    } catch {
      return url;
    }
  } else {
    const storagePath = url.startsWith("/storage/")
      ? url
      : `/storage/${url.replace(/^\/+/, "")}`;
    absoluteUrl = `${getBrowserApiBaseUrl()}${storagePath}`;
  }

  if (!absoluteUrl.includes("/storage/")) {
    return absoluteUrl;
  }

  try {
    const parsed = new URL(absoluteUrl);
    parsed.searchParams.delete("token");
    parsed.searchParams.delete("access_token");
    absoluteUrl = parsed.toString();
  } catch {
    // Keep the best-effort storage URL if URL parsing is unavailable.
  }

  if (assetAccessToken && !absoluteUrl.includes("at=")) {
    const sep = absoluteUrl.includes("?") ? "&" : "?";
    absoluteUrl = `${absoluteUrl}${sep}at=${encodeURIComponent(assetAccessToken)}`;
  }

  return absoluteUrl;
}

/**
 * Build a preview URL for an asset, selecting the best available thumbnail.
 * Backend `/storage/*` paths must be absolute because images render from the
 * Next.js origin while storage is served by the Go API.
 *
 * Variant preference is WebP-only at the size that matches the canonical render
 * surface (gallery grid tile at ~400px wide on desktop, 1/2/3-column layout).
 * The picker chooses `thumb_md_webp` (600px source) over `thumb_sm_webp`
 * (200px source) because the former scales down cleanly to the tile whereas the
 * latter is upscaled and looks blurry.
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
    variants.thumb_lg_webp ??
    variants.display_webp;
  const chosen = preferred ?? firstWebPVariant(variants) ?? "";
  return getStorageBackedUrl(chosen, token);
}

function hasWebPDisplayVariant(
  variants: Record<string, string> | null | undefined,
): boolean {
  return Boolean(firstWebPVariant(variants ?? {}));
}

function firstWebPVariant(variants: Record<string, string>): string {
  const preferred =
    variants.thumb_md_webp ??
    variants.thumb_sm_webp ??
    variants.thumb_lg_webp ??
    variants.display_webp;
  if (preferred) return preferred;

  for (const [variant, value] of Object.entries(variants)) {
    if (!value) continue;
    const normalizedVariant = variant.toLowerCase();
    const normalizedValue = value.toLowerCase().split("?", 1)[0];
    if (
      normalizedVariant.includes("webp") ||
      normalizedValue.endsWith(".webp") ||
      normalizedValue.endsWith(".webp.enc")
    ) {
      return value;
    }
  }
  return "";
}
