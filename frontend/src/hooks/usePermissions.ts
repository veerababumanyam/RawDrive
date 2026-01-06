/**
 * Permission-aware hooks for granular RBAC
 *
 * Provides hooks for checking permissions, including granular conditions
 * and time-based access. These hooks integrate with the granular permission
 * system to enable fine-grained UI access control.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PermissionCondition {
  condition_id: string;
  workspace_id: string;
  name: string;
  description?: string;
  condition_type: string;
  condition_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by_user_id?: string;
}

export interface GranularPermission {
  granular_permission_id: string;
  workspace_id: string;
  member_role_id: string;
  permission: string;
  condition_id?: string;
  condition?: PermissionCondition;
  granted_at: string;
  granted_by_user_id?: string;
  expires_at?: string;
  is_active: boolean;
  notes?: string;
}

export interface TimeBasedAssignment {
  assignment_id: string;
  workspace_id: string;
  membership_id: string;
  role_id: string;
  starts_at: string;
  expires_at: string;
  reason?: string;
  granted_by_user_id?: string;
  created_at: string;
  revoked_at?: string;
  is_active: boolean;
  days_remaining: number;
  role_name?: string;
  role_permissions?: string[];
  user_display_name?: string;
  user_email?: string;
}

export interface EffectivePermissions {
  base_permissions: string[];
  conditional_permissions: Array<{
    permission: string;
    condition: {
      condition_id: string;
      name: string;
      condition_type: string;
      condition_config: Record<string, unknown>;
    };
    expires_at?: string;
  }>;
  time_based_roles: Array<{
    role_name: string;
    permissions: string[];
    expires_at: string;
    days_remaining: number;
  }>;
}

export interface GranularPermissionCheckResult {
  allowed: boolean;
  permission: string;
  matching_condition?: PermissionCondition;
  allowed_resources?: string[];
  denial_reason?: string;
}

export interface RoleAuditLogEntry {
  audit_id: string;
  workspace_id: string;
  actor_user_id?: string;
  actor_display_name?: string;
  actor_email?: string;
  action_type: string;
  target_type: string;
  target_id: string;
  target_user_id?: string;
  target_user_display_name?: string;
  target_user_email?: string;
  previous_state?: Record<string, unknown>;
  new_state?: Record<string, unknown>;
  change_summary?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface DelegationRule {
  rule_id: string;
  workspace_id: string;
  delegator_role_id: string;
  delegator_role_name?: string;
  delegatable_permissions: string[];
  max_delegation_depth: number;
  can_set_expiration: boolean;
  max_expiration_days?: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Get the current user's effective permissions including granular and time-based.
 */
