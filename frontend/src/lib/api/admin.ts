const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// ── Types ──

export type UserStatus = "active" | "suspended" | "deleted";

export interface AdminUser {
  id: string;
  email: string;
  phone?: string;
  full_name: string;
  platform_role: string;
  status: UserStatus;
  state_id?: string;
  state_name?: string;
  tier_slug?: string;
  tier_name?: string;
  workspace_count: number;
  created_at: string;
  last_login_at?: string;
}

export interface AdminUserDetail extends AdminUser {
  avatar_url?: string;
  subscription?: {
    plan_id: string;
    plan_name: string;
    tier_slug: string;
    status: string;
    expires_at?: string;
  };
  workspaces: { id: string; name: string; type: string; role: string }[];
  recent_audit_logs: AuditLogEntry[];
}

export interface ModerationItem {
  id: string;
  content_type: string;
  content_id: string;
  workspace_id: string;
  reason: string;
  reporter_id?: string;
  status: string;
  reviewed_by?: string;
  reviewed_at?: string;
  notes?: string;
  created_at: string;
}

export interface RevenueData {
  mrr_paisa: number;
  arr_paisa: number;
  churn_rate: number;
  total_subscribers: number;
  state_breakdown: { state_name: string; revenue_paisa: number; subscriber_count: number }[];
}

export interface RevenueTimeSeries {
  period: string;
  revenue_paisa: number;
  subscribers: number;
}

export interface EngagementMetrics {
  dau: number;
  wau: number;
  mau: number;
  uploads_today: number;
  galleries_created: number;
  avg_session_minutes: number;
}

export interface GrowthMetrics {
  total_users: number;
  new_users_today: number;
  new_users_week: number;
  new_users_month: number;
  timeseries: { date: string; new_users: number; cumulative: number }[];
}

export interface FeatureAdoption {
  feature: string;
  adoption_pct: number;
  active_users: number;
}

export interface SystemMetrics {
  api_latency_p50_ms: number;
  api_latency_p95_ms: number;
  api_latency_p99_ms: number;
  error_rate_pct: number;
  queue_depth: number;
  storage_used_bytes: number;
  cpu_usage_pct: number;
  memory_usage_pct: number;
  disk_usage_pct: number;
  uptime_seconds: number;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string;
  actor_type?: string;
  actor_email?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  workspace_id?: string;
  state_id?: string;
  severity: string;
  inserted_at: string;
}

export interface WorkspaceOverview {
  id: string;
  name: string;
  owner_name: string;
  state_name?: string;
  storage_used_bytes: number;
  asset_count: number;
  subscription_tier?: string;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total_count: number;
  next_cursor?: string;
}

// ── Helpers ──

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

async function get<T>(token: string, path: string, params?: Record<string, string>): Promise<T> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  const res = await fetch(`${API_BASE}/api/v1/admin${path}${query}`, { headers: headers(token) });
  if (!res.ok) throw new Error(`Admin API error: ${res.status}`);
  return res.json();
}

async function put<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1/admin${path}`, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Admin API error: ${res.status}`);
  return res.json();
}

async function post<T>(token: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1/admin${path}`, {
    method: "POST",
    headers: headers(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Admin API error: ${res.status}`);
  return res.json();
}

// ── User Management ──

export async function listUsers(token: string, params?: Record<string, string>): Promise<PaginatedResponse<AdminUser>> {
  return get(token, "/users", params);
}

export async function getUserDetail(token: string, id: string): Promise<AdminUserDetail> {
  return get(token, `/users/${id}`);
}

export async function suspendUser(token: string, id: string, reason: string): Promise<void> {
  await post(token, `/users/${id}/suspend`, { reason });
}

export async function reactivateUser(token: string, id: string): Promise<void> {
  await post(token, `/users/${id}/reactivate`);
}

export async function impersonateUser(token: string, id: string): Promise<{ token: string }> {
  return post(token, `/users/${id}/impersonate`);
}

export async function changeUserRole(token: string, id: string, role: string): Promise<void> {
  // Backend handler (admin_users.go ChangeRole) expects { role: string }.
  // The body was previously { platform_role } which returned 400 "role is required".
  await put(token, `/users/${id}/role`, { role });
}

