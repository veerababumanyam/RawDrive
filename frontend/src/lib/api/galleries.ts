import { authFetch } from "@/lib/api/authFetch";
import { getApiBaseUrl } from "@/lib/api/base-url";

const apiUrl = (path: string) => `${getApiBaseUrl()}${path}`;

export interface Gallery {
  id: string;
  workspace_id: string;
  contact_id?: string;
  primary_contact_id?: string;
  project_id?: string;
  event_id?: string;
  deal_id?: string;
  invoice_id?: string;
  title: string;
  slug: string;
  description: string;
  cover_asset_id?: string;
  gallery_type: string;
  is_published: boolean;
  max_selections: number;
  status: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
  archived_at?: string;
  // M13 deferred-FR fields (optional)
  watermark_config?: {
    enabled?: boolean;
    mode?: "text" | "logo" | string;
    text?: string;
    position?: "center" | "tiled" | "bottom-right" | "bottom-left" | "diagonal";
    opacity?: number; // 0.0–1.0
    logo_asset_id?: string;
    logo_url?: string;
  };
  // Face-recognition toggles — both top-level columns on galleries.
  // faceid_enabled (mig 041): clients can use a selfie to find their photos.
  //   Default false.
  // face_detection_enabled (mig 046): face cluster pipeline opt-out at the
  //   gallery level. Default true. Note: an earlier version of the settings
  //   page wrote this nested under `settings` — that path silently no-op'd
  //   because the backend never decoded it. Read/write the top-level field.
  faceid_enabled?: boolean;
  face_detection_enabled?: boolean;
  settings?: Record<string, unknown>;
  // M23: camera tethering (migration 133).
  tethering_enabled?: boolean;
  tether_directory?: string | null;
  // Populated by list endpoint via LEFT JOIN on assets — used for card thumbnails
  cover_thumbnails?: Record<string, string>;
  // M19: Gallery Enhancement Suite (F-009)
  cover_template?: string;
  cover_config?: Record<string, unknown>;
  expires_at?: string;
  download_enabled?: boolean;
  download_quality?: "webp" | "thumbnail" | "original" | string;
  sort_preference?: string;
  whatsapp_template?: string;
  // Gallery Enhancements June 2026: optional slideshow background-music asset.
  music_asset_id?: string | null;
  // Gallery Enhancements June 2026: branded client email automation toggle (default true).
  email_automation_enabled?: boolean;
  // S4-G3 locked-shell fields. When a private/invite-only gallery is requested
  // without a valid session, GET /public/galleries/{slug} returns ONLY a
  // minimal shell: { id, title, access_mode, access_gated:true, has_password }.
  // `access_mode` is also present on the full payload (the gallery's configured
  // access mode). The viewer renders a locked state from these instead of a
  // broken empty grid.
  access_mode?: "public" | "unlisted" | "private" | "invite-only" | string;
  access_gated?: boolean;
  has_password?: boolean;
}

/**
 * The subset of WorkspaceProfile that the share-URL helper needs.
 * Decoupled from the full WorkspaceProfile type to avoid a circular
 * import (workspace-profile.ts ↔ galleries.ts).
 */
export interface WorkspaceShareIdentity {
  business_profile_slug?: string | null;
  business_unique_code?: string | null;
}

/**
 * Canonical public URL a photographer would share for a gallery.
 *
 * Shape (migration 121, the current scheme):
 *   https://<business_profile_slug>-<business_unique_code>.rawdrive.in/<gallery.slug>
 *
 * Both halves of the subdomain come from the workspace, not the gallery.
 * One workspace = one permanent subdomain; galleries are paths under it.
 *
 * Fallback (`workspace` arg missing or missing identity fields): legacy
 * /g/{slug} on the brand domain — preserves working URLs for any caller
 * that doesn't have the workspace in hand yet (e.g. early-mount before
 * workspace profile loads), and for galleries created in workspaces that
 * pre-date the migration 121 backfill (should be zero in practice).
 *
 * Local dashboards must stay same-origin. A localhost gallery/share token
 * only exists in the local API, so pointing the copied link at production
 * rawdrive.in makes UAT links look broken.
 */
