const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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
    text?: string;
    position?: "center" | "tiled" | "bottom-right" | "bottom-left";
    opacity?: number; // 0.0–1.0
  };
  faceid_enabled?: boolean;
  settings?: Record<string, unknown>;
  // Populated by list endpoint via LEFT JOIN on assets — used for card thumbnails
  cover_thumbnails?: Record<string, string>;
  // M19: Gallery Enhancement Suite (F-009)
  cover_template?: string;
  cover_config?: Record<string, unknown>;
  expires_at?: string;
  download_enabled?: boolean;
  sort_preference?: string;
  whatsapp_template?: string;
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

export async function getPublicGalleryBranding(slug: string): Promise<GalleryBranding> {
  const res = await fetch(`${API_BASE}/api/v1/public/galleries/${slug}/branding`);
  if (!res.ok) throw new Error(`Failed to get branding: ${res.status}`);
  return res.json();
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
  const res = await fetch(`${API_BASE}/api/v1/public/galleries/${slug}/face-match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embedding, consent_given: consentGiven, threshold }),
  });
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
  const res = await fetch(`${API_BASE}/api/v1/public/share/${token}/verify`, {
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

export async function listGalleryShareLinks(token: string, galleryId: string): Promise<GalleryShareLink[]> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/share`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to list gallery share links: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.links)) return body.links;
  return [];
}

export async function createGalleryShareLink(
  token: string,
  galleryId: string,
  data: CreateGalleryShareLinkInput,
): Promise<GalleryShareLink> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/share`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create gallery share link: ${res.status}`);
  return res.json();
}

export async function revokeGalleryShareLink(
  token: string,
  galleryId: string,
  linkId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/share/${linkId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to revoke gallery share link: ${res.status}`);
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
}

export interface AlbumAsset {
  album_id: string;
  asset_id: string;
  position: number;
  added_at: string;
}

export async function listGalleries(token: string, params?: { status?: string; type?: string; search?: string }): Promise<Gallery[]> {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  const res = await fetch(`${API_BASE}/api/v1/galleries?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to list galleries: ${res.status}`);
  const body = await res.json();
  // Backend may return either a bare array, or {galleries: [...]}, or null
  // when there are zero rows. Coerce to a proper array so the page never
  // crashes on .length / .map.
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.galleries)) return body.galleries;
  return [];
}

export async function getGallery(token: string, id: string): Promise<Gallery> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to get gallery: ${res.status}`);
  return res.json();
}

export async function createGallery(
  token: string,
  data: {
    title: string;
    description?: string;
    gallery_type?: string;
  } & GalleryRelationshipPayload,
): Promise<Gallery> {
  const res = await fetch(`${API_BASE}/api/v1/galleries`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create gallery: ${res.status}`);
  return res.json();
}

export async function updateGallery(token: string, id: string, data: Partial<Gallery>): Promise<Gallery> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update gallery: ${res.status}`);
  return res.json();
}

export async function linkGalleryRelationships(
  token: string,
  id: string,
  data: GalleryRelationshipPayload,
): Promise<Gallery> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${id}/client-link`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to link gallery relationships: ${res.status}`);
  return res.json();
}

export async function getGalleryWorkspaceSummary(token: string, id: string): Promise<GalleryWorkspaceSummary> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${id}/workspace-summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to get gallery workspace: ${res.status}`);
  return res.json();
}

export async function duplicateGallery(token: string, id: string, title?: string): Promise<Gallery> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${id}/duplicate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to duplicate gallery: ${res.status}`);
  return res.json();
}

export async function updateGalleryCover(
  token: string,
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
  const res = await fetch(`${API_BASE}/api/v1/galleries/${id}/cover`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to update gallery cover: ${res.status}`);
}

export async function updateGalleryDesign(
  token: string | null,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${id}/design`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update gallery design: ${res.status}`);
}

export async function deleteGallery(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to delete gallery: ${res.status}`);
}

export async function addAssetToGallery(token: string, galleryId: string, assetId: string, sortOrder: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/assets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ asset_id: assetId, sort_order: sortOrder }),
  });
  if (!res.ok) throw new Error(`Failed to add asset: ${res.status}`);
}

export async function listGalleryAssets(token: string, galleryId: string): Promise<GalleryAsset[]> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/assets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to list gallery assets: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.assets)) return body.assets;
  return [];
}

export async function listGalleryAlbums(token: string, galleryId: string): Promise<GalleryAlbum[]> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/albums`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to list albums: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.data)) return body.data;
  return [];
}

export async function createGalleryAlbum(
  token: string,
  galleryId: string,
  data: { name: string; description?: string; parent_id?: string },
): Promise<GalleryAlbum> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/albums`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create album: ${res.status}`);
  const body = await res.json();
  return body.data ?? body;
}

export async function listAlbumAssets(token: string, albumId: string): Promise<AlbumAsset[]> {
  const res = await fetch(`${API_BASE}/api/v1/albums/${albumId}/assets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to list album assets: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.data)) return body.data;
  return [];
}

export async function addAlbumAssets(token: string, albumId: string, assetIds: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/albums/${albumId}/assets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ asset_ids: assetIds }),
  });
  if (!res.ok) throw new Error(`Failed to add album assets: ${res.status}`);
}

export async function getPublicGallery(slug: string): Promise<Gallery> {
  const res = await fetch(`${API_BASE}/api/v1/public/galleries/${slug}`);
  if (!res.ok) throw new Error(`Gallery not found: ${res.status}`);
  return res.json();
}

export interface PublicAsset {
  id: string;
  filename: string;
  content_type: string;
  width?: number;
  height?: number;
  blurhash?: string;
  thumbnail_urls: Record<string, string>;
  sort_order: number;
}

// ── Gallery Settings ──────────────────────────────────────────────
export async function updateGallerySettings(
  token: string,
  galleryId: string,
  settings: Record<string, unknown>,
): Promise<Gallery> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`Failed to update gallery settings: ${res.status}`);
  return res.json();
}

// ── AI Face Scan ──────────────────────────────────────────────────
export async function triggerFaceScan(
  token: string,
  galleryId: string,
): Promise<{ job_id: string }> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/ai/scan-faces`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to trigger face scan: ${res.status}`);
  return res.json();
}

export async function getFaceScanStatus(
  token: string,
  galleryId: string,
): Promise<{ status: string; processed: number; total: number; faces_found: number }> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/ai/scan-status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to get scan status: ${res.status}`);
  return res.json();
}

export async function getPublicGalleryAssets(slug: string, albumId?: string): Promise<PublicAsset[]> {
  const path = albumId
    ? `/api/v1/public/galleries/${slug}/albums/${albumId}/assets`
    : `/api/v1/public/galleries/${slug}/assets`;
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Failed to list public assets: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.publicassets)) return body.publicassets;
  return [];
}
