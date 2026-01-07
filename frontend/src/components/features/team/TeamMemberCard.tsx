/**
 * TeamMemberCard Component
 *
 * Displays a workspace team member's information in a card format.
 * Shows avatar, name, email, role badges, status, and join date.
 * Supports actions for role editing and member removal (when permissions allow).
 *
 * @module TeamMemberCard
 */

import React, { useState, useMemo } from 'react';
import {
  Mail,
  Calendar,
  Shield,
  MoreVertical,
  Edit2,
  Trash2,
  Crown,
  UserCog,
  Eye,
  PenTool,
} from 'lucide-react';
import { AppCard, AppBadge, AppButton } from '@/components/ui';
import type { WorkspaceMember } from '@/services/teamService';

// =============================================================================
// Types
// =============================================================================

export interface TeamMemberCardProps {
  /** The member data to display */
  member: WorkspaceMember;
  /** Available roles in the workspace (for role name lookups) */
  roleNames?: Record<string, string>;
  /** Whether the current user can edit this member's role */
  canEditRole?: boolean;
  /** Whether the current user can remove this member */
  canRemove?: boolean;
  /** Whether this is the current user's own card */
  isCurrentUser?: boolean;
  /** Callback when edit role is clicked */
  onEditRole?: (member: WorkspaceMember) => void;
  /** Callback when remove is clicked */
  onRemove?: (member: WorkspaceMember) => void;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get initials from a display name
 */
function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Generate a consistent color based on a string (user_id or email)
 */
function getAvatarColor(identifier: string): string {
  const colors = [
    'bg-primary-500',
    'bg-accent-500',
    'bg-gold-500',
    'bg-success-500',
    'bg-info-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
  ];

  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Format a date string to a readable format
 */
function formatDate(dateString: string | null): string {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Get role icon based on role name
 */
function getRoleIcon(roleName: string): React.ReactNode {
  const normalizedRole = roleName.toLowerCase();
  if (normalizedRole === 'owner') {
    return <Crown size={12} className="text-gold-500" />;
  }
  if (normalizedRole === 'admin') {
    return <Shield size={12} className="text-primary-500" />;
  }
  if (normalizedRole === 'editor') {
    return <PenTool size={12} className="text-accent-500" />;
  }
  if (normalizedRole === 'viewer') {
    return <Eye size={12} className="text-text-tertiary" />;
  }
  return <UserCog size={12} className="text-text-secondary" />;
}

/**
 * Get badge variant based on role name
 */
function getRoleBadgeVariant(
  roleName: string
): 'gold' | 'primary' | 'accent' | 'default' {
  const normalizedRole = roleName.toLowerCase();
  if (normalizedRole === 'owner') return 'gold';
  if (normalizedRole === 'admin') return 'primary';
  if (normalizedRole === 'editor') return 'accent';
  return 'default';
}

// =============================================================================
// Component
// =============================================================================

/**
 * TeamMemberCard displays a workspace member's information with actions.
 *
 * @example
 * ```tsx
 * <TeamMemberCard
 *   member={member}
 *   roleNames={{ 'role-123': 'Admin', 'role-456': 'Editor' }}
 *   canEditRole={hasPermission('member:write')}
 *   canRemove={hasPermission('member:write')}
 *   onEditRole={handleEditRole}
 *   onRemove={handleRemove}
 * />
 * ```
 */
export const TeamMemberCard: React.FC<TeamMemberCardProps> = ({
  member,
  roleNames = {},
  canEditRole = false,
  canRemove = false,
  isCurrentUser = false,
  onEditRole,
  onRemove,
  className = '',
}) => {
  const [showMenu, setShowMenu] = useState(false);

  // Get display role names from role IDs
  const displayRoles = useMemo(() => {
    return member.roles.map((roleId) => {
      // Check if roleId is already a name (for backwards compatibility)
      if (roleNames[roleId]) {
        return roleNames[roleId];
      }
      // If it looks like a UUID, show "Custom Role" as fallback
      if (roleId.includes('-') && roleId.length > 20) {
        return 'Custom Role';
      }
      // Otherwise use the roleId as the name (might already be a name)
      return roleId;
    });
  }, [member.roles, roleNames]);

  // Get primary role (first role, usually the most significant)
  const primaryRole = displayRoles[0] || 'No Role';
  const hasMultipleRoles = displayRoles.length > 1;

  // Avatar color based on user ID for consistency
  const avatarColor = getAvatarColor(member.user_id);

  // Status styling
  const isActive = member.status === 'active';
  const isPending = member.status === 'pending';
  const isSuspended = member.status === 'suspended';

  const handleEditRole = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onEditRole?.(member);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onRemove?.(member);
  };

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  // Close menu when clicking outside
  React.useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = () => setShowMenu(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showMenu]);

  const showActions = (canEditRole || canRemove) && !isCurrentUser;

  return (
    <AppCard
      variant="outlined"
      radius="lg"
      className={`group relative transition-all duration-200 hover:border-border-hover ${className}`}
    >
      <div className="p-4">
        {/* Header: Avatar, Name, Status, Actions */}
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className={`
              relative flex-shrink-0
              w-12 h-12 rounded-full
              ${avatarColor}
              flex items-center justify-center
              text-white font-semibold text-lg
              ring-2 ring-white dark:ring-surface
              shadow-sm
            `}
          >
            {getInitials(member.user_display_name)}
            {/* Status indicator dot */}
            <span
              className={`
                absolute -bottom-0.5 -right-0.5
                w-3.5 h-3.5 rounded-full
                border-2 border-white dark:border-surface
                ${isActive ? 'bg-success-500' : ''}
                ${isPending ? 'bg-warning-500' : ''}
                ${isSuspended ? 'bg-error-500' : ''}
                ${!isActive && !isPending && !isSuspended ? 'bg-neutral-400' : ''}
              `}
              title={member.status}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Name and current user badge */}
            <div className="flex items-center gap-2">
              <h3
                className="font-medium text-text-primary truncate"
                title={member.user_display_name}
              >
                {member.user_display_name}
              </h3>
              {isCurrentUser && (
                <AppBadge variant="primary" size="sm">
                  You
                </AppBadge>
              )}
            </div>

            {/* Email */}
            <p
              className="text-sm text-text-secondary truncate mt-0.5 flex items-center gap-1"
              title={member.user_email}
            >
              <Mail size={12} className="flex-shrink-0" />
              {member.user_email}
            </p>

            {/* Role badges */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <AppBadge
                variant={getRoleBadgeVariant(primaryRole)}
                size="sm"
                icon={getRoleIcon(primaryRole)}
              >
                {primaryRole}
              </AppBadge>
              {hasMultipleRoles && (
                <AppBadge
                  variant="outline"
                  size="sm"
                  title={displayRoles.slice(1).join(', ')}
                >
                  +{displayRoles.length - 1} more
                </AppBadge>
              )}
            </div>
          </div>

          {/* Actions Menu */}
          {showActions && (
            <div className="relative flex-shrink-0">
              <AppButton
                variant="ghost"
                size="icon"
                onClick={handleMenuToggle}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Member actions"
                aria-expanded={showMenu}
                aria-haspopup="true"
              >
                <MoreVertical size={18} />
              </AppButton>

              {/* Dropdown Menu */}
              {showMenu && (
                <div
                  className={`
                    absolute right-0 top-full mt-1 z-50
                    min-w-[160px] py-1
                    bg-surface border border-border rounded-lg shadow-lg
                    animate-in fade-in-0 zoom-in-95
                  `}
                  role="menu"
                >
                  {canEditRole && (
                    <button
                      onClick={handleEditRole}
                      className={`
                        w-full px-3 py-2 text-left text-sm
                        flex items-center gap-2
                        text-text-primary hover:bg-surface-hover
                        transition-colors duration-150
                      `}
                      role="menuitem"
                    >
                      <Edit2 size={14} />
                      Change Role
                    </button>
                  )}
                  {canRemove && (
                    <button
                      onClick={handleRemove}
                      className={`
                        w-full px-3 py-2 text-left text-sm
                        flex items-center gap-2
                        text-error-500 hover:bg-error-50 dark:hover:bg-error-900/20
                        transition-colors duration-150
                      `}
                      role="menuitem"
                    >
                      <Trash2 size={14} />
                      Remove Member
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer: Join date and status */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <div className="flex items-center gap-1 text-xs text-text-tertiary">
            <Calendar size={12} />
            <span>
              {isPending ? 'Invited' : 'Joined'}{' '}
              {formatDate(member.accepted_at || member.invited_at)}
            </span>
          </div>

          {/* Status badge */}
          {!isActive && (
            <AppBadge
              variant={isPending ? 'warning' : isSuspended ? 'error' : 'default'}
              size="sm"
              dot
            >
              {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
            </AppBadge>
          )}
        </div>
      </div>
    </AppCard>
  );
};

// =============================================================================
// Skeleton Loading State
// =============================================================================

export interface TeamMemberCardSkeletonProps {
  /** Additional CSS classes */
  className?: string;
}

/**
 * Skeleton loading state for TeamMemberCard
 */
export const TeamMemberCardSkeleton: React.FC<TeamMemberCardSkeletonProps> = ({
  className = '',
}) => {
  return (
    <AppCard variant="outlined" radius="lg" className={className}>
      <div className="p-4 animate-pulse">
        {/* Header */}
        <div className="flex items-start gap-3">
          {/* Avatar skeleton */}
          <div className="w-12 h-12 rounded-full bg-surface-hover flex-shrink-0" />

          {/* Info skeleton */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Name */}
            <div className="h-5 bg-surface-hover rounded w-32" />
            {/* Email */}
            <div className="h-4 bg-surface-hover rounded w-48" />
            {/* Role badge */}
            <div className="h-5 bg-surface-hover rounded-full w-16" />
          </div>
        </div>

        {/* Footer skeleton */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <div className="h-3 bg-surface-hover rounded w-24" />
        </div>
      </div>
    </AppCard>
  );
};

// =============================================================================
// Exports
// =============================================================================

export default TeamMemberCard;
