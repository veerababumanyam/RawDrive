const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface AnalyticsSummary {
  views: number;
  unique_visitors: number;
  downloads: number;
  favorites: number;
  shares: number;
}

export interface AnalyticsDaily {
  date: string;
  views: number;
  unique_visitors: number;
  downloads: number;
  favorites: number;
  shares: number;
}

export interface TopGalleryAssetAnalytics {
  id: string;
  gallery_id: string;
  asset_id: string;
  views: number;
  downloads: number;
  favorites: number;
  last_viewed_at?: string;
}

export async function getAnalyticsSummary(token: string, galleryId: string, days = 30): Promise<AnalyticsSummary> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/analytics/summary?days=${days}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to get analytics: ${res.status}`);
  return res.json();
}

export async function getAnalyticsDaily(token: string, galleryId: string, days = 30): Promise<AnalyticsDaily[]> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/analytics/daily?days=${days}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to get daily analytics: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.analyticsdailys)) return body.analyticsdailys;
  return [];
}

export async function getTopGalleryAssets(
  token: string,
  galleryId: string,
  metric: "views" | "downloads",
  days = 30,
  limit = 10,
): Promise<TopGalleryAssetAnalytics[]> {
  const res = await fetch(
    `${API_BASE}/api/v1/galleries/${galleryId}/analytics/top-${metric}?days=${days}&limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Failed to get top gallery assets: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.data)) return body.data;
  return [];
}
