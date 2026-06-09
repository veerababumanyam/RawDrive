import { authFetch } from "@/lib/api/authFetch";
import { getApiBaseUrl, getBrowserApiBaseUrl } from "@/lib/api/base-url";
import type { Asset } from "@/lib/api/assets";
import type { GalleryBanner, GalleryProduct } from "@/lib/api/commerce";

const apiUrl = (path: string) => `${getApiBaseUrl()}${path}`;
const browserApiUrl = (path: string) => `${getBrowserApiBaseUrl()}${path}`;

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
    mode?: "text" | "logo" | "both" | string;
    text?: string;
    position?:
      | "center"
      | "tiled"
      | "top-right"
      | "top-left"
      | "bottom-right"
      | "bottom-left"
      | "diagonal"
      | "custom"
      | string;
    opacity?: number; // 0.0–1.0
    scale?: number;
    placement?: { x?: number; y?: number };
    layers?: {
      logo?: {
        position?: string;
        opacity?: number;
        scale?: number;
        placement?: { x?: number; y?: number };
      };
      text?: {
        position?: string;
        opacity?: number;
        scale?: number;
        placement?: { x?: number; y?: number };
      };
    };
    logo_source?: "business_profile" | "custom" | string;
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
  // Lightweight effective cover asset from the list endpoint. Avoids fetching
  // one asset per gallery card when the API has already joined cover metadata.
  cover_asset?: {
    id: string;
    filename?: string;
    content_type?: string;
    status?: string;
    thumbnail_urls?: Record<string, string>;
    is_encrypted?: boolean;
    media_encryption?: Record<string, unknown>;
  };
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
  access_role?: "owner" | "shared" | string;
  owner_workspace_id?: string;
  owner_workspace_name?: string;
  storage_billed_to_workspace_id?: string;
  storage_billed_to_workspace_name?: string;
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
 * Shape:
 *   https://rawdrive.in/g/<gallery.slug>
 *
 * Workspace subdomains are deprecated and must not be generated for production
 * share links. The workspace argument remains accepted for call-site
 * compatibility, but it no longer affects the canonical URL.
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
  void workspace;
  const browserOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const origin = originOverride || browserOrigin;

  // rawdrive.in is stable enough to inline — if the brand domain ever
  // changes, the design-tokens.json sync process catches it and the build
  // would fail loudly.
  const BASE_DOMAIN = "rawdrive.in";

  if (origin && isLocalShareOrigin(origin)) {
    return `${origin}/g/${gallery.slug}`;
  }

  return `https://${BASE_DOMAIN}/g/${gallery.slug}`;
}

function isLocalShareOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
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
  gallery_branding_defaults?: {
    logo_placement?:
      | "hidden"
      | "top-left"
      | "top-right"
      | "bottom-left"
      | "bottom-right";
    monogram?: string;
    watermark_style?: "none" | "subtle-corner" | "center-mark" | "tiled";
    logo_size?: number;
    logo_opacity?: number;
    watermark_text?: string;
    watermark_opacity?: number;
  } | null;
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
// `ws` is retained only for legacy/session-scoped requests; generated public
// gallery URLs always use the apex `/g/<slug>` shape. `share` is only forwarded
// on first-touch share landings so the backend can mint a durable gallery
// session.
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

