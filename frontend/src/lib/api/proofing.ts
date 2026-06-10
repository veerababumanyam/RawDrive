import { getApiBaseUrl } from "@/lib/api/base-url";
const API_BASE = getApiBaseUrl();

function gallerySessionHeaders(gallerySessionToken?: string | null): Record<string, string> {
  return gallerySessionToken ? { "X-Gallery-Session": gallerySessionToken } : {};
}

function publicProofingUrl(slug: string, workspaceScope?: string | null): string {
  const url = new URL(`${API_BASE}/api/v1/public/galleries/${encodeURIComponent(slug)}/proof`);
  if (workspaceScope) url.searchParams.set("ws", workspaceScope);
  return url.toString();
}

export interface ProofingSelection {
  id: string;
  gallery_id: string;
  asset_id: string;
  client_name: string;
  client_email: string;
  status: string;
  note: string;
  created_at: string;
}

export async function listProofingSelections(token: string, galleryId: string): Promise<ProofingSelection[]> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/proofing`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Failed to list proofing: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.selections)) return body.selections;
  return [];
}

export async function exportProofingSelectionsCsv(token: string, galleryId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/proofing/export.csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to export proofing selections: ${res.status}`);
  return res.blob();
}

export async function updateSelectionStatus(token: string, galleryId: string, selectionId: string, status: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/proofing/${selectionId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Failed to update status: ${res.status}`);
}

export async function submitPublicProofing(slug: string, data: {
  asset_ids: string[];
  client_name: string;
  client_email: string;
  note?: string;
}, gallerySessionToken?: string | null, workspaceScope?: string | null): Promise<void> {
  const res = await fetch(publicProofingUrl(slug, workspaceScope), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...gallerySessionHeaders(gallerySessionToken),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = typeof body?.error === "string" ? body.error : `Failed to submit proofing: ${res.status}`;
    throw new Error(message);
  }
}

// M13: Proofing Sessions
export interface ProofingSession {
  id: string;
  gallery_id: string;
  name: string;
  description: string;
  session_type: string;
  created_by_name?: string;
  created_by_email?: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export async function createProofingSession(token: string, galleryId: string, data: {
  name: string;
  description?: string;
  session_type?: string;
}): Promise<ProofingSession> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/proofing/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  return res.json();
}

export async function listProofingSessions(token: string, galleryId: string): Promise<ProofingSession[]> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/proofing/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.proofingsessions)) return body.proofingsessions;
  return [];
}

export async function setStarRating(token: string, galleryId: string, selectionId: string, rating: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/proofing/selections/${selectionId}/rating`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  });
  if (!res.ok) throw new Error(`Failed to set rating: ${res.status}`);
}

export async function setColorLabel(token: string, galleryId: string, selectionId: string, label: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/proofing/selections/${selectionId}/label`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
  if (!res.ok) throw new Error(`Failed to set label: ${res.status}`);
}

// M13: Comments
export interface ProofingComment {
  id: string;
  gallery_id: string;
  asset_id: string;
  parent_id?: string;
  author_name: string;
  author_email?: string;
  body: string;
  pin_x?: number;
  pin_y?: number;
  is_resolved: boolean;
  created_at: string;
}

export async function createComment(token: string, galleryId: string, data: {
  asset_id: string;
  parent_id?: string;
  author_name: string;
  author_email?: string;
  body: string;
  pin_x?: number;
  pin_y?: number;
}): Promise<ProofingComment> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/proofing/comments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create comment: ${res.status}`);
  return res.json();
}

export async function listComments(token: string, galleryId: string, assetId: string): Promise<ProofingComment[]> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/proofing/comments?asset_id=${assetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to list comments: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.proofingcomments)) return body.proofingcomments;
  return [];
}

// M13: Album Approval
export interface AlbumApproval {
  id: string;
  gallery_id: string;
  session_id?: string;
  approved_by_name: string;
  approved_by_email: string;
  version_hash: string;
  ip_address?: string;
  notes?: string;
  created_at: string;
}

export async function submitAlbumApproval(token: string, galleryId: string, data: {
  session_id?: string;
  approved_by_name: string;
  approved_by_email: string;
  config_snapshot: Record<string, unknown>;
  notes?: string;
}): Promise<AlbumApproval> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/proofing/album-approval`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to submit approval: ${res.status}`);
  return res.json();
}

export async function listAlbumApprovals(token: string, galleryId: string): Promise<AlbumApproval[]> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/proofing/album-approval`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to list approvals: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.albumapprovals)) return body.albumapprovals;
  return [];
}

// M13: Gallery Access
export async function verifyGalleryPassword(slug: string, password: string): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/api/v1/public/galleries/${slug}/verify-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(`Invalid password`);
  return res.json();
}

export async function setAccessMode(token: string, galleryId: string, accessMode: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/access-mode`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ access_mode: accessMode }),
  });
  if (!res.ok) throw new Error(`Failed to set access mode: ${res.status}`);
}

export async function getAccessLogs(token: string, galleryId: string, limit = 50, offset = 0): Promise<{
  logs: Array<{ id: string; visitor_ip: string; access_type: string; link_type: string; created_at: string }>;
  total: number;
}> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/access-logs?limit=${limit}&offset=${offset}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to get access logs: ${res.status}`);
  return res.json();
}
