import { authFetch } from "@/lib/api/authFetch";
import { getApiBaseUrl } from "@/lib/api/base-url";
import type { PublicAsset } from "@/lib/api/galleries";

const apiUrl = (path: string) => `${getApiBaseUrl()}${path}`;

// ---- Types ----

// SampleBoundingBox mirrors the backend ai.BoundingBox shape (pixels of
// the original image — sourced from face_clusters.bounding_box JSONB).
// PR-3 people tab uses this to crop the cluster cover thumbnail to just
// the face area; if absent, fall back to the full thumbnail.
export interface SampleBoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ClusterSummary {
  cluster_label: string;
  cluster_name: string;
  face_count: number;
  asset_count: number;
  sample_asset_id: string;
  // PR-3: backend ai.ClusterSummary returns this — exposed here so the
  // People tab can crop the sample asset to the face region.
  sample_bounding_box?: SampleBoundingBox;
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

// All cluster endpoints go through authFetch — same reason every other
// authenticated dashboard fetcher does: the in-memory token cache is
// empty on a fresh tab load until refreshAuthSession runs against the
// httpOnly refresh cookie. authFetch handles that race + auto-retries
// on 401. The `_token` parameter is kept for backward-compatible call
// sites; the actual token comes from authFetch via getStoredAccessToken.
export async function triggerFaceDetect(_token: string, assetIds: string[], galleryId?: string): Promise<{ job_id: string; status: string }> {
  const res = await authFetch(`/api/v1/ai/face-detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asset_ids: assetIds, gallery_id: galleryId }),
  });
  if (!res.ok) throw new Error(`Face detect failed: ${res.status}`);
  return res.json();
}

export async function getFaceClusters(_token: string, galleryId?: string): Promise<ClusterSummary[]> {
  const params = galleryId ? `?gallery_id=${galleryId}` : "";
  const res = await authFetch(`/api/v1/ai/clusters${params}`);
  if (!res.ok) throw new Error(`List clusters failed: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.clustersummarys)) return body.clustersummarys;
  return [];
}

export async function renameCluster(_token: string, clusterId: string, name: string): Promise<void> {
  const res = await authFetch(`/api/v1/ai/clusters/${clusterId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Rename cluster failed: ${res.status}`);
}

export async function mergeClusters(_token: string, sourceId: string, targetId: string): Promise<void> {
  const res = await authFetch(`/api/v1/ai/clusters/merge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  _token: string,
  clusterId: string,
  // Optional gallery scope. When provided, the backend joins through
  // gallery_assets so the response lists ONLY the photos in this
  // gallery that contain the person — the dashboard People-tab tile
  // click passes the current gallery here so the user doesn't land on
  // a grid of photos from other galleries they might not even have
  // open. Omit to get the workspace-wide list (smart-album behavior).
  galleryId?: string,
): Promise<ClusterAssetsResponse> {
  const url = galleryId
    ? `/api/v1/ai/clusters/${clusterId}/assets?gallery_id=${encodeURIComponent(galleryId)}`
    : `/api/v1/ai/clusters/${clusterId}/assets`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error(`Get cluster assets failed: ${res.status}`);
  return res.json();
}

// ---- Photo Search (webcam-driven find-this-person) ----
//
// The "Photo Search" page captures a single frame from the user's
// webcam, posts it to the backend, and the backend runs face-svc on
// the frame, matches the strongest face against existing clusters in
// the workspace, then returns the cluster's photos scoped to the
// current gallery. UX wants three distinguishable outcomes:
//
//   - `found: false, faces_detected: 0`  → "We didn't see a face"
//   - `found: false, faces_detected: >0` → "Saw a face, no match here"
//   - `found: true`                       → render cluster name + grid
//
// asset_ids is always a string array (never null) so the UI can map
// over it without a null guard.
export interface FaceSearchResponse {
  found: boolean;
  faces_detected: number;
  cluster_label?: string;
  cluster_name?: string;
  similarity?: number;
  asset_ids: string[];
  count: number;
}

export async function searchFaceInGallery(
  _token: string,
  galleryId: string,
  imageBlob: Blob,
): Promise<FaceSearchResponse> {
  const form = new FormData();
  // Backend expects field name "image" (see handler.FaceSearch).
  // Filename is just a breadcrumb in face-svc logs.
  form.append("image", imageBlob, "search.jpg");
  // No explicit Content-Type — the browser sets the multipart boundary.
  const res = await authFetch(
    `/api/v1/ai/face-search?gallery_id=${encodeURIComponent(galleryId)}`,
    { method: "POST", body: form },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Face search failed: ${res.status}`);
  }
  return res.json();
}