// publicGalleryRetryBackoffMs is the tiny delay before the single retry of a
// transient (5xx / network) public-gallery fetch. Kept short so SSR latency is
// barely affected; long enough to clear a momentary DB blip or rolling-restart
// window on the backend (issue #179).
const publicGalleryRetryBackoffMs = 150;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// fetchPublicGalleryOnce performs a single gallery-session-scoped fetch with no
// retry. The retry policy lives in fetchWithGallerySession so it wraps every
// public fetcher that shares this helper.
function fetchPublicGalleryOnce(
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

// fetchWithGallerySession fetches a public-gallery endpoint and retries ONCE on a
// transient failure — a 5xx response (the backend now answers 503 on a transient
// share-link/DB blip, issue #179) or a thrown network error — after a short
// backoff. It deliberately does NOT retry on a 4xx (401/403/404/410 are genuine,
// permanent answers: missing session, denied, not-found, expired) so those fail
// fast and the caller renders the correct terminal state. Combined with the
// backend's 503-on-transient, a momentary blip self-heals instead of surfacing
// as a hard SSR 500.
async function fetchWithGallerySession(
  url: string,
  sessionToken?: string | null,
  init?: RequestInit,
): Promise<Response> {
  try {
    const res = await fetchPublicGalleryOnce(url, sessionToken, init);
    // Only a server-side (5xx) failure is retryable. 4xx is a genuine,
    // permanent answer — return it unchanged so the caller fails fast.
    if (res.status < 500) return res;
    await delay(publicGalleryRetryBackoffMs);
    return await fetchPublicGalleryOnce(url, sessionToken, init);
  } catch {
    // Network error / fetch threw — retry once after a backoff. If the retry
    // also throws, let it propagate to the caller's existing error handling.
    await delay(publicGalleryRetryBackoffMs);
    return await fetchPublicGalleryOnce(url, sessionToken, init);
  }
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

// Gallery Enhancements June 2026 — workspace music library + per-gallery
// slideshow track.
//
// A workspace owns a LIBRARY of audio tracks (GET/DELETE /api/v1/music). Each
// track is an asset uploaded through the normal asset-ingest path (POST
// /api/v1/assets), so it lands in the workspace's managed B2 storage and its
// bytes count against the workspace storage quota (a 403 surfaces the quota
// error). A gallery then SELECTS one library track via its music_asset_id
// (validated server-side to be an audio asset in the workspace).

// One audio track in the workspace music library.
export interface MusicTrack {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

// Lists the workspace's audio library (newest first), as returned by
// GET /api/v1/music → { tracks: [...] }.
export async function listMusicLibrary(_token: string): Promise<MusicTrack[]> {
  const res = await authFetch(`/api/v1/music`);
  if (!res.ok) throw new Error(`Failed to list music library: ${res.status}`);
  const body = await res.json();
  return body?.tracks ?? [];
}

// Uploads ONE audio file into the workspace storage via the normal asset-ingest
// path. Returns the created asset id. Does NOT bind the track to any gallery —
// callers select it for a gallery separately via selectGalleryMusic.
export async function uploadMusicTrack(
  _token: string,
  file: File,
): Promise<{ id: string }> {
  const form = new FormData();
  form.append("file", file);
  // Tag the upload as a music-library track so the backend stores it in the
  // dedicated per-workspace {ws}/music/ storage sub-folder (isolated from photo
  // assets). Only the literal "music" is recognised server-side.
  form.append("purpose", "music");
  const res = await authFetch(`/api/v1/assets`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}) as Record<string, unknown>);
    throw new Error(
      (err.message as string) ||
        (err.error as string) ||
        `Failed to upload music: ${res.status}`,
    );
  }
  const body = await res.json();
  const asset = body.asset ?? body.Asset ?? body;
  return { id: asset.id };
}

