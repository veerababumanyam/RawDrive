/**
 * useTeam Hook
 *
 * React Query hooks for team management operations including:
 * - Listing and managing workspace members
 * - Sending and managing invitations
 * - Managing workspace roles
 * - Public invitation acceptance flow
 *
 * These hooks integrate with the teamService and provide caching,
 * optimistic updates, and proper cache invalidation.
 *
 * @module useTeam
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui';
import {
  teamService,
  type WorkspaceMember,
  type MemberListResponse,
  type WorkspaceInvitation,
  type InvitationPreview,
  type Role,
  type InviteMemberRequest,
  type CreateRoleRequest,
  type UpdateRoleRequest,
  type AcceptInvitationResponse,
  type MessageResponse,
  type InvitationStatus,
} from '@/services/teamService';

// =============================================================================
// Query Keys
// =============================================================================

/**
 * Query keys for team-related queries.
 * Use these for cache invalidation and prefetching.
 */
export const teamQueryKeys = {
  all: ['team'] as const,
  members: (workspaceId: string) => [...teamQueryKeys.all, 'members', workspaceId] as const,
  invitations: (workspaceId: string, status?: InvitationStatus) =>
    [...teamQueryKeys.all, 'invitations', workspaceId, status] as const,
  roles: (workspaceId: string) => [...teamQueryKeys.all, 'roles', workspaceId] as const,
  invitationPreview: (token: string) => [...teamQueryKeys.all, 'invitation-preview', token] as const,
};

// =============================================================================
// Member Hooks
// =============================================================================

export interface UseTeamMembersOptions {
  /** Whether the hook is enabled */
  enabled?: boolean;
  /** Stale time in milliseconds (default: 30 seconds) */
  staleTime?: number;
}

export interface UseTeamMembersReturn {
  /** Array of workspace members */
  members: WorkspaceMember[];
  /** Pagination metadata */
  meta: Omit<MemberListResponse, 'items'> | null;
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Whether a fetch is in progress */
  isFetching: boolean;
  /** Error if any occurred */
  error: Error | null;
  /** Refetch the members */
  refetch: () => Promise<void>;
}

/**
 * Hook to list all members in the current workspace.
 *
 * @example
 * ```tsx
 * const { members, isLoading, error } = useTeamMembers();
 *
 * if (isLoading) return <Spinner />;
 * if (error) return <Error message={error.message} />;
 *
 * return (
 *   <ul>
 *     {members.map(member => (
 *       <li key={member.user_id}>{member.user_display_name}</li>
 *     ))}
 *   </ul>
 * );
 * ```
 */