export function galleryPublicUrl(
  gallery: Pick<Gallery, "slug">,
  workspace?: WorkspaceShareIdentity | null,
  originOverride?: string,
): string {
  const bizSlug = workspace?.business_profile_slug || "";
  const bizCode = workspace?.business_unique_code || "";
  const browserOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const origin = originOverride || browserOrigin;

  // Rawdrive.in is stable enough to inline — if the brand domain ever
  // changes, the design-tokens.json sync process catches it and the build
  // would fail loudly.
  const BASE_DOMAIN = "rawdrive.in";

  if (origin && isLocalShareOrigin(origin)) {
    return `${origin}/g/${gallery.slug}`;
  }

  if (bizSlug && bizCode && gallery.slug) {
    return `https://${bizSlug}-${bizCode}.${BASE_DOMAIN}/${gallery.slug}`;
  }

  // Legacy fallback — /g/{slug} on whichever origin the user is viewing.
  if (origin) {
    return `${origin}/g/${gallery.slug}`;
  }
  return `/g/${gallery.slug}`;
}

function isLocalShareOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export interface GalleryWorkspaceContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface GalleryWorkspaceSection {
  key: string;
  label: string;
  href: string;
}

export interface GalleryWorkspaceSummary {
  gallery: Gallery;
  primary_contact?: GalleryWorkspaceContact | null;
  lifecycle_state: string;
  relationships: {
    contact_id?: string | null;
    primary_contact_id?: string | null;
    project_id?: string | null;
    event_id?: string | null;
    deal_id?: string | null;
    invoice_id?: string | null;
  };
  sections: GalleryWorkspaceSection[];
}

export interface GalleryRelationshipPayload {
  contact_id?: string | null;
  primary_contact_id?: string | null;
  project_id?: string | null;
  event_id?: string | null;
  deal_id?: string | null;
  invoice_id?: string | null;
}

// GAL-FR-115: plan-aware white-label branding response
export interface GalleryBranding {
  tier_slug: string;
  can_customize: boolean;
  brand_name: string;
  logo_url?: string | null;
  logo_asset_id?: string | null;
  accent_color?: string | null;
  hide_footer: boolean;
  public_branding_enabled?: boolean;
}

export interface PublicStudioProfile {
  id: string;
  name: string;
  display_name: string;
  brand_name?: string;
  brand_accent_color?: string;
  public_branding_enabled: boolean;
  can_customize: boolean;
  tier_slug: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo_url?: string | null;
  business_profile_slug: string;
  business_unique_code: string;
  business_subdomain: string;
  public_url: string;
}

export interface PublicStudioGallery {
  id: string;
  title: string;
  slug: string;
  description: string;
  gallery_type: string;
  cover_thumbnails?: Record<string, string>;
  created_at: string;
  published_at?: string;
  download_enabled: boolean;
  public_url: string;
}

export interface PublicStudioLanding {
  studio: PublicStudioProfile;
  galleries: PublicStudioGallery[];
  counts: {
    published_galleries: number;
  };
}