// Fetches the authed audio bytes for a library track and returns an object URL
// suitable for an <audio src>. An <audio> element cannot send the Bearer
// header itself, so we fetch the bytes via authFetch, wrap them in a Blob, and
// hand back a blob: URL. The CALLER owns the URL and MUST revoke it
// (URL.revokeObjectURL) when the preview stops or the component unmounts.
export async function fetchMusicTrackBlobUrl(
  _token: string,
  id: string,
): Promise<string> {
  const res = await authFetch(`/api/v1/assets/${id}/download`);
  if (!res.ok) throw new Error(`Failed to load track: ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// Soft-deletes a library track (DELETE /api/v1/music/{id} → 204). The backend
// reclaims its quota and clears it from any gallery that selected it.
export async function deleteMusicTrack(
  _token: string,
  id: string,
): Promise<void> {
  const res = await authFetch(`/api/v1/music/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete music track: ${res.status}`);
}

// Selects (or clears, when assetId is null) the per-gallery slideshow track.
// Thin wrapper over updateGallerySettings's music_asset_id field.
export async function selectGalleryMusic(
  token: string,
  galleryId: string,
  assetId: string | null,
): Promise<Gallery> {
  return updateGallerySettings(token, galleryId, { music_asset_id: assetId });
}

// Back-compat wrapper: upload a file into the library AND select it for this
// gallery in one call. New UI should prefer uploadMusicTrack + selectGalleryMusic.
export async function uploadGalleryMusic(
  token: string,
  galleryId: string,
  file: File,
): Promise<Gallery> {
  const asset = await uploadMusicTrack(token, file);
  return selectGalleryMusic(token, galleryId, asset.id);
}

// Clears the gallery's slideshow music reference. The underlying audio asset is
// left in the library (removed only via deleteMusicTrack).
export async function clearGalleryMusic(
  token: string,
  galleryId: string,
): Promise<Gallery> {
  return selectGalleryMusic(token, galleryId, null);
}

// Public URL that streams the gallery's background-music asset through the API.
// Mirrors the image-bytes pattern: `?ws=` preserves any legacy workspace scope,
// and `?at=` carries the short-lived, gallery-scoped asset-access token for
// gated galleries (SEC-1: an <audio> element cannot send the
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
  return browserApiUrl(path);
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

export interface GalleryAccountShare {
  id: string;
  gallery_id: string;
  owner_workspace_id: string;
  owner_workspace_name: string;
  shared_workspace_id: string;
  shared_workspace_name: string;
  shared_user_email?: string;
  storage_billed_to_workspace_id: string;
  storage_billed_to_workspace_name: string;
  storage_billed_to: "owner" | "shared";
  migrate_storage_usage: boolean;
  migrated_original_bytes: number;
  migrated_derivative_bytes: number;
  storage_migrated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateGalleryAccountShareInput {
  email: string;
  storage_billed_to?: "owner" | "shared";
  migrate_storage_usage?: boolean;
}

export async function listGalleryAccountShares(
  _token: string,
  galleryId: string,
): Promise<GalleryAccountShare[]> {
  const res = await authFetch(`/api/v1/galleries/${galleryId}/account-shares`);
  if (!res.ok)
    throw new Error(`Failed to list account shares: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.shares)) return body.shares;
  return [];
}

export async function createGalleryAccountShare(
  _token: string,
  galleryId: string,
  data: CreateGalleryAccountShareInput,
): Promise<GalleryAccountShare> {
  const res = await authFetch(`/api/v1/galleries/${galleryId}/account-shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok)
    throw new Error(await galleryApiErrorMessage(res, "Failed to share gallery"));
  return res.json();
}

export async function revokeGalleryAccountShare(
  _token: string,
  galleryId: string,
  shareId: string,
): Promise<void> {
  const res = await authFetch(
    `/api/v1/galleries/${galleryId}/account-shares/${shareId}`,
    { method: "DELETE" },
  );
  if (!res.ok)
    throw new Error(await galleryApiErrorMessage(res, "Failed to remove share"));
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

export interface GalleryMediaKeyRecord {
  key_id: string;
  exported_key: string;
}

export async function listGalleryMediaKeys(
  galleryId: string,
): Promise<GalleryMediaKeyRecord[]> {
  const res = await authFetch(`/api/v1/galleries/${galleryId}/media-keys`);
  if (!res.ok)
    throw new Error(`Failed to list gallery media keys: ${res.status}`);
  const body = await res.json();
  return Array.isArray(body?.keys) ? body.keys : [];
}

export async function upsertGalleryMediaKey(
  galleryId: string,
  key: GalleryMediaKeyRecord,
): Promise<GalleryMediaKeyRecord> {
  const res = await authFetch(`/api/v1/galleries/${galleryId}/media-keys`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(key),
  });
  if (!res.ok)
    throw new Error(`Failed to save gallery media key: ${res.status}`);
  const body = await res.json();
  return body?.key ?? key;
}

export interface GalleryAsset {
  id: string;
  gallery_id: string;
  asset_id: string;
  sort_order: number;
  is_hero: boolean;
  added_at?: string;
  // Present only when the row was fetched with ?include_assets=true (PERF-23):
  // the server embeds the asset so the client skips its per-asset getAsset()
  // loop. null means the asset is unavailable (e.g. soft-deleted).
  asset?: Asset | null;
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
  // Present only when the row was fetched with ?include_assets=true (Q-2b):
  // the server embeds the asset so the client skips its per-asset getAsset()
  // loop. null means the asset is unavailable (e.g. soft-deleted).
  asset?: Asset | null;
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
  const res = await authFetch(`/api/v1/galleries/${id}`, {
    method: "DELETE",
    keepalive: true,
  });
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
  opts?: { includeAssets?: boolean },
): Promise<GalleryAsset[]> {
  // PERF-23: ?include_assets=true asks the server to embed each asset in one
  // bulk query so the caller can skip its per-asset getAsset() hydration loop.
  const qs = opts?.includeAssets ? "?include_assets=true" : "";
  const res = await authFetch(`/api/v1/galleries/${galleryId}/assets${qs}`);
  if (!res.ok) throw new Error(`Failed to list gallery assets: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.assets)) return body.assets;
  if (body && Array.isArray(body.data)) return body.data;
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
  opts?: { includeAssets?: boolean },
): Promise<AlbumAsset[]> {
  // Q-2b: ?include_assets=true asks the server to embed each asset in one bulk
  // query so the caller can skip its per-asset getAsset() hydration loop,
  // mirroring listGalleryAssets (PERF-23).
  const qs = opts?.includeAssets ? "?include_assets=true" : "";
  const res = await authFetch(`/api/v1/albums/${albumId}/assets${qs}`);
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

export class PublicGalleryFetchError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(`${code}: ${status}`);
    this.name = "PublicGalleryFetchError";
    this.status = status;
    this.code = code;
  }
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
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new PublicGalleryFetchError(
      res.status,
      body.error || `public_gallery_${res.status}`,
    );
  }
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

