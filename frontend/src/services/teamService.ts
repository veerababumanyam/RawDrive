/**
 * Team Service
 *
 * Service for managing workspace team members, invitations, and roles.
 * Provides API methods for team management operations in multi-user workspaces.
 *
 * Backend API Routes:
 * - GET /api/v1/workspaces/{id}/members - List members
 * - DELETE /api/v1/workspaces/{id}/members/{user_id} - Remove member
 * - POST /api/v1/workspaces/{id}/members/invite - Send invitation
 * - GET /api/v1/workspaces/{id}/invitations - List invitations
 * - DELETE /api/v1/workspaces/{id}/invitations/{id} - Revoke invitation
 * - GET /api/v1/workspaces/{id}/roles - List roles
 * - POST /api/v1/workspaces/{id}/roles - Create custom role
 * - PATCH /api/v1/workspaces/{id}/roles/{id} - Update role
 * - DELETE /api/v1/workspaces/{id}/roles/{id} - Delete role
 * - POST /api/v1/invitations/accept - Accept invitation (public)
 * - GET /api/v1/invitations/{token} - Get invitation preview (public)
 */

import apiClient, { ApiResponse } from './api';

// =============================================================================
// Types
// =============================================================================

/**
 * Workspace member status
 */
export type MemberStatus = 'active' | 'pending' | 'suspended' | 'removed';

/**
 * Invitation status
 */
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

/**
 * Workspace member response from API
 */
export interface WorkspaceMember {
  membership_id: string;
  user_id: string;
  user_email: string;
  user_display_name: string;
  status: MemberStatus;
  roles: string[];
  invited_at: string | null;
  accepted_at: string | null;
}

/**
 * Paginated member list response
 */
