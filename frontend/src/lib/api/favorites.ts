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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/public/galleries/${encodeURIComponent(slug)}/favorites/${encodeURIComponent(assetId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guest_session_id: guestSessionId }),
    },
  );
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
): Promise<void> {
  const url = new URL(
    `${API_BASE}/api/v1/public/galleries/${encodeURIComponent(slug)}/favorites/${encodeURIComponent(assetId)}`,
  );
  url.searchParams.set("session", guestSessionId);

  const res = await fetch(url.toString(), { method: "DELETE" });
  // 204 on success; 204 also when the favorite didn't exist (idempotent).
  if (!res.ok) {
    throw new Error(`Failed to unfavorite: ${res.status}`);
  }
}

export async function listPublicFavoriteAssetIds(
  slug: string,
  guestSessionId: string,
): Promise<string[]> {
  const url = new URL(
    `${API_BASE}/api/v1/public/galleries/${encodeURIComponent(slug)}/favorites`,
  );
  url.searchParams.set("session", guestSessionId);

  const res = await fetch(url.toString());
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
  if (!res.ok) {
    throw new Error(`Failed to load favorites summary: ${res.status}`);
  }
  return res.json();
}
