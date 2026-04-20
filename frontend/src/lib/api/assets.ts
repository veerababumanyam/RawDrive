import { authFetch } from "@/lib/api/authFetch";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
void API_BASE; // kept for any remaining public/unauthenticated calls

// Normalised face bounding box in [0,1] image-space (matches backend ai.BoundingBox).
export interface FaceBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Asset {
  id: string;
  workspace_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  storage_key: string;
  width?: number;
  height?: number;
  blurhash?: string;
  exif_data: Record<string, unknown>;
  thumbnail_urls: Record<string, string>;
  status: string;
  created_at: string;
  download_url?: string;
  // M13 deferred-FR fields (optional — unpopulated on older endpoints)
  burst_id?: string | null;         // GAL-FR-094 — burst group membership
  burst_is_top_pick?: boolean;      // GAL-FR-094 — top-pick of its burst
  face_boxes?: FaceBBox[];          // GAL-FR-089 — face bounding box overlay
  video_duration_ms?: number;       // GAL-FR-095 — video asset total duration
  poster_url?: string;              // GAL-FR-095 — video poster frame
  gps_latitude?: number;            // GAL-FR-099 — map view
  gps_longitude?: number;           // GAL-FR-099 — map view
}

export async function listAssets(_token: string, params?: { status?: string; content_type?: string }): Promise<Asset[]> {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  const res = await authFetch(`/api/v1/assets?${query}`);
  if (!res.ok) throw new Error(`Failed to list assets: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.assets)) return body.assets;
  return [];
}

export async function getAsset(_token: string, id: string): Promise<Asset> {
  const res = await authFetch(`/api/v1/assets/${id}`);
  if (!res.ok) throw new Error(`Failed to get asset: ${res.status}`);
  return res.json();
}

export async function deleteAsset(_token: string, id: string): Promise<void> {
  const res = await authFetch(`/api/v1/assets/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete asset: ${res.status}`);
}

export async function bulkAssetAction(
  _token: string,
  action: "delete",
  assetIds: string[],
): Promise<void> {
  const res = await authFetch(`/api/v1/assets/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, asset_ids: assetIds }),
  });
  if (!res.ok) throw new Error(`Failed to run bulk asset action: ${res.status}`);
}