export interface MemberListResponse {
  items: WorkspaceMember[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

/**
 * Role information
 */
export interface Role {
  role_id: string;
  workspace_id: string;
  name: string;
  permissions: string[];
  is_system: boolean;
  created_at: string;
}

/**
 * Role list response
 */
export interface RoleListResponse {
  items: Role[];
}

/**
 * Workspace invitation response
 */
export interface WorkspaceInvitation {
  invitation_id: string;
  workspace_id: string;
  email: string;
  status: InvitationStatus;
  roles: string[];
  invited_by: string;
  created_at: string;
  expires_at: string;
}

/**
 * Invitation preview for public acceptance flow
 */
export interface InvitationPreview {
  invitation_id: string;
  workspace_name: string;
  workspace_slug: string;
  email: string;
  roles: string[];
  invited_by: string;
  expires_at: string;
  is_expired: boolean;
}

/**
 * Request to invite a new member
 */
export interface InviteMemberRequest {
  email: string;
  role_ids: string[];
}

/**
 * Request to create a custom role
 */
export interface CreateRoleRequest {
  name: string;
  permissions: string[];
}

/**
 * Request to update a role
 */
export interface UpdateRoleRequest {
  name?: string;
  permissions?: string[];
}

/**
 * Request to accept an invitation
 */
export interface AcceptInvitationRequest {
  token: string;
}

/**
 * Response from accepting an invitation
 */
export interface AcceptInvitationResponse {
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  roles: string[];
}

/**
 * Simple message response
 */
export interface MessageResponse {
  message: string;
  success?: boolean;
}

/**
 * Request to update a member's roles
 */
export interface UpdateMemberRolesRequest {
  role_ids: string[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Helper to unwrap API responses and throw on errors
 */
function unwrapResponse<T>(response: ApiResponse<T>, errorMessage: string): T {
  if (response.error) {
    throw new Error(response.error.message || errorMessage);
  }
  return response.data!;
}

// =============================================================================
// Member Operations
// =============================================================================

/**
 * List all members in a workspace
 *
 * @param workspaceId - The workspace ID
 * @returns List of workspace members with pagination
 */
export async function listMembers(workspaceId: string): Promise<MemberListResponse> {
  const response = await apiClient.get<MemberListResponse>(
    `/api/v1/workspaces/${workspaceId}/members`
  );
  return unwrapResponse(response, 'Failed to fetch workspace members');
}

/**
 * Remove a member from the workspace
 *
 * @param workspaceId - The workspace ID
 * @param userId - The user ID to remove
 * @returns Success message
 */
export async function removeMember(
  workspaceId: string,
  userId: string
): Promise<MessageResponse> {
  const response = await apiClient.delete<MessageResponse>(
    `/api/v1/workspaces/${workspaceId}/members/${userId}`
  );
  return unwrapResponse(response, 'Failed to remove member');
}

/**
 * Update a member's roles
 * Note: This endpoint may need to be added to the backend
 *
 * @param workspaceId - The workspace ID
 * @param userId - The user ID to update
 * @param roleIds - The new role IDs to assign
 * @returns Updated member information
 */
export async function updateMemberRoles(
  workspaceId: string,
  userId: string,
  roleIds: string[]
): Promise<WorkspaceMember> {
  const response = await apiClient.patch<WorkspaceMember>(
    `/api/v1/workspaces/${workspaceId}/members/${userId}/roles`,
    { role_ids: roleIds }
  );
  return unwrapResponse(response, 'Failed to update member roles');
}

// =============================================================================
// Invitation Operations
// =============================================================================

/**
 * Send an invitation to join the workspace
 *
 * @param workspaceId - The workspace ID
 * @param data - Invitation request data (email and role IDs)
 * @returns Created invitation details
 */
export async function inviteMember(
  workspaceId: string,
  data: InviteMemberRequest
): Promise<WorkspaceInvitation> {
  const response = await apiClient.post<WorkspaceInvitation>(
    `/api/v1/workspaces/${workspaceId}/members/invite`,
    data
  );
  return unwrapResponse(response, 'Failed to send invitation');
}

/**
 * List all invitations for a workspace
 *
 * @param workspaceId - The workspace ID
 * @param status - Optional status filter ('pending', 'accepted', 'expired', 'revoked')
 * @returns List of invitations
 */
export async function listInvitations(
  workspaceId: string,
  status?: InvitationStatus
): Promise<WorkspaceInvitation[]> {
  const queryParams = status ? `?status=${status}` : '';
  const response = await apiClient.get<WorkspaceInvitation[]>(
    `/api/v1/workspaces/${workspaceId}/invitations${queryParams}`
  );
  return unwrapResponse(response, 'Failed to fetch invitations');
}

/**
 * Revoke a pending invitation
 *
 * @param workspaceId - The workspace ID
 * @param invitationId - The invitation ID to revoke
 * @returns Success message
 */
export async function revokeInvitation(
  workspaceId: string,
  invitationId: string
): Promise<MessageResponse> {
  const response = await apiClient.delete<MessageResponse>(
    `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}`
  );
  return unwrapResponse(response, 'Failed to revoke invitation');
}

/**
 * Resend an invitation email
 * Note: This endpoint may need to be added to the backend
 *
 * @param workspaceId - The workspace ID
 * @param invitationId - The invitation ID to resend
 * @returns Success message
 */
export async function resendInvitation(
  workspaceId: string,
  invitationId: string
): Promise<MessageResponse> {
  const response = await apiClient.post<MessageResponse>(
    `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/resend`,
    {}
  );
  return unwrapResponse(response, 'Failed to resend invitation');
}

// =============================================================================
// Public Invitation Operations (No Auth Required)
// =============================================================================

/**
 * Get invitation preview by token (public endpoint)
 * Used on the invitation acceptance page before user signs in
 *
 * @param token - The invitation token
 * @returns Invitation preview details
 */
export async function getInvitationPreview(token: string): Promise<InvitationPreview> {
  const response = await apiClient.get<InvitationPreview>(
    `/api/v1/invitations/${token}`
  );
  return unwrapResponse(response, 'Failed to get invitation details');
}

/**
 * Accept an invitation (public endpoint)
 * Call this after the user has signed up or logged in
 *
 * @param token - The invitation token
 * @returns Acceptance result with workspace details
 */
export async function acceptInvitation(token: string): Promise<AcceptInvitationResponse> {
  const response = await apiClient.post<AcceptInvitationResponse>(
    `/api/v1/invitations/accept`,
    { token }
  );
  return unwrapResponse(response, 'Failed to accept invitation');
}

// =============================================================================
// Role Operations
// =============================================================================

/**
 * List all roles in a workspace
 *
 * @param workspaceId - The workspace ID
 * @returns List of roles
 */
export async function listRoles(workspaceId: string): Promise<Role[]> {
  const response = await apiClient.get<RoleListResponse>(
    `/api/v1/workspaces/${workspaceId}/roles`
  );
  const data = unwrapResponse(response, 'Failed to fetch roles');
  return data.items;
}

/**
 * Create a custom role
 *
 * @param workspaceId - The workspace ID
 * @param data - Role creation data (name and permissions)
 * @returns Created role
 */
export async function createRole(
  workspaceId: string,
  data: CreateRoleRequest
): Promise<Role> {
  const response = await apiClient.post<Role>(
    `/api/v1/workspaces/${workspaceId}/roles`,
    data
  );
  return unwrapResponse(response, 'Failed to create role');
}

/**
 * Update a custom role
 *
 * @param workspaceId - The workspace ID
 * @param roleId - The role ID to update
 * @param data - Updated role data
 * @returns Updated role
 */
export async function updateRole(
  workspaceId: string,
  roleId: string,
  data: UpdateRoleRequest
): Promise<Role> {
  const response = await apiClient.patch<Role>(
    `/api/v1/workspaces/${workspaceId}/roles/${roleId}`,
    data
  );
  return unwrapResponse(response, 'Failed to update role');
}

/**
 * Delete a custom role
 *
 * @param workspaceId - The workspace ID
 * @param roleId - The role ID to delete
 * @returns Success message
 */
export async function deleteRole(
  workspaceId: string,
  roleId: string
): Promise<MessageResponse> {
  const response = await apiClient.delete<MessageResponse>(
    `/api/v1/workspaces/${workspaceId}/roles/${roleId}`
  );
  return unwrapResponse(response, 'Failed to delete role');
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if an invitation is expired
 *
 * @param invitation - The invitation to check
 * @returns True if the invitation is expired
 */
export function isInvitationExpired(invitation: WorkspaceInvitation): boolean {
  return new Date(invitation.expires_at) < new Date() || invitation.status === 'expired';
}

/**
 * Get system role names
 * System roles are predefined and cannot be modified
 */
export const SYSTEM_ROLES = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
} as const;

/**
 * Check if a role is a system role (cannot be edited/deleted)
 *
 * @param role - The role to check
 * @returns True if this is a system role
 */
export function isSystemRole(role: Role): boolean {
  return role.is_system;
}

/**
 * Format role permissions for display
 *
 * @param permissions - Array of permission strings
 * @returns Formatted permission descriptions
 */
export function formatPermissions(permissions: string[]): string[] {
  const permissionLabels: Record<string, string> = {
    'workspace:*': 'Full workspace access',
    'settings:read': 'View settings',
    'settings:write': 'Edit settings',
    'member:read': 'View team members',
    'member:write': 'Manage team members',
    'member:invite': 'Invite team members',
    'role:read': 'View roles',
    'role:write': 'Manage roles',
    'billing:read': 'View billing',
    'billing:write': 'Manage billing',
    'gallery:read': 'View galleries',
    'gallery:write': 'Edit galleries',
    'gallery:delete': 'Delete galleries',
    'client:read': 'View clients',
    'client:write': 'Manage clients',
    'asset:read': 'View assets',
    'asset:write': 'Upload/edit assets',
    'asset:delete': 'Delete assets',
  };

  return permissions.map((p) => permissionLabels[p] || p);
}

// =============================================================================
// Export Service Object
// =============================================================================

/**
 * Team service object for convenient importing
 *
 * @example
 * import { teamService } from '@/services/teamService';
 * const members = await teamService.listMembers(workspaceId);
 */
export const teamService = {
  // Members
  listMembers,
  removeMember,
  updateMemberRoles,

  // Invitations
  inviteMember,
  listInvitations,
  revokeInvitation,
  resendInvitation,

  // Public invitation operations
  getInvitationPreview,
  acceptInvitation,

  // Roles
  listRoles,
  createRole,
  updateRole,
  deleteRole,

  // Utilities
  isInvitationExpired,
  isSystemRole,
  formatPermissions,
  SYSTEM_ROLES,
};

export default teamService;
