const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface DownloadJob {
  id: string;
  gallery_id: string;
  status: string;
  progress: number;
  total_assets: number;
  download_url?: string;
  variant: string;
  created_at: string;
  completed_at?: string;
}

export interface DownloadEvent {
  id: string;
  gallery_id: string;
  asset_id?: string;
  downloader_name?: string;
  downloader_email?: string;
  variant: string;
  file_size_bytes?: number;
  created_at: string;
}

export async function createDownloadJob(token: string, galleryId: string, data: {
  asset_ids: string[];
  variant?: string;
}): Promise<DownloadJob> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/downloads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create download: ${res.status}`);
  return res.json();
}

export async function getDownloadJob(token: string, galleryId: string, jobId: string): Promise<DownloadJob> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/downloads/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to get download job: ${res.status}`);
  return res.json();
}

export async function listDownloadJobs(token: string, galleryId: string): Promise<DownloadJob[]> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/downloads`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to list downloads: ${res.status}`);
  return res.json();
}

export async function getDownloadAudit(token: string, galleryId: string): Promise<DownloadEvent[]> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/download-audit`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to get audit: ${res.status}`);
  return res.json();
}

export function getZipDownloadUrl(galleryId: string): string {
  return `${API_BASE}/api/v1/galleries/${galleryId}/download-zip`;
}