function appendQueryParam(
  path: string,
  key: string,
  value?: string | null,
): string {
  if (!value) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${key}=${encodeURIComponent(value)}`;
}

// withPublicGalleryScope appends public-gallery lookup scope to API URLs.
// `ws` keeps per-business subdomain requests strictly workspace-scoped. `share`
// is only forwarded on first-touch share landings so the backend can recover a
// gallery from a stale copied `ws` and mint a durable gallery session.
function withPublicGalleryScope(
  path: string,
  ws?: string | null,
  shareToken?: string | null,
): string {
  return appendQueryParam(
    appendQueryParam(path, "ws", ws),
    "share",
    shareToken,
  );
}

function gallerySessionHeaders(
  sessionToken?: string | null,
): HeadersInit | undefined {
  return sessionToken ? { "X-Gallery-Session": sessionToken } : undefined;
}

function fetchWithGallerySession(
  url: string,
  sessionToken?: string | null,
  init?: RequestInit,
): Promise<Response> {
  const headers = gallerySessionHeaders(sessionToken);
  if (!headers) return init ? fetch(url, init) : fetch(url);
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      ...headers,
    },
  });
}

export async function getPublicStudioLanding(
  subdomain: string,
): Promise<PublicStudioLanding> {
  const res = await fetch(
    apiUrl(`/api/v1/public/studios/${encodeURIComponent(subdomain)}`),
  );
  if (!res.ok) throw new Error(`Studio not found: ${res.status}`);
  return res.json();
}

export async function getPublicGalleryBranding(
  slug: string,
  ws?: string | null,
  shareToken?: string | null,
  sessionToken?: string | null,
): Promise<GalleryBranding> {
  const res = await fetchWithGallerySession(
    apiUrl(
      withPublicGalleryScope(
        `/api/v1/public/galleries/${slug}/branding`,
        ws,
        shareToken,
      ),
    ),
    sessionToken,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Failed to get branding: ${res.status}`);
  return res.json();
}

// Gallery Enhancements June 2026 — slideshow background music.
//
// Upload routes the audio through the normal asset-ingest path (POST
// /api/v1/assets), so it lands in the workspace's managed B2 storage and its
// bytes are counted against the workspace storage quota (a 403 surfaces the
// quota error). The created asset is then referenced on the gallery via
// music_asset_id (validated server-side to be an audio asset in the workspace).
export async function uploadGalleryMusic(
  token: string,
  galleryId: string,
  file: File,
): Promise<Gallery> {
  void token;
  const form = new FormData();
  form.append("file", file);
  const uploadRes = await authFetch(`/api/v1/assets`, {
    method: "POST",
    body: form,
  });
  if (!uploadRes.ok) {
    const err = await uploadRes
      .json()
      .catch(() => ({}) as Record<string, unknown>);
    throw new Error(
      (err.message as string) ||
        (err.error as string) ||
        `Failed to upload music: ${uploadRes.status}`,
    );
  }
  const uploadBody = await uploadRes.json();
  const asset = uploadBody.asset ?? uploadBody.Asset ?? uploadBody;
  return updateGallerySettings(token, galleryId, { music_asset_id: asset.id });
}

// Clears the gallery's slideshow music reference. The underlying audio asset is
// left in place (freed by the normal asset-delete/quota path if removed).
export async function clearGalleryMusic(
  token: string,
  galleryId: string,
): Promise<Gallery> {
  return updateGallerySettings(token, galleryId, { music_asset_id: null });
}

// Public URL that streams the gallery's background-music asset through the API.
// Mirrors the image-bytes pattern: `?ws=` scopes the per-business subdomain
// lookup, and `?at=` carries the short-lived, gallery-scoped asset-access token
// for gated galleries (SEC-1: an <audio> element cannot send the
// X-Gallery-Session header, and the durable session must never go in a URL).
export function publicGalleryMusicUrl(
  slug: string,
  ws?: string | null,
  assetAccessToken?: string | null,
  shareToken?: string | null,
): string {
  let path = withPublicGalleryScope(
    `/api/v1/public/galleries/${slug}/music`,
    ws,
    shareToken,
  );
  if (assetAccessToken) {
    const sep = path.includes("?") ? "&" : "?";
    path = `${path}${sep}at=${encodeURIComponent(assetAccessToken)}`;
  }
  return apiUrl(path);
}

// GAL-FR-107/108: FaceID gallery entry
export interface FaceMatchResult {
  gallery_id: string;
  asset_ids: string[];
  match_count: number;
  threshold: number;
  fallback_available: boolean;
}

export async function postFaceMatch(
  slug: string,
  embedding: number[],
  consentGiven: boolean,
  threshold?: number,
): Promise<FaceMatchResult> {
  const res = await fetch(
    apiUrl(`/api/v1/public/galleries/${slug}/face-match`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embedding,
        consent_given: consentGiven,
        threshold,
      }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "face match failed" }));
    throw new Error(err.error || `face match ${res.status}`);
  }
  return res.json();
}