export async function deleteUser(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to delete user: ${res.status}`);
}

// ── Moderation ──

export async function listModerationQueue(token: string, params?: Record<string, string>): Promise<PaginatedResponse<ModerationItem>> {
  return get(token, "/moderation", params);
}

export async function approveModeration(token: string, id: string): Promise<void> {
  await put(token, `/moderation/${id}/approve`, {});
}

export async function rejectModeration(token: string, id: string, reason: string): Promise<void> {
  await put(token, `/moderation/${id}/reject`, { reason });
}

export async function escalateModeration(token: string, id: string, notes: string): Promise<void> {
  await put(token, `/moderation/${id}/escalate`, { notes });
}

// ── Workspaces ──

export async function listWorkspaces(token: string, params?: Record<string, string>): Promise<PaginatedResponse<WorkspaceOverview>> {
  return get(token, "/workspaces", params);
}

export async function getWorkspaceDetail(token: string, id: string): Promise<WorkspaceOverview> {
  return get(token, `/workspaces/${id}`);
}

// ── Upload credit grants (M41 FR-UCRT-03) ──

export interface GrantUploadCreditsRequest {
  amount_credits: number;
  idempotency_key: string;
  reason: string;
}

export interface GrantUploadCreditsResponse {
  ledger_entry_id: string;
  workspace_id: string;
  amount_credits: number;
  idempotency_key: string;
  created_at: string;
}

/**
 * Super-admin grants upload credits to a workspace.
 * POST /api/v1/admin/workspaces/{id}/upload-credits/grant
 *
 * Backend (admin_upload_credits_handler.go) returns:
 *  - 200 with adminGrantResponse on success
 *  - 400 {error_code:"INVALID_WORKSPACE_ID"|"INVALID_GRANT_INPUT"|"ACTOR_ID_MISSING"}
 *  - 422 {error_code:"GRANT_CAP_EXCEEDED"} — per-grant cap is 100_000
 *  - 403 on missing super_admin/admin role (caught by RequirePlatformRole)
 *  - 500 {error:"grant_failed"} on service errors
 *
 * Parses the structured error envelope so callers can show actionable
 * messages instead of "Admin API error: 422".
 */
export interface AdminWorkspaceUploadBalance {
  workspace_id: string;
  available_credits: number;
  plan_granted: number;
  purchased: number;
  reserved: number;
  consumed: number;
  refunded: number;
  updated_at: string;
  low_balance: boolean;
  low_balance_threshold: number;
}

/**
 * Super-admin read of a workspace's upload-credit balance.
 * GET /api/v1/admin/workspaces/{id}/upload-credits/balance
 *
 * Distinct from the user-facing /api/v1/uploads/balance which resolves
 * the workspace from the caller's JWT — this endpoint takes the
 * workspace id from the URL so admins can inspect any workspace.
 *
 * 500 is NOT silently coerced to a zero-balance fallback: admins must
 * see data-reliability errors truthfully or they could grant credits
 * on top of a workspace whose balance lookup is actually broken.
 */
export async function getAdminWorkspaceUploadBalance(
  token: string,
  workspaceId: string,
): Promise<AdminWorkspaceUploadBalance> {
  const res = await fetch(
    `${API_BASE}/api/v1/admin/workspaces/${workspaceId}/upload-credits/balance`,
    { headers: headers(token) },
  );
  if (!res.ok) {
    throw new Error(`Balance lookup failed: HTTP ${res.status}`);
  }
  return (await res.json()) as AdminWorkspaceUploadBalance;
}

export async function grantUploadCredits(
  token: string,
  workspaceId: string,
  body: GrantUploadCreditsRequest,
): Promise<GrantUploadCreditsResponse> {
  const res = await fetch(
    `${API_BASE}/api/v1/admin/workspaces/${workspaceId}/upload-credits/grant`,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body),
    },
  );
  if (res.ok) {
    return (await res.json()) as GrantUploadCreditsResponse;
  }
  // Try to parse the structured error envelope; fall back to status text.
  let message = `HTTP ${res.status}`;
  try {
    const payload = (await res.json()) as { error_code?: string; error?: string };
    if (payload.error_code === "GRANT_CAP_EXCEEDED") {
      message = "Amount exceeds the per-grant cap of 100,000 credits.";
    } else if (payload.error) {
      message = payload.error;
    }
  } catch {
    /* non-JSON body — stick with HTTP status */
  }
  throw new Error(message);
}

// ── Revenue ──

export async function getRevenueDashboard(token: string): Promise<RevenueData> {
  return get(token, "/revenue");
}

export async function getRevenueTimeSeries(token: string, params?: Record<string, string>): Promise<RevenueTimeSeries[]> {
  return get(token, "/revenue/timeseries", params);
}

export async function getRevenueStateBreakdown(token: string): Promise<RevenueData["state_breakdown"]> {
  return get(token, "/revenue/states");
}

// ── Analytics ──

export async function getEngagementMetrics(token: string): Promise<EngagementMetrics> {
  return get(token, "/analytics/engagement");
}

export async function getGrowthMetrics(token: string): Promise<GrowthMetrics> {
  return get(token, "/analytics/growth");
}

export async function getFeatureAdoption(token: string): Promise<FeatureAdoption[]> {
  return get(token, "/analytics/features");
}

// ── Export ──

export async function exportUsers(token: string, params?: Record<string, string>): Promise<Blob> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  const res = await fetch(`${API_BASE}/api/v1/admin/export/users${query}`, { headers: headers(token) });
  if (!res.ok) throw new Error("Export failed");
  return res.blob();
}

export async function exportRevenue(token: string, params?: Record<string, string>): Promise<Blob> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  const res = await fetch(`${API_BASE}/api/v1/admin/export/revenue${query}`, { headers: headers(token) });
  if (!res.ok) throw new Error("Export failed");
  return res.blob();
}

// ── System Health ──

export async function getSystemMetrics(token: string): Promise<SystemMetrics> {
  return get(token, "/system/metrics");
}

// ── Audit Logs ──

export async function listAuditLogs(token: string, params?: Record<string, string>): Promise<PaginatedResponse<AuditLogEntry>> {
  return get(token, "/audit-logs", params);
}

export async function getAuditLogDetail(token: string, id: string): Promise<AuditLogEntry> {
  return get(token, `/audit-logs/${id}`);
}

export async function exportAuditLogs(token: string, params?: Record<string, string>): Promise<Blob> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  const res = await fetch(`${API_BASE}/api/v1/admin/audit-logs/export${query}`, { headers: headers(token) });
  if (!res.ok) throw new Error("Export failed");
  return res.blob();
}

// ── M16: Workspace Upload Policy + Moderation ──

export type UploadPolicyMode =
  | "standard"
  | "strict_client_scan"
  | "strict_original_preservation";

export interface WorkspacePolicyResponse {
  workspace_id: string;
  mode: UploadPolicyMode;
}

export async function getWorkspaceUploadPolicy(
  token: string,
  workspaceId: string
): Promise<WorkspacePolicyResponse> {
  return get(token, `/workspaces/${workspaceId}/upload-policy`);
}

export async function setWorkspaceUploadPolicy(
  token: string,
  workspaceId: string,
  mode: UploadPolicyMode
): Promise<WorkspacePolicyResponse> {
  const res = await fetch(
    `${API_BASE}/api/v1/admin/workspaces/${workspaceId}/upload-policy`,
    {
      method: "PUT",
      headers: headers(token),
      body: JSON.stringify({ mode }),
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to set policy: ${res.status}`);
  }
  return res.json();
}