export interface GalleryClientPreview {
  gallery: Gallery;
  assets: PublicAsset[];
  albums: PublicGalleryAlbum[];
  total_asset_count: number;
  branding?: GalleryBranding | null;
  banners: GalleryBanner[];
  products: GalleryProduct[];
  public_url: string;
  is_published: boolean;
}

export async function getGalleryClientPreview(
  _token: string,
  galleryId: string,
  options?: { albumId?: string },
): Promise<GalleryClientPreview> {
  const albumId = options?.albumId;
  const qs = albumId ? `?album=${encodeURIComponent(albumId)}` : "";
  const res = await authFetch(
    `/api/v1/galleries/${galleryId}/client-preview${qs}`,
  );
  if (!res.ok) {
    throw new Error(`Failed to load client preview: ${res.status}`);
  }
  const body = (await res.json()) as GalleryClientPreview;
  return {
    ...body,
    assets: Array.isArray(body.assets) ? body.assets : [],
    albums: Array.isArray(body.albums) ? body.albums : [],
    banners: Array.isArray(body.banners) ? body.banners : [],
    products: Array.isArray(body.products) ? body.products : [],
  };
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
  _token: string,
  galleryId: string,
): Promise<{ job_id: string }> {
  const res = await authFetch(`/api/v1/galleries/${galleryId}/ai/scan-faces`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to trigger face scan: ${res.status}`);
  return res.json();
}

export async function getFaceScanStatus(
  _token: string,
  galleryId: string,
): Promise<{
  status: string;
  processed: number;
  total: number;
  faces_found: number;
}> {
  const res = await authFetch(`/api/v1/galleries/${galleryId}/ai/scan-status`);
  if (!res.ok) throw new Error(`Failed to get scan status: ${res.status}`);
  const body = await res.json();
  return {
    status: typeof body?.status === "string" ? body.status : "unknown",
    processed:
      typeof body?.processed === "number"
        ? body.processed
        : typeof body?.processed_items === "number"
          ? body.processed_items
          : 0,
    total:
      typeof body?.total === "number"
        ? body.total
        : typeof body?.total_items === "number"
          ? body.total_items
          : 0,
    faces_found: typeof body?.faces_found === "number" ? body.faces_found : 0,
  };
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