// GAL-FR-112: share link verification with access-count enforcement
// Calls POST /api/v1/public/share/{token}/verify. The backend atomically
// increments access_count under the max_access_count predicate and returns
// 403 access_limit_exceeded when a capped link is exhausted. Currently the
// password-gate flow uses verifyGalleryPassword (slug-based) so this helper
// is used only by PIN-gated share link entry, which is wired on a per-
// deployment basis by studios linking to /g/{slug}?share={token}.
export async function verifyShareLink(
  token: string,
  credential?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const res = await fetch(apiUrl(`/api/v1/public/share/${token}/verify`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential: credential || "" }),
  });
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}));
  return { ok: false, reason: body.error || `http_${res.status}` };
}

export interface GalleryShareLink {
  id: string;
  gallery_id: string;
  token: string;
  expires_at?: string | null;
  permissions: {
    access_mode?: "public" | "pin" | "password" | "email" | string;
    allowed_emails?: string[];
    recipient_emails?: string[];
    message?: string;
    channel?: string;
    [key: string]: unknown;
  };
  download_allowed: boolean;
  max_access_count?: number | null;
  access_count: number;
  created_at: string;
  revoked_at?: string | null;
}

export interface CreateGalleryShareLinkInput {
  access_mode?: "public" | "pin" | "password" | "email";
  pin?: string;
  expiry_days?: number;
  download_allowed?: boolean;
  max_access_count?: number;
  allowed_emails?: string[];
  recipient_emails?: string[];
  message?: string;
  channel?: "copy" | "whatsapp" | "email" | string;
}

export async function listGalleryShareLinks(
  _token: string,
  galleryId: string,
): Promise<GalleryShareLink[]> {
  const res = await authFetch(`/api/v1/galleries/${galleryId}/share`);
  if (!res.ok)
    throw new Error(`Failed to list gallery share links: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.links)) return body.links;
  return [];
}

export async function createGalleryShareLink(
  _token: string,
  galleryId: string,
  data: CreateGalleryShareLinkInput,
): Promise<GalleryShareLink> {
  const res = await authFetch(`/api/v1/galleries/${galleryId}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok)
    throw new Error(`Failed to create gallery share link: ${res.status}`);
  return res.json();
}

export async function revokeGalleryShareLink(
  _token: string,
  galleryId: string,
  linkId: string,
): Promise<void> {
  const res = await authFetch(
    `/api/v1/galleries/${galleryId}/share/${linkId}`,
    { method: "DELETE" },
  );
  if (!res.ok)
    throw new Error(`Failed to revoke gallery share link: ${res.status}`);
}

export interface GalleryAsset {
  id: string;
  gallery_id: string;
  asset_id: string;
  sort_order: number;
  is_hero: boolean;
}

export interface GalleryAlbum {
  id: string;
  gallery_id: string;
  parent_id?: string;
  name: string;
  description?: string;
  cover_asset_id?: string;
  position: number;
  smart_filter?: Record<string, unknown>;
  asset_count?: number;
  created_at?: string;
  updated_at?: string;
  // F-091: populated only when listGalleryAlbums is called with
  // { includeAssetIds: true } (?include_asset_ids=true) — the album's member
  // asset IDs, inline, so callers avoid a per-album listAlbumAssets fan-out.
  asset_ids?: string[];
}

export interface AlbumAsset {
  album_id: string;
  asset_id: string;
  position: number;
  added_at: string;
}