// ---- Public Face Recognition (PR-3b) ----
//
// Read-only People view on /g/{slug}. Gated server-side on both the
// workspace face_recognition_enabled flag and the per-gallery
// face_detection_enabled flag — if either is off, the endpoints return
// an empty list so the public viewer can simply hide the tab.

export interface PublicPersonSummary {
  id: string;
  name: string;
  face_count: number;
  asset_count: number;
  cover_asset_id: string;
  // Decryptable cover asset record (with media_encryption manifest) so the
  // People tile renders a decrypted thumbnail on E2EE galleries. Absent when
  // the cover asset is missing or the backend predates slice 3.
  cover_asset?: PublicAsset;
}

export interface PublicPersonPhotos {
  asset_ids: string[];
  // Decryptable asset records (parallel to asset_ids) for client-side
  // thumbnail decryption on E2EE galleries.
  assets?: PublicAsset[];
  count: number;
}

// Public guest People / Photo-Search endpoints are gated server-side by
// gateGalleryAccess (S4-G5): private / invite-only / password galleries
// require a valid gallery_session. That session is a HOST-ONLY cookie on the
// FRONTEND origin (minted by share-pin-gate.tsx via the relative /api/v1
// rewrite, or written by the password gate). It therefore only travels on
// SAME-ORIGIN requests. These calls MUST use the relative `/api/v1/...` path
// (proxied to the API by the next.config.ts `/api/v1/:path*` rewrite, which
// forwards the Cookie header) with credentials:"include" — NOT the absolute
// cross-origin API base, which the cookie never reaches → 403
// "gallery access requires a valid share link or invite" (issue #135). The
// X-Gallery-Session header path is unusable here because the cross-origin
// CORS Allow-Headers list omits it. These functions are browser-only.
export async function listPublicPeople(
  slug: string,
  scope?: PublicGalleryScope,
): Promise<PublicPersonSummary[]> {
  // Relative + credentials for the cookie path; `?share=`/`?ws=` forwarded so a
  // no-PIN share visitor self-authorizes via tryBindShareSession (#175) — the
  // People GET is gated by gateGalleryAccess exactly like photo-search.
  const res = await fetch(
    withPublicScope(`/api/v1/public/galleries/${slug}/people`, scope),
    { credentials: "include" },
  );
  if (!res.ok) throw new Error(`List public people failed: ${res.status}`);
  const body = (await res.json()) as PublicPersonSummary[];
  return Array.isArray(body) ? body : [];
}

export async function listPublicPersonPhotos(
  slug: string,
  personId: string,
  scope?: PublicGalleryScope,
): Promise<PublicPersonPhotos> {
  // Same-origin + credentials so the gallery_session cookie reaches the gate
  // (see listPublicPeople above; issue #135). `?share=`/`?ws=` forwarded so a
  // no-PIN share arrival is authorized when the cookie is absent (#175).
  const res = await fetch(
    withPublicScope(
      `/api/v1/public/galleries/${slug}/people/${personId}/photos`,
      scope,
    ),
    { credentials: "include" },
  );
  if (!res.ok) throw new Error(`List public person photos failed: ${res.status}`);
  return res.json();
}

// Public Photo Search — webcam-driven "find me in this gallery" for
// anonymous guest viewers. Same response shape as the dashboard
// searchFaceInGallery so the result UI can be near-identical.
//
// Same three outcomes:
//   - found:false, faces_detected:0    → "no face in capture"
//   - found:false, faces_detected:>0   → "face detected, no match here"
//   - found:true                        → cluster_label + asset_ids
//
// 503 from the backend means the deployment has no face-svc client
// wired (FACE_SVC_URL unset); the page surfaces that as "feature
// not available."
export interface PublicFaceSearchResponse {
  found: boolean;
  faces_detected: number;
  index_status?: "ready" | "empty";
  indexed_faces?: number;
  indexed_people?: number;
  cluster_label?: string;
  cluster_name?: string;
  similarity?: number;
  asset_ids: string[];
  // Decryptable asset records (parallel to asset_ids) so the result grid
  // renders decrypted thumbnails on E2EE galleries.
  assets?: PublicAsset[];
  count: number;
}

