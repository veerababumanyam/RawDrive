/**
 * TeamPage Component
 *
 * Main team management page for workspace administrators.
 * Displays team members and pending invitations, with actions for:
 * - Viewing all workspace members
 * - Inviting new team members
 * - Changing member roles
 * - Removing members
 * - Managing pending invitations (revoke, resend)
 *
 * Integrates with the team hooks and components for comprehensive team management.
 *
 * @module TeamPage
 */

import React, { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  UserPlus,
  Mail,
  Search,
  Loader2,
  AlertCircle,
  RefreshCw,
  Filter,
  ChevronDown,
} from 'lucide-react';
import { staggerContainer, staggerItem } from '../../components/landing/animations/presets';
import { useAuth } from '../../contexts/AuthContext';
import { AppButton } from '../../components/ui/AppButton';
import { AppBadge } from '../../components/ui/AppBadge';
import { useHasPermissions } from '../../hooks/usePermissions';
import {
  useTeam,
  useRevokeInvitation,
  useResendInvitation,
  type WorkspaceMember,
  type WorkspaceInvitation,
  type Role,
} from '../../hooks/useTeam';
import {
  TeamMemberCard,
  TeamMemberCardSkeleton,
} from '../../components/features/team/TeamMemberCard';
import {
  InvitationCard,
  InvitationCardSkeleton,
  InvitationEmptyState,
} from '../../components/features/team/InvitationCard';
import { InviteMemberDialog } from '../../components/features/team/InviteMemberDialog';
import { ChangeRoleDialog } from '../../components/features/team/ChangeRoleDialog';
import { RemoveMemberDialog } from '../../components/features/team/RemoveMemberDialog';

// =============================================================================
// Types
// =============================================================================

type ViewFilter = 'all' | 'members' | 'invitations';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create role name lookup map from roles array
 */
function createRoleNameMap(roles: Role[]): Record<string, string> {
  return roles.reduce((acc, role) => {
    acc[role.role_id] = role.name;
    return acc;
  }, {} as Record<string, string>);
}

// =============================================================================
// Component
// =============================================================================

/**
 * TeamPage is the main team management page.
 *
 * @example
 * ```tsx
 * // In routes configuration:
 * <Route path="/workspace/team" element={<TeamPage />} />
 * ```
 */
