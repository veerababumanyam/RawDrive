import { getApiBaseUrl } from "@/lib/api/base-url";
/**
 * Public gallery favorites API client. Pairs with the M41/105 backend:
 * 3 anonymous endpoints (scoped by guest_session_id) for the lightbox
 * Star button, plus 1 owner-auth endpoint for the dashboard Favorites
 * tile aggregation.
 *
 * Wire format:
 *   POST   /api/v1/public/galleries/{slug}/favorites/{assetId}
 *          body: { guest_session_id: string }
 *   DELETE /api/v1/public/galleries/{slug}/favorites/{assetId}?session=<id>
 *   GET    /api/v1/public/galleries/{slug}/favorites?session=<id>
 *          → { asset_ids: string[] }
 *   GET    /api/v1/galleries/{id}/favorites           (owner JWT)
 *          → GalleryFavoritesSummary
 *
 * The public 3 are anonymous — guest_session_id is a UUID minted client-side
 * (see GUEST_SESSION_STORAGE_KEY in public-gallery-grid.tsx). The owner
 * endpoint uses the authFetch helper to attach the JWT automatically.
 */

import { authFetch } from "@/lib/api/authFetch";

const API_BASE = getApiBaseUrl();

function gallerySessionHeaders(gallerySessionToken?: string | null): Record<string, string> {
  return gallerySessionToken ? { "X-Gallery-Session": gallerySessionToken } : {};
}

function publicFavoritesUrl(slug: string, assetId?: string, workspaceScope?: string | null): URL {
  const encodedSlug = encodeURIComponent(slug);
  const path = assetId
    ? `/api/v1/public/galleries/${encodedSlug}/favorites/${encodeURIComponent(assetId)}`
    : `/api/v1/public/galleries/${encodedSlug}/favorites`;
  const url = new URL(`${API_BASE}${path}`);
  if (workspaceScope) url.searchParams.set("ws", workspaceScope);
  return url;
}

export interface GalleryFavoriteByAsset {
  asset_id: string;
  count: number;
}

export interface GalleryFavoritesSummary {
  gallery_id: string;
  total_favorites: number;
  unique_assets_count: number;
  unique_sessions: number;
  by_asset: GalleryFavoriteByAsset[];
}

// ──────────────────────── Public anonymous endpoints ────────────────────────

export async function addPublicFavorite(
  slug: string,
  assetId: string,
  guestSessionId: string,
  gallerySessionToken?: string | null,
  workspaceScope?: string | null,
): Promise<void> {
  const res = await fetch(publicFavoritesUrl(slug, assetId, workspaceScope).toString(), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...gallerySessionHeaders(gallerySessionToken),
    },
    body: JSON.stringify({ guest_session_id: guestSessionId }),
  });
  // Idempotent on the server side — 201 on first call, also 201 on re-favorite.
  // Anything other than 2xx surfaces an error so the caller can fall back to
  // localStorage-only mode and tell the user the toggle didn't sync.
  if (!res.ok) {
    throw new Error(`Failed to favorite: ${res.status}`);
  }
}

export async function removePublicFavorite(
  slug: string,
  assetId: string,
  guestSessionId: string,
  gallerySessionToken?: string | null,
  workspaceScope?: string | null,
): Promise<void> {
  const url = publicFavoritesUrl(slug, assetId, workspaceScope);
  url.searchParams.set("session", guestSessionId);

  const res = await fetch(url.toString(), {
    method: "DELETE",
    credentials: "include",
    headers: gallerySessionHeaders(gallerySessionToken),
  });
  // 204 on success; 204 also when the favorite didn't exist (idempotent).
  if (!res.ok) {
    throw new Error(`Failed to unfavorite: ${res.status}`);
  }
}

export async function listPublicFavoriteAssetIds(
  slug: string,
  guestSessionId: string,
  gallerySessionToken?: string | null,
  workspaceScope?: string | null,
): Promise<string[]> {
  const url = publicFavoritesUrl(slug, undefined, workspaceScope);
  url.searchParams.set("session", guestSessionId);

  const res = await fetch(url.toString(), {
    credentials: "include",
    headers: gallerySessionHeaders(gallerySessionToken),
  });
  if (!res.ok) {
    throw new Error(`Failed to list favorites: ${res.status}`);
  }
  const body = await res.json();
  return Array.isArray(body?.asset_ids) ? body.asset_ids : [];
}

// ──────────────────────── Owner aggregation ────────────────────────

export async function getGalleryFavoritesSummary(
  _token: string,
  galleryId: string,
): Promise<GalleryFavoritesSummary> {
  const res = await authFetch(`/api/v1/galleries/${galleryId}/favorites`);
  if (res.status === 404) {
    return {
      gallery_id: galleryId,
      total_favorites: 0,
      unique_assets_count: 0,
      unique_sessions: 0,
      by_asset: [],
    };
  }
  if (!res.ok) {
    throw new Error(`Failed to load favorites summary: ${res.status}`);
  }
  return res.json();
}