// Access scope for a public gated-gallery request. A visitor who arrived via a
// share link carries the grant in the URL (`?share=`, plus `?ws=` on a studio
// subdomain). Forwarding it makes the request self-authorize through the
// backend's tryBindShareSession — independent of the host-only gallery_session
// cookie, which is NOT minted on no-PIN share arrivals to the standalone Find
// Me / People routes (issue #175). The cookie path (credentials:"include")
// still covers password-gated galleries, which have no share token.
export interface PublicGalleryScope {
  shareToken?: string | null;
  ws?: string | null;
}

// Append the public access scope (share token + workspace subdomain) to a
// same-origin relative API path OR a nav href. Kept relative so the
// gallery_session cookie continues to travel via the /api/v1 rewrite when
// present. Exported so the public Find Me / People route links preserve the
// scope across navigation (#175) instead of stripping it.
export function withPublicScope(path: string, scope?: PublicGalleryScope): string {
  if (!scope) return path;
  const params = new URLSearchParams();
  if (scope.ws) params.set("ws", scope.ws);
  if (scope.shareToken) params.set("share", scope.shareToken);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export async function searchPublicFaceInGallery(
  slug: string,
  imageBlob: Blob,
  scope?: PublicGalleryScope,
): Promise<PublicFaceSearchResponse> {
  const form = new FormData();
  // Field name must match the backend handler — see
  // public_gallery_handler.PhotoSearch.
  form.append("image", imageBlob, "search.jpg");
  // Same-origin relative path + credentials so the host-only gallery_session
  // cookie reaches gateGalleryAccess on gated galleries — see listPublicPeople
  // above (issue #135). The selfie itself is not gallery-encrypted; only the
  // gallery session cookie is needed for access. The 10MB multipart body is
  // streamed through the same /api/v1 rewrite the rest of this surface uses.
  // The `?share=`/`?ws=` scope (when the visitor arrived via a share link)
  // self-authorizes via tryBindShareSession when the cookie is absent (#175).
  const res = await fetch(
    withPublicScope(`/api/v1/public/galleries/${slug}/photo-search`, scope),
    {
      method: "POST",
      credentials: "include",
      body: form,
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Photo search failed: ${res.status}`);
  }
  return res.json();
}

// ---- Client-computed face-embedding ingest (E2EE face-search epic) ----

export interface ClientFaceBoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// One detected face computed IN THE BROWSER (slice 2b: insightface buffalo_l
// via onnxruntime-web) on the decrypted plaintext at upload time. Only the
// 512-d embedding + box are sent — never the plaintext image — so E2EE holds.
export interface ClientFaceEmbeddingInput {
  face_index?: number;
  bounding_box?: ClientFaceBoundingBox;
  // Exactly 512 floats (insightface buffalo_l, L2-normalized). The backend
  // (POST /api/v1/assets/{id}/face-embeddings, slice 1) validates the length.
  embedding: number[];
  det_score?: number;
}

// uploadAssetFaceEmbeddings POSTs browser-computed face embeddings for an asset
// to the slice-1 ingest endpoint. Authenticated owner call (the photographer
// uploading), so it goes through authFetch. Inert end-to-end until the
// client_face_index flag is enabled AND a browser embedder is wired (slice 2b).
export async function uploadAssetFaceEmbeddings(
  assetId: string,
  faces: ClientFaceEmbeddingInput[],
  opts?: { galleryId?: string },
): Promise<{ stored: number }> {
  const res = await authFetch(`/api/v1/assets/${assetId}/face-embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gallery_id: opts?.galleryId, faces }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Face embedding upload failed: ${res.status}`);
  }
  return res.json();
}

// uploadAssetFaceIndexImage sends a short-lived, downscaled image frame for an
// encrypted upload so the backend can run the same face-svc model and store
// only embeddings/bounding boxes. The backend does not persist this image.
export async function uploadAssetFaceIndexImage(
  assetId: string,
  imageBlob: Blob,
  opts?: { galleryId?: string; signal?: AbortSignal },
): Promise<{ stored: number }> {
  const form = new FormData();
  if (opts?.galleryId) form.set("gallery_id", opts.galleryId);
  form.set("image", imageBlob, "face-index.webp");
  const res = await authFetch(`/api/v1/assets/${assetId}/face-index-image`, {
    method: "POST",
    body: form,
    signal: opts?.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Face index image upload failed: ${res.status}`);
  }
  return res.json();
}

