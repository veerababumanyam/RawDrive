/**
 * Admin Service
 *
 * API client for platform administration operations including:
 * - Platform admin management (list, grant, revoke roles)
 * - Workspace search and management
 * - Support access sessions
 * - Audit logs
 *
 * @module adminService
 */

import { apiClient } from './api';
import type {
  PlatformAdmin,
  AdminAuditLog,
  SupportAccessSession,
  AdminWorkspaceSearchResult,
  AdminDashboardStats,
  ListPlatformAdminsQuery,
  ListAdminAuditLogsQuery,
  ListSupportAccessSessionsQuery,
  StartSupportAccessRequest,
  StartSupportAccessResponse,
  AssignPlatformRoleRequest,
  RevokePlatformRoleRequest,
} from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

interface MessageResponse {
  message: string;
}

// ---------------------------------------------------------------------------
// Platform Admin Management
// ---------------------------------------------------------------------------

/**
 * List all platform admins with optional filtering
 */
export async function listPlatformAdmins(
  params?: ListPlatformAdminsQuery
): Promise<PaginatedResponse<PlatformAdmin>> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('per_page', String(params.limit));
  if (params?.role_type) searchParams.set('role_type', params.role_type);
  if (params?.search) searchParams.set('search', params.search);

  const url = `/api/v1/admin/admins${searchParams.toString() ? `?${searchParams}` : ''}`;
  const response = await apiClient.get<PaginatedResponse<PlatformAdmin>>(url);
  if (!response.data) throw new Error(response.error?.message || 'Failed to list platform admins');
  return response.data;
}

/**
 * Grant a platform role to a user
 */
export async function grantPlatformRole(
  userId: string,
  roleName: string
): Promise<MessageResponse> {
  const response = await apiClient.post<MessageResponse>(`/api/v1/admin/admins/${userId}/roles`, {
    role: roleName,
  });
  if (!response.data) throw new Error(response.error?.message || 'Failed to grant platform role');
  return response.data;
}

/**
 * Revoke a platform role from a user
 */
export async function revokePlatformRole(
  userId: string,
  roleName: string
): Promise<MessageResponse> {
  const response = await apiClient.delete<MessageResponse>(`/api/v1/admin/admins/${userId}/roles/${roleName}`);
  if (!response.data) throw new Error(response.error?.message || 'Failed to revoke platform role');
  return response.data;
}

// ---------------------------------------------------------------------------
// Workspace Management
// ---------------------------------------------------------------------------

/**
 * List all workspaces with optional filtering
 */
export async function listWorkspaces(params?: {
  page?: number;
  per_page?: number;
  status?: string;
  search?: string;
}): Promise<PaginatedResponse<AdminWorkspaceSearchResult>> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.per_page) searchParams.set('per_page', String(params.per_page));
  if (params?.status) searchParams.set('status', params.status);
  if (params?.search) searchParams.set('search', params.search);

  const url = `/api/v1/admin/workspaces${searchParams.toString() ? `?${searchParams}` : ''}`;
  const response = await apiClient.get<PaginatedResponse<AdminWorkspaceSearchResult>>(url);
  if (!response.data) throw new Error(response.error?.message || 'Failed to list workspaces');
  return response.data;
}

// ---------------------------------------------------------------------------
// Support Access Sessions
// ---------------------------------------------------------------------------

/**
 * Start a support access session for a workspace
 */
export async function startSupportSession(
  workspaceId: string,
  justification: string
): Promise<SupportAccessSession> {
  const response = await apiClient.post<SupportAccessSession>(`/api/v1/admin/workspaces/${workspaceId}/support-access`, {
    justification,
  });
  if (!response.data) throw new Error(response.error?.message || 'Failed to start support session');
  return response.data;
}

/**
 * End an active support session
 */
export async function endSupportSession(sessionId: string): Promise<MessageResponse> {
  const response = await apiClient.delete<MessageResponse>(`/api/v1/admin/support-access/${sessionId}`);
  if (!response.data) throw new Error(response.error?.message || 'Failed to end support session');
  return response.data;
}

/**
 * List support access sessions
 */
export async function listSupportSessions(params?: {
  include_expired?: boolean;
}): Promise<SupportAccessSession[]> {
  const searchParams = new URLSearchParams();
  if (params?.include_expired) searchParams.set('include_expired', 'true');

  const url = `/api/v1/admin/support-access${searchParams.toString() ? `?${searchParams}` : ''}`;
  const response = await apiClient.get<SupportAccessSession[]>(url);
  if (!response.data) throw new Error(response.error?.message || 'Failed to list support sessions');
  return response.data;
}

// ---------------------------------------------------------------------------
// Dashboard Stats
// ---------------------------------------------------------------------------

/**
 * Get admin dashboard statistics
 */
export async function getDashboardStats(): Promise<AdminDashboardStats> {
  const response = await apiClient.get<AdminDashboardStats>('/api/v1/admin/dashboard/stats');
  if (!response.data) throw new Error(response.error?.message || 'Failed to get dashboard stats');
  return response.data;
}

// ---------------------------------------------------------------------------
// Audit Logs
// ---------------------------------------------------------------------------

/**
 * List admin audit logs with optional filtering
 */
export async function listAuditLogs(
  params?: ListAdminAuditLogsQuery
): Promise<PaginatedResponse<AdminAuditLog>> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('per_page', String(params.limit));
  if (params?.admin_user_id) searchParams.set('admin_user_id', params.admin_user_id);
  if (params?.action_type) searchParams.set('action_type', params.action_type);
  if (params?.target_workspace_id) searchParams.set('target_workspace_id', params.target_workspace_id);
  if (params?.after) searchParams.set('after', params.after);
  if (params?.before) searchParams.set('before', params.before);

  const url = `/api/v1/admin/audit-logs${searchParams.toString() ? `?${searchParams}` : ''}`;
  const response = await apiClient.get<PaginatedResponse<AdminAuditLog>>(url);
  if (!response.data) throw new Error(response.error?.message || 'Failed to list audit logs');
  return response.data;
}

// ---------------------------------------------------------------------------
// Export service object
// ---------------------------------------------------------------------------

export const adminService = {
  // Admin management
  listPlatformAdmins,
  grantPlatformRole,
  revokePlatformRole,

  // Workspace management
  listWorkspaces,

  // Support sessions
  startSupportSession,
  endSupportSession,
  listSupportSessions,

  // Dashboard
  getDashboardStats,

  // Audit logs
  listAuditLogs,
};

export default adminService;
