const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// ---- Types ----

export interface ClusterSummary {
  cluster_label: string;
  cluster_name: string;
  face_count: number;
  asset_count: number;
  sample_asset_id: string;
}

export interface AIJob {
  id: string;
  type: string;
  status: string;
  total_items: number;
  processed_items: number;
  created_at: string;
}

export interface SearchResult {
  asset_id: string;
  filename: string;
  content_type: string;
  thumbnail_urls: Record<string, string>;
  similarity: number;
  ai_tags?: AITag[];
  ai_caption?: string;
}

export interface AITag {
  tag: string;
  category: string;
  confidence: number;
  source: string;
  status: string;
}

export interface DuplicateGroup {
  id: string;
  workspace_id: string;
  gallery_id?: string;
  status: string;
  members: DuplicateGroupMember[];
  created_at: string;
}

export interface DuplicateGroupMember {
  id: string;
  asset_id: string;
  similarity_score: number;
  is_representative: boolean;
  quality?: QualityScore;
}

export interface QualityScore {
  sharpness: number;
  exposure: number;
  composition: number;
  overall: number;
}

export interface SpendSummary {
  workspace_id: string;
  period_start: string;
  period_end: string;
  total_paisa: number;
  by_operation: Record<string, number>;
  monthly_cap_paisa: number;
  cap_used_percent: number;
}

export interface CreditSummary {
  workspace_id: string;
  monthly_cap_paisa: number;
  spent_this_month_paisa: number;
  remaining_paisa: number;
  cap_used_percent: number;
  is_cap_reached: boolean;
}

export interface AIConfig {
  configured: boolean;
  provider?: string;
  model_preference?: string;
  key_masked?: string;
  enabled?: boolean;
}

// ---- Face Detection & Clustering ----

export async function triggerFaceDetect(token: string, assetIds: string[], galleryId?: string): Promise<{ job_id: string; status: string }> {
  const res = await fetch(`${API_BASE}/api/v1/ai/face-detect`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ asset_ids: assetIds, gallery_id: galleryId }),
  });
  if (!res.ok) throw new Error(`Face detect failed: ${res.status}`);
  return res.json();
}

export async function getFaceClusters(token: string, galleryId?: string): Promise<ClusterSummary[]> {
  const params = galleryId ? `?gallery_id=${galleryId}` : "";
  const res = await fetch(`${API_BASE}/api/v1/ai/clusters${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`List clusters failed: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.clustersummarys)) return body.clustersummarys;
  return [];
}

export async function renameCluster(token: string, clusterId: string, name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/ai/clusters/${clusterId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Rename cluster failed: ${res.status}`);
}

export async function mergeClusters(token: string, sourceId: string, targetId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/ai/clusters/merge`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ source_cluster_id: sourceId, target_cluster_id: targetId }),
  });
  if (!res.ok) throw new Error(`Merge clusters failed: ${res.status}`);
}

// ClusterAssets is the response shape of GET /api/v1/ai/clusters/{id}/assets.
// The backend returns distinct asset IDs in the cluster, scoped to the
// caller's workspace. The FaceFilter component feeds these IDs into a
// gallery grid filter event so the user sees only photos containing the
// selected face.
export interface ClusterAssetsResponse {
  cluster_label: string;
  asset_ids: string[];
  count: number;
}

export async function getClusterAssets(
  token: string,
  clusterId: string,
): Promise<ClusterAssetsResponse> {
  const res = await fetch(`${API_BASE}/api/v1/ai/clusters/${clusterId}/assets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get cluster assets failed: ${res.status}`);
  return res.json();
}

// ---- Semantic Search ----

export async function searchAssets(token: string, query: string, galleryId?: string, limit?: number): Promise<{ results: SearchResult[]; total: number }> {
  const res = await fetch(`${API_BASE}/api/v1/ai/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, gallery_id: galleryId, limit: limit || 20 }),
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

// ---- Tags ----

export async function getAssetTags(token: string, assetId: string): Promise<{ ai_tags: AITag[]; ai_caption: string; ai_tag_status: string }> {
  const res = await fetch(`${API_BASE}/api/v1/ai/tags/${assetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get tags failed: ${res.status}`);
  return res.json();
}

// ---- Duplicates ----

export async function scanDuplicates(token: string, galleryId?: string): Promise<{ job_id: string; status: string }> {
  const res = await fetch(`${API_BASE}/api/v1/ai/duplicates/scan`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ gallery_id: galleryId }),
  });
  if (!res.ok) throw new Error(`Scan duplicates failed: ${res.status}`);
  return res.json();
}

export async function getDuplicates(token: string, status?: string): Promise<{ groups: DuplicateGroup[]; total: number }> {
  const params = status ? `?status=${status}` : "";
  const res = await fetch(`${API_BASE}/api/v1/ai/duplicates${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`List duplicates failed: ${res.status}`);
  return res.json();
}

export async function getDuplicateGroup(token: string, groupId: string): Promise<DuplicateGroup> {
  const res = await fetch(`${API_BASE}/api/v1/ai/duplicates/${groupId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get duplicate group failed: ${res.status}`);
  return res.json();
}

// ---- BYOK Config ----

export async function getAIConfig(token: string): Promise<AIConfig> {
  const res = await fetch(`${API_BASE}/api/v1/ai/config`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get AI config failed: ${res.status}`);
  return res.json();
}

export async function saveAIConfig(token: string, apiKey: string, model?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/ai/config`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, model_preference: model }),
  });
  if (!res.ok) throw new Error(`Save AI config failed: ${res.status}`);
}

export async function validateAIKey(token: string): Promise<{ valid: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/api/v1/ai/config/validate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Validate key failed: ${res.status}`);
  return res.json();
}

// ---- Spend ----

export async function getSpend(token: string): Promise<SpendSummary> {
  const res = await fetch(`${API_BASE}/api/v1/ai/spend`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get spend failed: ${res.status}`);
  return res.json();
}

export async function getCredits(token: string): Promise<CreditSummary> {
  const res = await fetch(`${API_BASE}/api/v1/ai/credits`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get credits failed: ${res.status}`);
  return res.json();
}

export async function setSpendCap(token: string, capPaisa: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/ai/spend/cap`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ monthly_cap_paisa: capPaisa }),
  });
  if (!res.ok) throw new Error(`Set spend cap failed: ${res.status}`);
}

// ---- Jobs ----

export async function getJob(token: string, jobId: string): Promise<AIJob> {
  const res = await fetch(`${API_BASE}/api/v1/ai/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get job failed: ${res.status}`);
  return res.json();
}

// ---- AI Curation / Culling (M38 E99-S1) ----

export interface CullingSuggestion {
  asset_id: string;
  score: number;
  recommendation: "keep" | "remove" | "review";
  reason?: string;
}

export async function triggerCulling(
  token: string,
  galleryId: string,
  topPercent = 70,
): Promise<AIJob> {
  const res = await fetch(`${API_BASE}/api/v1/ai/cull`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ gallery_id: galleryId, top_percent: topPercent }),
  });
  if (!res.ok) throw new Error(`Trigger culling failed: ${res.status}`);
  return res.json();
}

export async function getCullingSuggestions(
  token: string,
  jobId: string,
): Promise<{ suggestions: CullingSuggestion[]; total: number }> {
  const res = await fetch(`${API_BASE}/api/v1/ai/cull/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get culling suggestions failed: ${res.status}`);
  return res.json();
}