export function useTeamMembers(options: UseTeamMembersOptions = {}): UseTeamMembersReturn {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;
  const { enabled = true, staleTime = 30 * 1000 } = options;

  const query = useQuery<MemberListResponse, Error>({
    queryKey: teamQueryKeys.members(workspaceId || ''),
    queryFn: async () => {
      if (!workspaceId) throw new Error('Workspace ID is required');
      return teamService.listMembers(workspaceId);
    },
    enabled: !!workspaceId && enabled,
    staleTime,
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    members: query.data?.items ?? [],
    meta: query.data ? { total: query.data.total, page: query.data.page, per_page: query.data.per_page, total_pages: query.data.total_pages } : null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook to remove a member from the workspace.
 *
 * @example
 * ```tsx
 * const { removeMember, isRemoving } = useRemoveMember();
 *
 * const handleRemove = async (userId: string) => {
 *   try {
 *     await removeMember(userId);
 *     console.log('Member removed successfully');
 *   } catch (error) {
 *     console.error('Failed to remove member:', error);
 *   }
 * };
 * ```
 */
export function useRemoveMember() {
  const queryClient = useQueryClient();
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const workspaceId = workspace?.workspace_id;

  const mutation = useMutation<MessageResponse, Error, string>({
    mutationFn: async (userId: string) => {
      if (!workspaceId) throw new Error('Workspace ID is required');
      return teamService.removeMember(workspaceId, userId);
    },
    onSuccess: () => {
      // Invalidate members cache
      queryClient.invalidateQueries({ queryKey: teamQueryKeys.members(workspaceId || '') });

      addToast({
        variant: 'success',
        title: 'Member Removed',
        message: 'The team member has been removed from this workspace.',
        duration: 5000,
      });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to Remove Member',
        message: error.message || 'An error occurred while removing the member.',
        duration: 5000,
      });
    },
  });

  return {
    removeMember: mutation.mutateAsync,
    isRemoving: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

/**
 * Hook to update a member's roles.
 *
 * @example
 * ```tsx
 * const { updateRoles, isUpdating } = useUpdateMemberRoles();
 *
 * const handleRoleChange = async (userId: string, roleIds: string[]) => {
 *   try {
 *     await updateRoles({ userId, roleIds });
 *   } catch (error) {
 *     console.error('Failed to update roles:', error);
 *   }
 * };
 * ```
 */
export function useUpdateMemberRoles() {
  const queryClient = useQueryClient();
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const workspaceId = workspace?.workspace_id;

  const mutation = useMutation<
    WorkspaceMember,
    Error,
    { userId: string; roleIds: string[] }
  >({
    mutationFn: async ({ userId, roleIds }) => {
      if (!workspaceId) throw new Error('Workspace ID is required');
      return teamService.updateMemberRoles(workspaceId, userId, roleIds);
    },
    onSuccess: () => {
      // Invalidate members cache
      queryClient.invalidateQueries({ queryKey: teamQueryKeys.members(workspaceId || '') });
      // Also invalidate permissions since roles changed
      queryClient.invalidateQueries({ queryKey: ['permissions', 'effective', workspaceId] });

      addToast({
        variant: 'success',
        title: 'Role Updated',
        message: 'The member\'s role has been updated successfully.',
        duration: 5000,
      });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to Update Role',
        message: error.message || 'An error occurred while updating the role.',
        duration: 5000,
      });
    },
  });

  return {
    updateRoles: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// =============================================================================
// Invitation Hooks
// =============================================================================

export interface UseInvitationsOptions {
  /** Filter by invitation status */
  status?: InvitationStatus;
  /** Whether the hook is enabled */
  enabled?: boolean;
  /** Stale time in milliseconds (default: 30 seconds) */
  staleTime?: number;
}

export interface UseInvitationsReturn {
  /** Array of invitations */
  invitations: WorkspaceInvitation[];
  /** Pending invitations count */
  pendingCount: number;
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Whether a fetch is in progress */
  isFetching: boolean;
  /** Error if any occurred */
  error: Error | null;
  /** Refetch the invitations */
  refetch: () => Promise<void>;
}

/**
 * Hook to list invitations for the current workspace.
 *
 * @example
 * ```tsx
 * const { invitations, pendingCount, isLoading } = useInvitations({ status: 'pending' });
 *
 * return (
 *   <div>
 *     <h2>Pending Invitations ({pendingCount})</h2>
 *     {invitations.map(invite => (
 *       <InvitationCard key={invite.invitation_id} invitation={invite} />
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useInvitations(options: UseInvitationsOptions = {}): UseInvitationsReturn {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;
  const { status, enabled = true, staleTime = 30 * 1000 } = options;

  const query = useQuery<WorkspaceInvitation[], Error>({
    queryKey: teamQueryKeys.invitations(workspaceId || '', status),
    queryFn: async () => {
      if (!workspaceId) throw new Error('Workspace ID is required');
      return teamService.listInvitations(workspaceId, status);
    },
    enabled: !!workspaceId && enabled,
    staleTime,
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  const invitations = query.data ?? [];
  const pendingCount = invitations.filter((inv) => inv.status === 'pending').length;

  return {
    invitations,
    pendingCount,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook to send an invitation to join the workspace.
 *
 * @example
 * ```tsx
 * const { inviteMember, isInviting } = useInviteMember();
 *
 * const handleInvite = async (email: string, roleIds: string[]) => {
 *   try {
 *     await inviteMember({ email, role_ids: roleIds });
 *   } catch (error) {
 *     console.error('Failed to send invitation:', error);
 *   }
 * };
 * ```
 */
export function useInviteMember() {
  const queryClient = useQueryClient();
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const workspaceId = workspace?.workspace_id;

  const mutation = useMutation<WorkspaceInvitation, Error, InviteMemberRequest>({
    mutationFn: async (data) => {
      if (!workspaceId) throw new Error('Workspace ID is required');
      return teamService.inviteMember(workspaceId, data);
    },
    onSuccess: (invitation) => {
      // Invalidate invitations cache
      queryClient.invalidateQueries({ queryKey: teamQueryKeys.invitations(workspaceId || '') });

      addToast({
        variant: 'success',
        title: 'Invitation Sent',
        message: `An invitation has been sent to ${invitation.email}.`,
        duration: 5000,
      });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to Send Invitation',
        message: error.message || 'An error occurred while sending the invitation.',
        duration: 5000,
      });
    },
  });

  return {
    inviteMember: mutation.mutateAsync,
    isInviting: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

/**
 * Hook to revoke a pending invitation.
 *
 * @example
 * ```tsx
 * const { revokeInvitation, isRevoking } = useRevokeInvitation();
 *
 * const handleRevoke = async (invitationId: string) => {
 *   await revokeInvitation(invitationId);
 * };
 * ```
 */
export function useRevokeInvitation() {
  const queryClient = useQueryClient();
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const workspaceId = workspace?.workspace_id;

  const mutation = useMutation<MessageResponse, Error, string>({
    mutationFn: async (invitationId: string) => {
      if (!workspaceId) throw new Error('Workspace ID is required');
      return teamService.revokeInvitation(workspaceId, invitationId);
    },
    onSuccess: () => {
      // Invalidate invitations cache
      queryClient.invalidateQueries({ queryKey: teamQueryKeys.invitations(workspaceId || '') });

      addToast({
        variant: 'success',
        title: 'Invitation Revoked',
        message: 'The invitation has been revoked.',
        duration: 5000,
      });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to Revoke Invitation',
        message: error.message || 'An error occurred while revoking the invitation.',
        duration: 5000,
      });
    },
  });

  return {
    revokeInvitation: mutation.mutateAsync,
    isRevoking: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

/**
 * Hook to resend an invitation email.
 *
 * @example
 * ```tsx
 * const { resendInvitation, isResending } = useResendInvitation();
 *
 * const handleResend = async (invitationId: string) => {
 *   await resendInvitation(invitationId);
 * };
 * ```
 */
export function useResendInvitation() {
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const workspaceId = workspace?.workspace_id;

  const mutation = useMutation<MessageResponse, Error, string>({
    mutationFn: async (invitationId: string) => {
      if (!workspaceId) throw new Error('Workspace ID is required');
      return teamService.resendInvitation(workspaceId, invitationId);
    },
    onSuccess: () => {
      addToast({
        variant: 'success',
        title: 'Invitation Resent',
        message: 'The invitation email has been sent again.',
        duration: 5000,
      });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to Resend Invitation',
        message: error.message || 'An error occurred while resending the invitation.',
        duration: 5000,
      });
    },
  });

  return {
    resendInvitation: mutation.mutateAsync,
    isResending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// =============================================================================
// Public Invitation Hooks (No Auth Required)
// =============================================================================

export interface UseInvitationPreviewOptions {
  /** The invitation token from the URL */
  token?: string;
  /** Whether the hook is enabled */
  enabled?: boolean;
}

export interface UseInvitationPreviewReturn {
  /** The invitation preview data */
  invitation: InvitationPreview | null;
  /** Whether loading is in progress */
  isLoading: boolean;
  /** Error if any occurred */
  error: Error | null;
  /** Whether the invitation is expired */
  isExpired: boolean;
  /** Whether the invitation is valid (not expired and no error) */
  isValid: boolean;
  /** Refetch the invitation */
  refetch: () => Promise<void>;
}

/**
 * Hook to get invitation preview by token (public endpoint).
 * Used on the invitation acceptance page before user signs in.
 *
 * @example
 * ```tsx
 * const { invitation, isLoading, isExpired } = useInvitationPreview({ token });
 *
 * if (isLoading) return <Spinner />;
 * if (isExpired) return <ExpiredMessage />;
 *
 * return (
 *   <div>
 *     <p>You've been invited to join {invitation?.workspace_name}</p>
 *   </div>
 * );
 * ```
 */
export function useInvitationPreview(options: UseInvitationPreviewOptions = {}): UseInvitationPreviewReturn {
  const { token, enabled = true } = options;

  const query = useQuery<InvitationPreview, Error>({
    queryKey: teamQueryKeys.invitationPreview(token || ''),
    queryFn: async () => {
      if (!token) throw new Error('Invitation token is required');
      return teamService.getInvitationPreview(token);
    },
    enabled: !!token && enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes - invitations don't change often
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1, // Only retry once for invitation lookups
  });

  const invitation = query.data ?? null;
  const isExpired = invitation?.is_expired ?? false;
  const isValid = !!invitation && !isExpired && !query.error;

  return {
    invitation,
    isLoading: query.isLoading,
    error: query.error,
    isExpired,
    isValid,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook to accept an invitation.
 * Call this after the user has signed up or logged in.
 *
 * @example
 * ```tsx
 * const { acceptInvitation, isAccepting } = useAcceptInvitation();
 *
 * const handleAccept = async (token: string) => {
 *   try {
 *     const result = await acceptInvitation(token);
 *     // Redirect to workspace
 *     navigate(`/workspace/${result.workspace_slug}`);
 *   } catch (error) {
 *     console.error('Failed to accept invitation:', error);
 *   }
 * };
 * ```
 */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const mutation = useMutation<AcceptInvitationResponse, Error, string>({
    mutationFn: async (token: string) => {
      return teamService.acceptInvitation(token);
    },
    onSuccess: (data) => {
      // Invalidate all team queries since we've joined a new workspace
      queryClient.invalidateQueries({ queryKey: teamQueryKeys.all });

      addToast({
        variant: 'success',
        title: 'Welcome to the Team!',
        message: `You've successfully joined ${data.workspace_name}.`,
        duration: 5000,
      });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to Accept Invitation',
        message: error.message || 'An error occurred while accepting the invitation.',
        duration: 5000,
      });
    },
  });

  return {
    acceptInvitation: mutation.mutateAsync,
    isAccepting: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// =============================================================================
// Role Hooks
// =============================================================================

export interface UseRolesOptions {
  /** Whether the hook is enabled */
  enabled?: boolean;
  /** Stale time in milliseconds (default: 60 seconds) */
  staleTime?: number;
}

export interface UseRolesReturn {
  /** Array of roles */
  roles: Role[];
  /** System roles (cannot be edited/deleted) */
  systemRoles: Role[];
  /** Custom roles */
  customRoles: Role[];
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Whether a fetch is in progress */
  isFetching: boolean;
  /** Error if any occurred */
  error: Error | null;
  /** Refetch the roles */
  refetch: () => Promise<void>;
}

/**
 * Hook to list all roles in the current workspace.
 *
 * @example
 * ```tsx
 * const { roles, systemRoles, customRoles, isLoading } = useRoles();
 *
 * return (
 *   <RoleSelector
 *     roles={roles}
 *     systemRoles={systemRoles}
 *     customRoles={customRoles}
 *   />
 * );
 * ```
 */
export function useRoles(options: UseRolesOptions = {}): UseRolesReturn {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;
  const { enabled = true, staleTime = 60 * 1000 } = options;

  const query = useQuery<Role[], Error>({
    queryKey: teamQueryKeys.roles(workspaceId || ''),
    queryFn: async () => {
      if (!workspaceId) throw new Error('Workspace ID is required');
      return teamService.listRoles(workspaceId);
    },
    enabled: !!workspaceId && enabled,
    staleTime,
    gcTime: 10 * 60 * 1000, // 10 minutes - roles don't change often
  });

  const roles = query.data ?? [];
  const systemRoles = roles.filter((role) => role.is_system);
  const customRoles = roles.filter((role) => !role.is_system);

  return {
    roles,
    systemRoles,
    customRoles,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/**
 * Hook to create a custom role.
 *
 * @example
 * ```tsx
 * const { createRole, isCreating } = useCreateRole();
 *
 * const handleCreate = async () => {
 *   await createRole({
 *     name: 'Project Manager',
 *     permissions: ['gallery:read', 'gallery:write', 'client:read'],
 *   });
 * };
 * ```
 */
export function useCreateRole() {
  const queryClient = useQueryClient();
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const workspaceId = workspace?.workspace_id;

  const mutation = useMutation<Role, Error, CreateRoleRequest>({
    mutationFn: async (data) => {
      if (!workspaceId) throw new Error('Workspace ID is required');
      return teamService.createRole(workspaceId, data);
    },
    onSuccess: (role) => {
      // Invalidate roles cache
      queryClient.invalidateQueries({ queryKey: teamQueryKeys.roles(workspaceId || '') });

      addToast({
        variant: 'success',
        title: 'Role Created',
        message: `The role "${role.name}" has been created.`,
        duration: 5000,
      });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to Create Role',
        message: error.message || 'An error occurred while creating the role.',
        duration: 5000,
      });
    },
  });

  return {
    createRole: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

/**
 * Hook to update a custom role.
 *
 * @example
 * ```tsx
 * const { updateRole, isUpdating } = useUpdateRole();
 *
 * const handleUpdate = async (roleId: string) => {
 *   await updateRole({
 *     roleId,
 *     data: { name: 'Senior Editor', permissions: [...] },
 *   });
 * };
 * ```
 */
export function useUpdateRole() {
  const queryClient = useQueryClient();
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const workspaceId = workspace?.workspace_id;

  const mutation = useMutation<
    Role,
    Error,
    { roleId: string; data: UpdateRoleRequest }
  >({
    mutationFn: async ({ roleId, data }) => {
      if (!workspaceId) throw new Error('Workspace ID is required');
      return teamService.updateRole(workspaceId, roleId, data);
    },
    onSuccess: (role) => {
      // Invalidate roles and members cache (permissions may have changed)
      queryClient.invalidateQueries({ queryKey: teamQueryKeys.roles(workspaceId || '') });
      queryClient.invalidateQueries({ queryKey: teamQueryKeys.members(workspaceId || '') });
      queryClient.invalidateQueries({ queryKey: ['permissions', 'effective', workspaceId] });

      addToast({
        variant: 'success',
        title: 'Role Updated',
        message: `The role "${role.name}" has been updated.`,
        duration: 5000,
      });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to Update Role',
        message: error.message || 'An error occurred while updating the role.',
        duration: 5000,
      });
    },
  });

  return {
    updateRole: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

/**
 * Hook to delete a custom role.
 *
 * @example
 * ```tsx
 * const { deleteRole, isDeleting } = useDeleteRole();
 *
 * const handleDelete = async (roleId: string) => {
 *   await deleteRole(roleId);
 * };
 * ```
 */
export function useDeleteRole() {
  const queryClient = useQueryClient();
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const workspaceId = workspace?.workspace_id;

  const mutation = useMutation<MessageResponse, Error, string>({
    mutationFn: async (roleId: string) => {
      if (!workspaceId) throw new Error('Workspace ID is required');
      return teamService.deleteRole(workspaceId, roleId);
    },
    onSuccess: () => {
      // Invalidate roles cache
      queryClient.invalidateQueries({ queryKey: teamQueryKeys.roles(workspaceId || '') });

      addToast({
        variant: 'success',
        title: 'Role Deleted',
        message: 'The role has been deleted.',
        duration: 5000,
      });
    },
    onError: (error) => {
      addToast({
        variant: 'error',
        title: 'Failed to Delete Role',
        message: error.message || 'An error occurred while deleting the role.',
        duration: 5000,
      });
    },
  });

  return {
    deleteRole: mutation.mutateAsync,
    isDeleting: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// =============================================================================
// Combined Team Hook
// =============================================================================

export interface UseTeamOptions {
  /** Whether to fetch members */
  includeMembers?: boolean;
  /** Whether to fetch invitations */
  includeInvitations?: boolean;
  /** Whether to fetch roles */
  includeRoles?: boolean;
  /** Whether the hook is enabled */
  enabled?: boolean;
}

export interface UseTeamReturn {
  // Data
  members: WorkspaceMember[];
  invitations: WorkspaceInvitation[];
  pendingInvitations: WorkspaceInvitation[];
  roles: Role[];

  // Loading states
  isLoading: boolean;
  isMembersLoading: boolean;
  isInvitationsLoading: boolean;
  isRolesLoading: boolean;

  // Errors
  error: Error | null;

  // Refetch functions
  refetchMembers: () => Promise<void>;
  refetchInvitations: () => Promise<void>;
  refetchRoles: () => Promise<void>;
  refetchAll: () => Promise<void>;
}

/**
 * Combined hook for team management.
 * Provides access to members, invitations, and roles in one hook.
 *
 * @example
 * ```tsx
 * const {
 *   members,
 *   pendingInvitations,
 *   roles,
 *   isLoading,
 * } = useTeam();
 *
 * if (isLoading) return <Spinner />;
 *
 * return (
 *   <TeamPage
 *     members={members}
 *     invitations={pendingInvitations}
 *     roles={roles}
 *   />
 * );
 * ```
 */
export function useTeam(options: UseTeamOptions = {}): UseTeamReturn {
  const {
    includeMembers = true,
    includeInvitations = true,
    includeRoles = true,
    enabled = true,
  } = options;

  const membersResult = useTeamMembers({ enabled: enabled && includeMembers });
  const invitationsResult = useInvitations({ enabled: enabled && includeInvitations });
  const rolesResult = useRoles({ enabled: enabled && includeRoles });

  const isLoading =
    (includeMembers && membersResult.isLoading) ||
    (includeInvitations && invitationsResult.isLoading) ||
    (includeRoles && rolesResult.isLoading);

  const error = membersResult.error || invitationsResult.error || rolesResult.error;

  const pendingInvitations = invitationsResult.invitations.filter(
    (inv) => inv.status === 'pending'
  );

  const refetchAll = async () => {
    await Promise.all([
      includeMembers ? membersResult.refetch() : Promise.resolve(),
      includeInvitations ? invitationsResult.refetch() : Promise.resolve(),
      includeRoles ? rolesResult.refetch() : Promise.resolve(),
    ]);
  };

  return {
    // Data
    members: membersResult.members,
    invitations: invitationsResult.invitations,
    pendingInvitations,
    roles: rolesResult.roles,

    // Loading states
    isLoading,
    isMembersLoading: membersResult.isLoading,
    isInvitationsLoading: invitationsResult.isLoading,
    isRolesLoading: rolesResult.isLoading,

    // Errors
    error,

    // Refetch functions
    refetchMembers: membersResult.refetch,
    refetchInvitations: invitationsResult.refetch,
    refetchRoles: rolesResult.refetch,
    refetchAll,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Invalidate all team-related caches for a workspace.
 * Useful after major team changes.
 *
 * @example
 * ```tsx
 * const queryClient = useQueryClient();
 * invalidateTeamCache(queryClient, workspaceId);
 * ```
 */
export function invalidateTeamCache(
  queryClient: ReturnType<typeof useQueryClient>,
  workspaceId: string
) {
  queryClient.invalidateQueries({ queryKey: teamQueryKeys.members(workspaceId) });
  queryClient.invalidateQueries({ queryKey: teamQueryKeys.invitations(workspaceId) });
  queryClient.invalidateQueries({ queryKey: teamQueryKeys.roles(workspaceId) });
}

/**
 * Clear all team caches across all workspaces.
 * Useful during logout or workspace switch.
 *
 * @example
 * ```tsx
 * const queryClient = useQueryClient();
 * clearAllTeamCaches(queryClient);
 * ```
 */
export function clearAllTeamCaches(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: teamQueryKeys.all });
}

// =============================================================================
// Re-export Types from Service
// =============================================================================

export type {
  WorkspaceMember,
  MemberListResponse,
  WorkspaceInvitation,
  InvitationPreview,
  Role,
  InviteMemberRequest,
  CreateRoleRequest,
  UpdateRoleRequest,
  AcceptInvitationResponse,
  MessageResponse,
  InvitationStatus,
  MemberStatus,
} from '@/services/teamService';

// Re-export utility functions from service
export { isInvitationExpired, isSystemRole, formatPermissions, SYSTEM_ROLES } from '@/services/teamService';