export interface BlockedAssetRow {
  asset_id: string;
  workspace_id: string;
  filename: string;
  scan_status: string;
  scan_engine: string;
  policy_version: string;
  risk_score: number;
  findings?: string;
  manifest_hash: string;
  created_at: string;
}

export async function listUploadModerationQueue(
  token: string,
  workspaceId: string,
  params?: { limit?: number; offset?: number }
): Promise<{ queue: BlockedAssetRow[] }> {
  const q: Record<string, string> = { workspace_id: workspaceId };
  if (params?.limit !== undefined) q.limit = String(params.limit);
  if (params?.offset !== undefined) q.offset = String(params.offset);
  return get(token, "/upload-moderation", q);
}

export interface OverrideResponse {
  asset_id: string;
  token: string;
  expires_at: string;
}

export async function overrideUploadBlock(
  token: string,
  assetId: string,
  justification: string,
  ttlHours = 24
): Promise<OverrideResponse> {
  const res = await fetch(
    `${API_BASE}/api/v1/admin/upload-moderation/${assetId}/override`,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ justification, ttl_hours: ttlHours }),
    }
  );
  if (!res.ok) throw new Error(`Override failed: ${res.status}`);
  return res.json();
}

export interface UploadModerationAnalytics {
  total_scanned: number;
  total_passed: number;
  total_blocked: number;
  total_needs_desktop: number;
  total_override: number;
  block_rate: number;
  tier_d_causes: Record<string, number>;
  window_start: string;
  window_end: string;
}