export function useEffectivePermissions(workspaceId?: string) {
  const { user } = useAuth();
  const wsId = workspaceId || user?.workspace_id;

  return useQuery<EffectivePermissions>({
    queryKey: ['permissions', 'effective', wsId],
    queryFn: async () => {
      const response = await api.get(`/api/v1/workspaces/${wsId}/permissions/effective`);
      return response.data;
    },
    enabled: !!wsId,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Check if the current user has a specific permission.
 * Returns a boolean for simple permission checks.
 */
export function useHasPermission(permission: string, workspaceId?: string): boolean {
  const { data: effectivePerms, isLoading } = useEffectivePermissions(workspaceId);

  if (isLoading || !effectivePerms) {
    return false;
  }

  // Check base permissions
  if (effectivePerms.base_permissions.includes(permission)) {
    return true;
  }

  // Check conditional permissions (without resource context)
  const hasConditional = effectivePerms.conditional_permissions.some(
    (cp) => cp.permission === permission
  );
  if (hasConditional) {
    return true;
  }

  // Check time-based roles
  const hasTimeBased = effectivePerms.time_based_roles.some((role) =>
    role.permissions.includes(permission)
  );
  if (hasTimeBased) {
    return true;
  }

  return false;
}

/**
 * Check if the current user has a permission for a specific resource.
 * Uses the granular permission check endpoint for accurate resource-level checks.
 */
export function useCheckGranularPermission(
  permission: string,
  resourceId?: string,
  resourceType?: 'gallery' | 'client' | 'asset' | 'sub_gallery',
  workspaceId?: string
) {
  const { user } = useAuth();
  const wsId = workspaceId || user?.workspace_id;

  return useQuery<GranularPermissionCheckResult>({
    queryKey: ['permissions', 'check', wsId, permission, resourceId, resourceType],
    queryFn: async () => {
      const response = await api.post(`/api/v1/workspaces/${wsId}/permissions/check`, {
        permission,
        resource_id: resourceId,
        resource_type: resourceType,
      });
      return response.data;
    },
    enabled: !!wsId && !!permission,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to check multiple permissions at once.
 * Returns an object with permission keys and boolean values.
 */
export function useHasPermissions(
  permissions: string[],
  workspaceId?: string
): Record<string, boolean> {
  const { data: effectivePerms, isLoading } = useEffectivePermissions(workspaceId);

  if (isLoading || !effectivePerms) {
    return permissions.reduce(
      (acc, p) => ({ ...acc, [p]: false }),
      {} as Record<string, boolean>
    );
  }

  return permissions.reduce((acc, permission) => {
    const hasBase = effectivePerms.base_permissions.includes(permission);
    const hasConditional = effectivePerms.conditional_permissions.some(
      (cp) => cp.permission === permission
    );
    const hasTimeBased = effectivePerms.time_based_roles.some((role) =>
      role.permissions.includes(permission)
    );

    return { ...acc, [permission]: hasBase || hasConditional || hasTimeBased };
  }, {} as Record<string, boolean>);
}

/**
 * List permission conditions in a workspace.
 */
export function usePermissionConditions(workspaceId?: string, conditionType?: string) {
  const { user } = useAuth();
  const wsId = workspaceId || user?.workspace_id;

  return useQuery<{ items: PermissionCondition[]; total: number }>({
    queryKey: ['permissions', 'conditions', wsId, conditionType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (conditionType) {
        params.set('condition_type', conditionType);
      }
      const response = await api.get(
        `/api/v1/workspaces/${wsId}/permissions/conditions?${params}`
      );
      return response.data;
    },
    enabled: !!wsId,
  });
}

/**
 * Create a permission condition.
 */
export function useCreateCondition(workspaceId?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const wsId = workspaceId || user?.workspace_id;

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      condition_type: string;
      condition_config: Record<string, unknown>;
    }) => {
      const response = await api.post(`/api/v1/workspaces/${wsId}/permissions/conditions`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', 'conditions', wsId] });
    },
  });
}

/**
 * List time-based role assignments.
 */
export function useTimeBasedAssignments(
  workspaceId?: string,
  options?: {
    membershipId?: string;
    includeExpired?: boolean;
    includeRevoked?: boolean;
  }
) {
  const { user } = useAuth();
  const wsId = workspaceId || user?.workspace_id;

  return useQuery<{
    items: TimeBasedAssignment[];
    total: number;
    active_count: number;
    expired_count: number;
  }>({
    queryKey: ['permissions', 'time-based', wsId, options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.membershipId) {
        params.set('membership_id', options.membershipId);
      }
      if (options?.includeExpired) {
        params.set('include_expired', 'true');
      }
      if (options?.includeRevoked) {
        params.set('include_revoked', 'true');
      }
      const response = await api.get(
        `/api/v1/workspaces/${wsId}/permissions/time-based?${params}`
      );
      return response.data;
    },
    enabled: !!wsId,
  });
}

/**
 * Grant time-based access to a member.
 */
export function useGrantTimeBasedAccess(workspaceId?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const wsId = workspaceId || user?.workspace_id;

  return useMutation({
    mutationFn: async (data: {
      membership_id: string;
      role_id: string;
      starts_at?: string;
      expires_at: string;
      reason?: string;
    }) => {
      const response = await api.post(`/api/v1/workspaces/${wsId}/permissions/time-based`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', 'time-based', wsId] });
      queryClient.invalidateQueries({ queryKey: ['permissions', 'effective', wsId] });
    },
  });
}

/**
 * Revoke time-based access.
 */
export function useRevokeTimeBasedAccess(workspaceId?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const wsId = workspaceId || user?.workspace_id;

  return useMutation({
    mutationFn: async ({
      assignmentId,
      reason,
    }: {
      assignmentId: string;
      reason?: string;
    }) => {
      const response = await api.post(
        `/api/v1/workspaces/${wsId}/permissions/time-based/${assignmentId}/revoke`,
        { reason }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', 'time-based', wsId] });
      queryClient.invalidateQueries({ queryKey: ['permissions', 'effective', wsId] });
    },
  });
}

/**
 * List role audit logs.
 */
export function useRoleAuditLogs(
  workspaceId?: string,
  options?: {
    actionType?: string;
    targetType?: string;
    targetId?: string;
    actorUserId?: string;
    targetUserId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }
) {
  const { user } = useAuth();
  const wsId = workspaceId || user?.workspace_id;

  return useQuery<{
    items: RoleAuditLogEntry[];
    total: number;
    limit: number;
    offset: number;
  }>({
    queryKey: ['permissions', 'audit-log', wsId, options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.actionType) params.set('action_type', options.actionType);
      if (options?.targetType) params.set('target_type', options.targetType);
      if (options?.targetId) params.set('target_id', options.targetId);
      if (options?.actorUserId) params.set('actor_user_id', options.actorUserId);
      if (options?.targetUserId) params.set('target_user_id', options.targetUserId);
      if (options?.startDate) params.set('start_date', options.startDate);
      if (options?.endDate) params.set('end_date', options.endDate);
      if (options?.limit) params.set('limit', options.limit.toString());
      if (options?.offset) params.set('offset', options.offset.toString());

      const response = await api.get(
        `/api/v1/workspaces/${wsId}/permissions/audit-log?${params}`
      );
      return response.data;
    },
    enabled: !!wsId,
  });
}

/**
 * List delegation rules.
 */
export function useDelegationRules(workspaceId?: string) {
  const { user } = useAuth();
  const wsId = workspaceId || user?.workspace_id;

  return useQuery<{ items: DelegationRule[]; total: number }>({
    queryKey: ['permissions', 'delegation-rules', wsId],
    queryFn: async () => {
      const response = await api.get(`/api/v1/workspaces/${wsId}/permissions/delegation-rules`);
      return response.data;
    },
    enabled: !!wsId,
  });
}

/**
 * Create a delegation rule.
 */
export function useCreateDelegationRule(workspaceId?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const wsId = workspaceId || user?.workspace_id;

  return useMutation({
    mutationFn: async (data: {
      delegator_role_id: string;
      delegatable_permissions: string[];
      max_delegation_depth?: number;
      can_set_expiration?: boolean;
      max_expiration_days?: number;
    }) => {
      const response = await api.post(
        `/api/v1/workspaces/${wsId}/permissions/delegation-rules`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', 'delegation-rules', wsId] });
    },
  });
}

/**
 * List granular permissions.
 */
export function useGranularPermissions(
  workspaceId?: string,
  options?: {
    memberRoleId?: string;
    permission?: string;
    includeInactive?: boolean;
  }
) {
  const { user } = useAuth();
  const wsId = workspaceId || user?.workspace_id;

  return useQuery<{ items: GranularPermission[]; total: number }>({
    queryKey: ['permissions', 'granular', wsId, options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.memberRoleId) params.set('member_role_id', options.memberRoleId);
      if (options?.permission) params.set('permission', options.permission);
      if (options?.includeInactive) params.set('include_inactive', 'true');

      const response = await api.get(
        `/api/v1/workspaces/${wsId}/permissions/granular?${params}`
      );
      return response.data;
    },
    enabled: !!wsId,
  });
}

/**
 * Grant a granular permission.
 */
export function useGrantGranularPermission(workspaceId?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const wsId = workspaceId || user?.workspace_id;

  return useMutation({
    mutationFn: async (data: {
      member_role_id: string;
      permission: string;
      condition_id?: string;
      expires_at?: string;
      notes?: string;
    }) => {
      const response = await api.post(`/api/v1/workspaces/${wsId}/permissions/granular`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', 'granular', wsId] });
      queryClient.invalidateQueries({ queryKey: ['permissions', 'effective', wsId] });
    },
  });
}

/**
 * Revoke a granular permission.
 */
export function useRevokeGranularPermission(workspaceId?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const wsId = workspaceId || user?.workspace_id;

  return useMutation({
    mutationFn: async (permissionId: string) => {
      await api.delete(`/api/v1/workspaces/${wsId}/permissions/granular/${permissionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', 'granular', wsId] });
      queryClient.invalidateQueries({ queryKey: ['permissions', 'effective', wsId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Permission Constants
// ---------------------------------------------------------------------------

/**
 * Workspace-level permissions available in the system.
 */
export const WORKSPACE_PERMISSIONS = [
  'workspace:read',
  'workspace:write',
  'workspace:delete',
  'members:read',
  'members:write',
  'members:invite',
  'roles:read',
  'roles:write',
  'galleries:read',
  'galleries:write',
  'galleries:delete',
  'assets:read',
  'assets:write',
  'assets:delete',
  'billing:read',
  'billing:write',
  'audit:read',
] as const;

export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];

/**
 * Permission condition types available in the system.
 */
export const PERMISSION_CONDITION_TYPES = [
  'gallery_status',
  'gallery_ids',
  'client_ids',
  'date_range',
  'asset_type',
  'tag_filter',
  'sub_gallery_ids',
  'custom',
] as const;

export type PermissionConditionType = (typeof PERMISSION_CONDITION_TYPES)[number];

/**
 * Role audit action types.
 */
export const ROLE_AUDIT_ACTION_TYPES = [
  'role_created',
  'role_updated',
  'role_deleted',
  'permission_granted',
  'permission_revoked',
  'permission_expired',
  'member_role_assigned',
  'member_role_removed',
  'time_based_access_granted',
  'time_based_access_revoked',
  'time_based_access_expired',
  'delegation_rule_created',
  'delegation_rule_updated',
  'delegation_rule_deleted',
  'condition_created',
  'condition_updated',
  'condition_deleted',
] as const;

export type RoleAuditActionType = (typeof ROLE_AUDIT_ACTION_TYPES)[number];