const TeamPage: React.FC = () => {
  const { user } = useAuth();

  // Permission checks
  const permissions = useHasPermissions([
    'members:read',
    'members:write',
    'members:invite',
    'roles:read',
    'roles:write',
  ]);

  // Team data hooks
  const {
    members,
    pendingInvitations,
    roles,
    isLoading,
    isMembersLoading,
    isInvitationsLoading,
    error,
    refetchMembers,
    refetchInvitations,
    refetchAll,
  } = useTeam();

  // Invitation action hooks
  const { revokeInvitation, isRevoking } = useRevokeInvitation();
  const { resendInvitation, isResending } = useResendInvitation();

  // Local state
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dialog state
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isChangeRoleDialogOpen, setIsChangeRoleDialogOpen] = useState(false);
  const [isRemoveMemberDialogOpen, setIsRemoveMemberDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null);

  // Action state for invitations
  const [processingInvitationId, setProcessingInvitationId] = useState<string | null>(null);

  // Create role name map for display
  const roleNameMap = useMemo(() => createRoleNameMap(roles), [roles]);

  // Filter members by search query
  // Use optional chaining to handle undefined/null values safely
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;

    const query = searchQuery.toLowerCase();
    return members.filter(
      (member) =>
        member.user_display_name?.toLowerCase().includes(query) ||
        member.user_email?.toLowerCase().includes(query)
    );
  }, [members, searchQuery]);

  // Filter invitations by search query
  // Use optional chaining to handle undefined/null values safely
  const filteredInvitations = useMemo(() => {
    if (!searchQuery.trim()) return pendingInvitations;

    const query = searchQuery.toLowerCase();
    return pendingInvitations.filter((invitation) =>
      invitation.email?.toLowerCase().includes(query)
    );
  }, [pendingInvitations, searchQuery]);

  // Stats for display
  const stats = useMemo(
    () => ({
      totalMembers: members.length,
      activeMembers: members.filter((m) => m.status === 'active').length,
      pendingInvitations: pendingInvitations.length,
    }),
    [members, pendingInvitations]
  );

  // Check if current user is a member (for "You" badge)
  const isCurrentUser = useCallback(
    (member: WorkspaceMember) => member.user_id === user?.id,
    [user?.id]
  );

  // ==========================================================================
  // Handlers
  // ==========================================================================

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchAll();
    setIsRefreshing(false);
  };

  const handleInviteClick = () => {
    setIsInviteDialogOpen(true);
  };

  const handleEditRole = (member: WorkspaceMember) => {
    setSelectedMember(member);
    setIsChangeRoleDialogOpen(true);
  };

  const handleRemoveMember = (member: WorkspaceMember) => {
    setSelectedMember(member);
    setIsRemoveMemberDialogOpen(true);
  };

  const handleRevokeInvitation = async (invitation: WorkspaceInvitation) => {
    setProcessingInvitationId(invitation.invitation_id);
    try {
      await revokeInvitation(invitation.invitation_id);
    } finally {
      setProcessingInvitationId(null);
    }
  };

  const handleResendInvitation = async (invitation: WorkspaceInvitation) => {
    setProcessingInvitationId(invitation.invitation_id);
    try {
      await resendInvitation(invitation.invitation_id);
    } finally {
      setProcessingInvitationId(null);
    }
  };

  const handleInviteSuccess = () => {
    refetchInvitations();
  };

  const handleRoleChangeSuccess = () => {
    refetchMembers();
    setSelectedMember(null);
  };

  const handleRemoveSuccess = () => {
    refetchMembers();
    setSelectedMember(null);
  };

  // ==========================================================================
  // Render Helpers
  // ==========================================================================

  const renderMembersSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <TeamMemberCardSkeleton key={i} />
      ))}
    </div>
  );

  const renderInvitationsSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <InvitationCardSkeleton key={i} />
      ))}
    </div>
  );

  const renderEmptyState = () => (
    <div className="card-glass rounded-2xl p-12 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
        <Users size={32} className="text-primary" />
      </div>
      <h3 className="text-xl font-semibold text-text-primary mb-2">
        {searchQuery ? 'No results found' : 'No team members yet'}
      </h3>
      <p className="text-text-secondary mb-6 max-w-md mx-auto">
        {searchQuery
          ? 'Try adjusting your search to find what you\'re looking for.'
          : 'Start building your team by inviting your first member.'}
      </p>
      {!searchQuery && permissions['members:invite'] && (
        <AppButton
          onClick={handleInviteClick}
          variant="primary"
          leftIcon={<UserPlus size={20} />}
          shine
          className="px-8"
        >
          Invite Team Member
        </AppButton>
      )}
    </div>
  );

  // ==========================================================================
  // Main Render
  // ==========================================================================

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-6"
    >
      {/* Page Header */}
      <motion.div
        variants={staggerItem}
        className="card-glass rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-gradient">Team</h1>
          <p className="text-text-secondary mt-1">
            {isLoading ? (
              'Loading team...'
            ) : error ? (
              'Error loading team'
            ) : (
              <span className="flex items-center gap-3">
                <span>
                  <strong className="text-text-primary">{stats.activeMembers}</strong>{' '}
                  {stats.activeMembers === 1 ? 'member' : 'members'}
                </span>
                {stats.pendingInvitations > 0 && (
                  <>
                    <span className="text-border">•</span>
                    <span className="flex items-center gap-1.5 text-warning-600 dark:text-warning-400">
                      <Mail size={14} />
                      <strong>{stats.pendingInvitations}</strong> pending{' '}
                      {stats.pendingInvitations === 1 ? 'invitation' : 'invitations'}
                    </span>
                  </>
                )}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AppButton
            onClick={handleRefresh}
            variant="outline"
            size="icon"
            disabled={isRefreshing}
            title="Refresh"
          >
            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
          </AppButton>
          {permissions['members:invite'] && (
            <AppButton
              onClick={handleInviteClick}
              variant="primary"
              leftIcon={<UserPlus size={20} />}
              shine
              className="hover:-translate-y-0.5 active:scale-95 transition-all px-6 py-2.5 rounded-xl shadow-lg shadow-primary/20"
            >
              Invite Member
            </AppButton>
          )}
        </div>
      </motion.div>

      {/* Search and Filters */}
      <motion.div
        variants={staggerItem}
        className="card-glass rounded-2xl p-4 flex flex-col sm:flex-row gap-4"
      >
        {/* Search */}
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search members or invitations..."
            className="
              w-full pl-10 pr-4 py-2.5
              glass-light border border-white/20 dark:border-white/10
              rounded-xl text-text-primary placeholder:text-text-tertiary
              focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50
              hover:border-white/30 dark:hover:border-white/20
              transition-all duration-200
              min-h-[44px]
            "
          />
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2">
          {/* View Filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="
                flex items-center gap-2
                px-4 py-2.5
                glass-light border border-white/20 dark:border-white/10
                rounded-xl text-text-secondary hover:text-text-primary hover:border-white/30
                hover:shadow-md
                transition-all duration-200
                min-h-[44px]
              "
            >
              <Filter size={18} />
              <span className="hidden sm:inline">
                {viewFilter === 'all'
                  ? 'All'
                  : viewFilter === 'members'
                    ? 'Members'
                    : 'Invitations'}
              </span>
              <ChevronDown size={16} className="text-text-tertiary" />
            </button>
            {showFilters && (
              <div className="absolute top-full mt-2 right-0 w-48 card-glass rounded-xl shadow-xl z-10 overflow-hidden">
                <div className="p-2">
                  <p className="px-3 py-2 text-xs font-semibold text-text-tertiary uppercase">
                    View
                  </p>
                  {(['all', 'members', 'invitations'] as ViewFilter[]).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => {
                        setViewFilter(filter);
                        setShowFilters(false);
                      }}
                      className={`
                        w-full flex items-center justify-between
                        px-3 py-2 rounded-lg text-sm transition-all duration-200
                        ${viewFilter === filter ? 'bg-gradient-to-r from-primary/10 to-accent/10 text-primary dark:text-primary-300' : 'hover:bg-surface-hover/50 text-text-secondary'}
                      `}
                    >
                      <div className="flex items-center gap-2">
                        {filter === 'all' && <Users size={16} />}
                        {filter === 'members' && <Users size={16} />}
                        {filter === 'invitations' && <Mail size={16} />}
                        {filter.charAt(0).toUpperCase() + filter.slice(1)}
                      </div>
                      {viewFilter === filter && (
                        <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-primary to-accent" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Error State */}
      {error && (
        <motion.div
          variants={staggerItem}
          className="card-glass rounded-2xl p-6 flex items-center gap-4 border border-error-200 dark:border-error-800"
        >
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-error-100 dark:bg-error-900/30 flex items-center justify-center">
            <AlertCircle size={20} className="text-error-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-text-primary">Error loading team</h3>
            <p className="text-sm text-text-secondary">{error.message}</p>
          </div>
          <AppButton onClick={handleRefresh} variant="outline" size="sm">
            Try Again
          </AppButton>
        </motion.div>
      )}

      {/* Loading State */}
      {isLoading && !error && (
        <motion.div variants={staggerItem} className="flex items-center justify-center py-16">
          <Loader2 size={32} className="text-primary animate-spin" />
        </motion.div>
      )}

      {/* Content */}
      {!isLoading && !error && (
        <>
          {/* Team Members Section */}
          {(viewFilter === 'all' || viewFilter === 'members') && (
            <motion.div variants={staggerItem} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                  <Users size={20} className="text-primary" />
                  Team Members
                  <AppBadge variant="default" size="sm">
                    {filteredMembers.length}
                  </AppBadge>
                </h2>
              </div>

              {isMembersLoading ? (
                renderMembersSkeleton()
              ) : filteredMembers.length === 0 ? (
                renderEmptyState()
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredMembers.map((member) => (
                    <TeamMemberCard
                      key={member.membership_id}
                      member={member}
                      roleNames={roleNameMap}
                      canEditRole={permissions['members:write'] && !isCurrentUser(member)}
                      canRemove={permissions['members:write'] && !isCurrentUser(member)}
                      isCurrentUser={isCurrentUser(member)}
                      onEditRole={handleEditRole}
                      onRemove={handleRemoveMember}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Pending Invitations Section */}
          {(viewFilter === 'all' || viewFilter === 'invitations') && (
            <motion.div variants={staggerItem} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                  <Mail size={20} className="text-warning-500" />
                  Pending Invitations
                  {stats.pendingInvitations > 0 && (
                    <AppBadge variant="warning" size="sm">
                      {filteredInvitations.length}
                    </AppBadge>
                  )}
                </h2>
              </div>

              {isInvitationsLoading ? (
                renderInvitationsSkeleton()
              ) : filteredInvitations.length === 0 ? (
                <InvitationEmptyState
                  message={
                    searchQuery
                      ? 'No invitations match your search'
                      : 'No pending invitations'
                  }
                  actionLabel={permissions['members:invite'] ? 'Invite Member' : undefined}
                  onAction={permissions['members:invite'] ? handleInviteClick : undefined}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredInvitations.map((invitation) => (
                    <InvitationCard
                      key={invitation.invitation_id}
                      invitation={invitation}
                      roleNames={roleNameMap}
                      canResend={permissions['members:invite']}
                      canRevoke={permissions['members:write']}
                      onResend={handleResendInvitation}
                      onRevoke={handleRevokeInvitation}
                      isResending={
                        isResending && processingInvitationId === invitation.invitation_id
                      }
                      isRevoking={
                        isRevoking && processingInvitationId === invitation.invitation_id
                      }
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </>
      )}

      {/* Dialogs */}
      <InviteMemberDialog
        isOpen={isInviteDialogOpen}
        onClose={() => setIsInviteDialogOpen(false)}
        onSuccess={handleInviteSuccess}
      />

      <ChangeRoleDialog
        isOpen={isChangeRoleDialogOpen}
        onClose={() => {
          setIsChangeRoleDialogOpen(false);
          setSelectedMember(null);
        }}
        member={selectedMember}
        onSuccess={handleRoleChangeSuccess}
      />

      <RemoveMemberDialog
        isOpen={isRemoveMemberDialogOpen}
        onClose={() => {
          setIsRemoveMemberDialogOpen(false);
          setSelectedMember(null);
        }}
        member={selectedMember}
        onSuccess={handleRemoveSuccess}
      />
    </motion.div>
  );
};

export default TeamPage;