export async function listGalleries(
  _token: string,
  params?: { status?: string; type?: string; search?: string },
): Promise<Gallery[]> {
  const query = new URLSearchParams(
    params as Record<string, string>,
  ).toString();
  const res = await authFetch(`/api/v1/galleries?${query}`);
  if (!res.ok) throw new Error(`Failed to list galleries: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.galleries)) return body.galleries;
  return [];
}

export async function getGallery(_token: string, id: string): Promise<Gallery> {
  const res = await authFetch(`/api/v1/galleries/${id}`);
  if (!res.ok) throw new Error(`Failed to get gallery: ${res.status}`);
  return res.json();
}

export async function createGallery(
  _token: string,
  data: {
    title: string;
    description?: string;
    gallery_type?: string;
    tethering_enabled?: boolean;
    tether_directory?: string | null;
  } & GalleryRelationshipPayload,
): Promise<Gallery> {
  const res = await authFetch(`/api/v1/galleries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok)
    throw new Error(
      await galleryApiErrorMessage(res, "Failed to create gallery"),
    );
  return res.json();
}

async function galleryApiErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  let detail = "";
  try {
    const body = await res.clone().json();
    if (body && typeof body.error === "string") {
      detail = body.error;
    } else if (body && typeof body.message === "string") {
      detail = body.message;
    }
  } catch {
    try {
      detail = (await res.text()).trim();
    } catch {
      detail = "";
    }
  }
  if (!detail) return `${fallback}: ${res.status}`;
  return `${fallback}: ${detail} (${res.status})`;
}

export async function updateGallery(
  _token: string,
  id: string,
  data: Partial<Gallery>,
): Promise<Gallery> {
  const res = await authFetch(`/api/v1/galleries/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update gallery: ${res.status}`);
  return res.json();
}

export async function linkGalleryRelationships(
  _token: string,
  id: string,
  data: GalleryRelationshipPayload,
): Promise<Gallery> {
  const res = await authFetch(`/api/v1/galleries/${id}/client-link`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok)
    throw new Error(`Failed to link gallery relationships: ${res.status}`);
  return res.json();
}

export async function getGalleryWorkspaceSummary(
  _token: string,
  id: string,
): Promise<GalleryWorkspaceSummary> {
  const res = await authFetch(`/api/v1/galleries/${id}/workspace-summary`);
  if (!res.ok)
    throw new Error(`Failed to get gallery workspace: ${res.status}`);
  return res.json();
}

export async function duplicateGallery(
  token: string,
  id: string,
  title?: string,
): Promise<Gallery> {
  const res = await fetch(apiUrl(`/api/v1/galleries/${id}/duplicate`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to duplicate gallery: ${res.status}`);
  return res.json();
}

export async function duplicateGalleryAuth(
  id: string,
  title?: string,
): Promise<Gallery> {
  const res = await authFetch(`/api/v1/galleries/${id}/duplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to duplicate gallery: ${res.status}`);
  return res.json();
}

export async function updateGalleryCover(
  _token: string,
  id: string,
  data: {
    asset_id?: string | null;
    cover_asset_id?: string | null;
    focal_point?: { x: number; y: number };
    aspect_ratio?: string;
    template?: string;
    template_config?: Record<string, unknown>;
    config?: Record<string, unknown>;
  },
): Promise<void> {
  const { cover_asset_id, config, ...rest } = data;
  const body = {
    ...rest,
    asset_id: data.asset_id ?? cover_asset_id ?? undefined,
    template_config: data.template_config ?? config,
  };
  const res = await authFetch(`/api/v1/galleries/${id}/cover`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to update gallery cover: ${res.status}`);
}

export async function updateGalleryDesign(
  _token: string | null,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const res = await authFetch(`/api/v1/galleries/${id}/design`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok)
    throw new Error(`Failed to update gallery design: ${res.status}`);
}

export async function deleteGallery(_token: string, id: string): Promise<void> {
  const res = await authFetch(`/api/v1/galleries/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete gallery: ${res.status}`);
}

export async function addAssetToGallery(
  _token: string,
  galleryId: string,
  assetId: string,
  sortOrder: number,
): Promise<void> {
  const res = await authFetch(`/api/v1/galleries/${galleryId}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asset_id: assetId, sort_order: sortOrder }),
  });
  if (!res.ok) throw new Error(`Failed to add asset: ${res.status}`);
}

export async function listGalleryAssets(
  _token: string,
  galleryId: string,
): Promise<GalleryAsset[]> {
  const res = await authFetch(`/api/v1/galleries/${galleryId}/assets`);
  if (!res.ok) throw new Error(`Failed to list gallery assets: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.assets)) return body.assets;
  return [];
}

