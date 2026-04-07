const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface Gallery {
  id: string;
  workspace_id: string;
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
}

export interface GalleryAsset {
  id: string;
  gallery_id: string;
  asset_id: string;
  sort_order: number;
  is_hero: boolean;
}

export async function listGalleries(token: string, params?: { status?: string; type?: string; search?: string }): Promise<Gallery[]> {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  const res = await fetch(`${API_BASE}/api/v1/galleries?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to list galleries: ${res.status}`);
  return res.json();
}

export async function getGallery(token: string, id: string): Promise<Gallery> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to get gallery: ${res.status}`);
  return res.json();
}

export async function createGallery(token: string, data: { title: string; description?: string; gallery_type?: string }): Promise<Gallery> {
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
  return res.json();
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

export async function getPublicGalleryAssets(slug: string): Promise<PublicAsset[]> {
  const res = await fetch(`${API_BASE}/api/v1/public/galleries/${slug}/assets`);
  if (!res.ok) throw new Error(`Failed to list public assets: ${res.status}`);
  return res.json();
}