export async function getUploadModerationAnalytics(
  token: string,
  workspaceId: string,
  since?: string
): Promise<UploadModerationAnalytics> {
  const q: Record<string, string> = { workspace_id: workspaceId };
  if (since) q.since = since;
  return get(token, "/upload-moderation/analytics", q);
}

// ── M39 E5-S2: admin user create ──
export interface CreateUserInput {
  email: string;
  full_name: string;
  role: string;
  initial_password?: string;
  send_invite?: boolean;
  // 2026-05-19: optional admin-granted plan comp. When set, the
  // backend writes users.pending_plan_tier (migration 113) and the
  // onboarding flow applies the tier at workspace-creation time.
  // Valid values: free | starter | professional | business |
  // enterprise. Only valid for role="photographer"; other roles
  // produce 400 invalid_plan_tier.
  plan_tier?: string;
}

// 2026-05-19: dynamic plan catalog served from GET /api/v1/admin/plans.
// Replaces the prior approach of importing pricingPlans from
// src/lib/tokens.ts so the admin dropdown reflects backend truth and
// can change without a frontend re-bundle.
export interface AdminPlan {
  tier: string;
  name: string;
  monthly_price_paise: number;
}

export interface ListAdminPlansResponse {
  plans: AdminPlan[];
}

export async function listAdminPlans(token: string): Promise<AdminPlan[]> {
  const res = await fetch(`${API_BASE}/api/v1/admin/plans`, {
    headers: headers(token),
  });
  if (!res.ok) {
    throw new Error(`List admin plans failed: ${res.status}`);
  }
  const body = (await res.json()) as ListAdminPlansResponse;
  return Array.isArray(body.plans) ? body.plans : [];
}

/**
 * Create a new user as an admin. Returns the created user detail.
 * 201 password-path, 202 invite-path — both resolve as OK.
 * Rejects superadmin role, duplicate email, or invalid email with
 * a thrown Error whose message contains the backend `code`.
 */
export async function createUser(token: string, input: CreateUserInput): Promise<AdminUserDetail> {
  const res = await fetch(`${API_BASE}/api/v1/admin/users`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let msg = `Create user failed: ${res.status}`;
    try {
      const b = await res.json();
      if (b?.error) msg = String(b.error);
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// ── M39 E7-S2/E7-S3: dealer admin actions ──
/**
 * Soft-delete a dealer (204 on success, 404 missing, 409 already deleted).
 */
export async function deleteDealer(token: string, dealerId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/admin/dealers/${dealerId}`, {
    method: "DELETE",
    headers: headers(token),
  });
  if (!res.ok) {
    let msg = `Delete dealer failed: ${res.status}`;
    try {
      const b = await res.json();
      if (b?.error) msg = String(b.error);
    } catch {}
    throw new Error(msg);
  }
}

/**
 * Search admin dealers by business name / email / phone (q=). Preserves
 * pagination contract of GET /api/v1/admin/dealers.
 */
export async function searchDealers(token: string, q: string, limit = 20): Promise<unknown[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (limit) params.set("limit", String(limit));
  const res = await fetch(`${API_BASE}/api/v1/admin/dealers?${params.toString()}`, {
    headers: headers(token),
  });
  if (!res.ok) throw new Error(`Dealers search failed: ${res.status}`);
  return res.json();
}