// ---- Semantic Search ----

export async function searchAssets(token: string, query: string, galleryId?: string, limit?: number): Promise<{ results: SearchResult[]; total: number }> {
  const res = await fetch(apiUrl("/api/v1/ai/search"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, gallery_id: galleryId, limit: limit || 20 }),
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

// ---- Tags ----

export async function getAssetTags(token: string, assetId: string): Promise<{ ai_tags: AITag[]; ai_caption: string; ai_tag_status: string }> {
  const res = await fetch(apiUrl(`/api/v1/ai/tags/${assetId}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get tags failed: ${res.status}`);
  return res.json();
}

// ---- Duplicates ----

export async function scanDuplicates(token: string, galleryId?: string): Promise<{ job_id: string; status: string }> {
  const res = await fetch(apiUrl("/api/v1/ai/duplicates/scan"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ gallery_id: galleryId }),
  });
  if (!res.ok) throw new Error(`Scan duplicates failed: ${res.status}`);
  return res.json();
}

export async function getDuplicates(token: string, status?: string): Promise<{ groups: DuplicateGroup[]; total: number }> {
  const params = status ? `?status=${status}` : "";
  const res = await fetch(apiUrl(`/api/v1/ai/duplicates${params}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`List duplicates failed: ${res.status}`);
  return res.json();
}

export async function getDuplicateGroup(token: string, groupId: string): Promise<DuplicateGroup> {
  const res = await fetch(apiUrl(`/api/v1/ai/duplicates/${groupId}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get duplicate group failed: ${res.status}`);
  return res.json();
}

// ---- BYOK Config ----

export async function getAIConfig(token: string): Promise<AIConfig> {
  const res = await fetch(apiUrl("/api/v1/ai/config"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get AI config failed: ${res.status}`);
  return res.json();
}

export async function saveAIConfig(token: string, apiKey: string, model?: string): Promise<void> {
  const res = await fetch(apiUrl("/api/v1/ai/config"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, model_preference: model }),
  });
  if (!res.ok) throw new Error(`Save AI config failed: ${res.status}`);
}

export async function validateAIKey(token: string): Promise<{ valid: boolean; error?: string }> {
  const res = await fetch(apiUrl("/api/v1/ai/config/validate"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Validate key failed: ${res.status}`);
  return res.json();
}

// ---- Spend ----

export async function getSpend(token: string): Promise<SpendSummary> {
  const res = await fetch(apiUrl("/api/v1/ai/spend"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get spend failed: ${res.status}`);
  return res.json();
}

export async function getCredits(token: string): Promise<CreditSummary> {
  const res = await fetch(apiUrl("/api/v1/ai/credits"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get credits failed: ${res.status}`);
  return res.json();
}

export async function setSpendCap(token: string, capPaisa: number): Promise<void> {
  const res = await fetch(apiUrl("/api/v1/ai/spend/cap"), {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ monthly_cap_paisa: capPaisa }),
  });
  if (!res.ok) throw new Error(`Set spend cap failed: ${res.status}`);
}

// ---- Jobs ----

export async function getJob(token: string, jobId: string): Promise<AIJob> {
  const res = await fetch(apiUrl(`/api/v1/ai/jobs/${jobId}`), {
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
  const res = await fetch(apiUrl("/api/v1/ai/cull"), {
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
  const res = await fetch(apiUrl(`/api/v1/ai/cull/${jobId}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get culling suggestions failed: ${res.status}`);
  return res.json();
}