export async function listGalleryAlbums(
  _token: string,
  galleryId: string,
  opts?: { includeAssetIds?: boolean },
): Promise<GalleryAlbum[]> {
  const qs = opts?.includeAssetIds ? "?include_asset_ids=true" : "";
  const res = await authFetch(`/api/v1/galleries/${galleryId}/albums${qs}`);
  if (!res.ok) throw new Error(`Failed to list albums: ${res.status}`);
  const body = await res.json();
  const raw: GalleryAlbum[] = Array.isArray(body)
    ? body
    : body && Array.isArray(body.data)
      ? body.data
      : [];
  // 2026-05-18: "RAW" smart album was retired (seed dropped in
  // backend/internal/service/album_service.go::UtilityAlbums) because
  // the gallery only serves WebP derivatives — a guest filter for raw
  // camera files surfaced nothing they could open. Historical galleries
  // still have a "RAW" album row in the DB; filter it client-side so
  // the chip stays hidden without a backend data migration. Drop only
  // when name === "RAW" exactly so a user-created album named e.g.
  // "Raw selects" or "BTS raw" survives the filter.
  return raw.filter((a) => a.name !== "RAW");
}

export async function createGalleryAlbum(
  _token: string,
  galleryId: string,
  data: { name: string; description?: string; parent_id?: string },
): Promise<GalleryAlbum> {
  const res = await authFetch(`/api/v1/galleries/${galleryId}/albums`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create album: ${res.status}`);
  const body = await res.json();
  return body.data ?? body;
}

export async function updateGalleryAlbum(
  _token: string,
  albumId: string,
  data: { name?: string; description?: string },
): Promise<GalleryAlbum> {
  const res = await authFetch(`/api/v1/albums/${albumId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update album: ${res.status}`);
  const body = await res.json();
  return body.data ?? body;
}

export async function deleteGalleryAlbum(
  _token: string,
  albumId: string,
): Promise<void> {
  const res = await authFetch(`/api/v1/albums/${albumId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete album: ${res.status}`);
}

export async function listAlbumAssets(
  _token: string,
  albumId: string,
): Promise<AlbumAsset[]> {
  const res = await authFetch(`/api/v1/albums/${albumId}/assets`);
  if (!res.ok) throw new Error(`Failed to list album assets: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.data)) return body.data;
  return [];
}

export async function addAlbumAssets(
  _token: string,
  albumId: string,
  assetIds: string[],
): Promise<void> {
  const res = await authFetch(`/api/v1/albums/${albumId}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asset_ids: assetIds }),
  });
  if (!res.ok) throw new Error(`Failed to add album assets: ${res.status}`);
}

export async function deleteAlbum(
  _token: string,
  albumId: string,
): Promise<void> {
  const res = await authFetch(`/api/v1/albums/${albumId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete album: ${res.status}`);
}

export interface PublicGalleryFetchResult {
  gallery: Gallery;
  gallerySessionToken: string | null;
}

export async function getPublicGalleryWithSession(
  slug: string,
  ws?: string | null,
  sessionToken?: string | null,
  shareToken?: string | null,
): Promise<PublicGalleryFetchResult> {
  // Forward the gallery-session token (when present) so a private/invite-only
  // gallery returns its FULL payload to a session-holder instead of the S4-G3
  // locked shell ({ access_gated: true, ... }). Sent as the X-Gallery-Session
  // header — this is a server-side fetch so CORS exposure rules don't apply.
  const res = await fetchWithGallerySession(
    apiUrl(
      withPublicGalleryScope(
        `/api/v1/public/galleries/${slug}`,
        ws,
        shareToken,
      ),
    ),
    sessionToken,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Gallery not found: ${res.status}`);
  const mintedSessionToken =
    typeof res.headers?.get === "function"
      ? res.headers.get("X-Gallery-Session")
      : null;
  return {
    gallery: await res.json(),
    gallerySessionToken: mintedSessionToken,
  };
}

export async function getPublicGallery(
  slug: string,
  ws?: string | null,
  sessionToken?: string | null,
  shareToken?: string | null,
): Promise<Gallery> {
  const result = await getPublicGalleryWithSession(
    slug,
    ws,
    sessionToken,
    shareToken,
  );
  return result.gallery;
}

export interface PublicAsset {
  id: string;
  filename: string;
  content_type: string;
  width?: number;
  height?: number;
  blurhash?: string;
  thumbnail_urls: Record<string, string>;
  is_encrypted?: boolean;
  media_encryption?: Record<string, unknown>;
  sort_order: number;
}

// ── Gallery Settings ──────────────────────────────────────────────
export async function updateGallerySettings(
  _token: string,
  galleryId: string,
  settings: Record<string, unknown>,
): Promise<Gallery> {
  const res = await authFetch(`/api/v1/galleries/${galleryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok)
    throw new Error(`Failed to update gallery settings: ${res.status}`);
  return res.json();
}

// ── AI Face Scan ──────────────────────────────────────────────────
export async function triggerFaceScan(
  token: string,
  galleryId: string,
): Promise<{ job_id: string }> {
  const res = await fetch(
    apiUrl(`/api/v1/galleries/${galleryId}/ai/scan-faces`),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) throw new Error(`Failed to trigger face scan: ${res.status}`);
  return res.json();
}

export async function getFaceScanStatus(
  token: string,
  galleryId: string,
): Promise<{
  status: string;
  processed: number;
  total: number;
  faces_found: number;
}> {
  const res = await fetch(
    apiUrl(`/api/v1/galleries/${galleryId}/ai/scan-status`),
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) throw new Error(`Failed to get scan status: ${res.status}`);
  return res.json();
}

// Shape returned by GET /api/v1/public/galleries/{slug}/albums.
// Includes the per-album asset count so the public chip strip can render
// numbers like "Favorites 2" without an N+1 round trip.
export interface PublicGalleryAlbum {
  id: string;
  name: string;
  asset_count: number;
  is_smart: boolean;
  position: number;
}

// Fetch the album/sub-gallery list for the public viewer. Used to render
// the filter chip strip between the hero and the asset grid. Returns an
// empty array on any failure (404 / 5xx / network) so the public page
// degrades gracefully to the All-Photos-only view rather than blowing up.
export async function getPublicGalleryAlbums(
  slug: string,
  ws?: string | null,
  sessionToken?: string | null,
  shareToken?: string | null,
): Promise<PublicGalleryAlbum[]> {
  try {
    const res = await fetchWithGallerySession(
      apiUrl(
        withPublicGalleryScope(
          `/api/v1/public/galleries/${slug}/albums`,
          ws,
          shareToken,
        ),
      ),
      sessionToken,
      { cache: "no-store" },
    );
    if (!res.ok) return [];
    const body = await res.json();
    const raw: PublicGalleryAlbum[] = Array.isArray(body) ? body : [];
    // Match the dashboard-side filter in listGalleryAlbums — the "RAW"
    // smart album was retired 2026-05-18. Guests never had a use for it
    // (every served asset is WebP). Drop only the exact "RAW" name so
    // a photographer's own album titled e.g. "Raw edits" still appears.
    return raw.filter((a) => a.name !== "RAW");
  } catch {
    return [];
  }
}

export async function getPublicGalleryAssets(
  slug: string,
  albumId?: string,
  ws?: string | null,
  sessionToken?: string | null,
  shareToken?: string | null,
): Promise<PublicAsset[]> {
  const path = albumId
    ? `/api/v1/public/galleries/${slug}/albums/${albumId}/assets`
    : `/api/v1/public/galleries/${slug}/assets`;
  const res = await fetchWithGallerySession(
    apiUrl(withPublicGalleryScope(path, ws, shareToken)),
    sessionToken,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Failed to list public assets: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.publicassets)) return body.publicassets;
  return [];
}
