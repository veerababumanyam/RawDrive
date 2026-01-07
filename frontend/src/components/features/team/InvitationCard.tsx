/**
 * InvitationCard Component
 *
 * Displays a pending workspace invitation in a card format.
 * Shows invitee email, assigned roles, invitation status, and expiration date.
 * Supports actions for resending and revoking invitations (when permissions allow).
 *
 * @module InvitationCard
 */

import React, { useState, useMemo } from 'react';
import {
  Mail,
  Clock,
  MoreVertical,
  RefreshCw,
  Trash2,
  AlertCircle,
  CheckCircle,
  XCircle,
  UserPlus,
  Shield,
  Crown,
  PenTool,
  Eye,
  UserCog,
} from 'lucide-react';
import { AppCard, AppBadge, AppButton } from '@/components/ui';
import type { WorkspaceInvitation, InvitationStatus } from '@/services/teamService';
import { isInvitationExpired } from '@/services/teamService';

// =============================================================================
// Types
// =============================================================================

export interface InvitationCardProps {
  /** The invitation data to display */
  invitation: WorkspaceInvitation;
  /** Available roles in the workspace (for role name lookups) */
  roleNames?: Record<string, string>;
  /** Whether the current user can resend this invitation */
  canResend?: boolean;
  /** Whether the current user can revoke this invitation */
  canRevoke?: boolean;
  /** Callback when resend is clicked */
  onResend?: (invitation: WorkspaceInvitation) => void;
  /** Callback when revoke is clicked */
  onRevoke?: (invitation: WorkspaceInvitation) => void;
  /** Whether the resend action is in progress */
  isResending?: boolean;
  /** Whether the revoke action is in progress */
  isRevoking?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a consistent color based on email address
 */
function getAvatarColor(email: string): string {
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
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Format a date string to a readable format
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Get time remaining until expiration
 */
function getTimeRemaining(expiresAt: string): string {
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - now.getTime();

  if (diffMs <= 0) {
    return 'Expired';
  }

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (diffDays > 0) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} left`;
  }
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} left`;
  }
  return 'Expires soon';
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

/**
 * Get status icon and color
 */
function getStatusConfig(status: InvitationStatus, isExpired: boolean): {
  icon: React.ReactNode;
  variant: 'warning' | 'success' | 'error' | 'default';
  label: string;
} {
  if (isExpired) {
    return {
      icon: <AlertCircle size={14} />,
      variant: 'error',
      label: 'Expired',
    };
  }

  switch (status) {
    case 'pending':
      return {
        icon: <Clock size={14} />,
        variant: 'warning',
        label: 'Pending',
      };
    case 'accepted':
      return {
        icon: <CheckCircle size={14} />,
        variant: 'success',
        label: 'Accepted',
      };
    case 'revoked':
      return {
        icon: <XCircle size={14} />,
        variant: 'error',
        label: 'Revoked',
      };
    case 'expired':
      return {
        icon: <AlertCircle size={14} />,
        variant: 'error',
        label: 'Expired',
      };
    default:
      return {
        icon: <Clock size={14} />,
        variant: 'default',
        label: status,
      };
  }
}

// =============================================================================
// Component
// =============================================================================

/**
 * InvitationCard displays a pending invitation with actions.
 *
 * @example
 * ```tsx
 * <InvitationCard
 *   invitation={invitation}
 *   roleNames={{ 'role-123': 'Admin', 'role-456': 'Editor' }}
 *   canResend={hasPermission('member:invite')}
 *   canRevoke={hasPermission('member:write')}
 *   onResend={handleResend}
 *   onRevoke={handleRevoke}
 * />
 * ```
 */
export const InvitationCard: React.FC<InvitationCardProps> = ({
  invitation,
  roleNames = {},
  canResend = false,
  canRevoke = false,
  onResend,
  onRevoke,
  isResending = false,
  isRevoking = false,
  className = '',
}) => {
  const [showMenu, setShowMenu] = useState(false);

  // Check if invitation is expired
  const isExpired = useMemo(() => isInvitationExpired(invitation), [invitation]);

  // Get display role names from role IDs
  const displayRoles = useMemo(() => {
    return invitation.roles.map((roleId) => {
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
  }, [invitation.roles, roleNames]);

  // Get primary role (first role, usually the most significant)
  const primaryRole = displayRoles[0] || 'No Role';
  const hasMultipleRoles = displayRoles.length > 1;

  // Avatar color based on email for consistency
  const avatarColor = getAvatarColor(invitation.email);

  // Status configuration
  const statusConfig = getStatusConfig(invitation.status, isExpired);

  // Can show actions only for pending invitations that aren't expired
  const canShowActions = (canResend || canRevoke) && invitation.status === 'pending';

  const handleResend = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onResend?.(invitation);
  };

  const handleRevoke = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onRevoke?.(invitation);
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

  return (
    <AppCard
      variant="outlined"
      radius="lg"
      className={`group relative transition-all duration-200 hover:border-border-hover ${
        isExpired ? 'opacity-75' : ''
      } ${className}`}
    >
      <div className="p-4">
        {/* Header: Avatar, Email, Status, Actions */}
        <div className="flex items-start gap-3">
          {/* Avatar placeholder with email icon */}
          <div
            className={`
              relative flex-shrink-0
              w-12 h-12 rounded-full
              ${avatarColor}
              flex items-center justify-center
              text-white
              ring-2 ring-white dark:ring-surface
              shadow-sm
            `}
          >
            <UserPlus size={20} />
            {/* Status indicator dot */}
            <span
              className={`
                absolute -bottom-0.5 -right-0.5
                w-3.5 h-3.5 rounded-full
                border-2 border-white dark:border-surface
                ${invitation.status === 'pending' && !isExpired ? 'bg-warning-500' : ''}
                ${invitation.status === 'accepted' ? 'bg-success-500' : ''}
                ${invitation.status === 'revoked' || isExpired ? 'bg-error-500' : ''}
                ${invitation.status === 'expired' ? 'bg-error-500' : ''}
              `}
              title={statusConfig.label}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Email */}
            <div className="flex items-center gap-2">
              <h3
                className="font-medium text-text-primary truncate"
                title={invitation.email}
              >
                {invitation.email}
              </h3>
            </div>

            {/* Invited label */}
            <p className="text-sm text-text-secondary mt-0.5 flex items-center gap-1">
              <Mail size={12} className="flex-shrink-0" />
              Invitation sent
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
          {canShowActions && (
            <div className="relative flex-shrink-0">
              <AppButton
                variant="ghost"
                size="icon"
                onClick={handleMenuToggle}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Invitation actions"
                aria-expanded={showMenu}
                aria-haspopup="true"
                disabled={isResending || isRevoking}
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
                  {canResend && !isExpired && (
                    <button
                      onClick={handleResend}
                      disabled={isResending}
                      className={`
                        w-full px-3 py-2 text-left text-sm
                        flex items-center gap-2
                        text-text-primary hover:bg-surface-hover
                        transition-colors duration-150
                        disabled:opacity-50 disabled:cursor-not-allowed
                      `}
                      role="menuitem"
                    >
                      <RefreshCw size={14} className={isResending ? 'animate-spin' : ''} />
                      {isResending ? 'Resending...' : 'Resend Invitation'}
                    </button>
                  )}
                  {canRevoke && (
                    <button
                      onClick={handleRevoke}
                      disabled={isRevoking}
                      className={`
                        w-full px-3 py-2 text-left text-sm
                        flex items-center gap-2
                        text-error-500 hover:bg-error-50 dark:hover:bg-error-900/20
                        transition-colors duration-150
                        disabled:opacity-50 disabled:cursor-not-allowed
                      `}
                      role="menuitem"
                    >
                      <Trash2 size={14} />
                      {isRevoking ? 'Revoking...' : 'Revoke Invitation'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer: Sent date, expiration, and status */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <div className="flex items-center gap-3 text-xs text-text-tertiary">
            {/* Sent date */}
            <span className="flex items-center gap-1">
              <Clock size={12} />
              Sent {formatDate(invitation.created_at)}
            </span>

            {/* Expiration countdown for pending invitations */}
            {invitation.status === 'pending' && !isExpired && (
              <>
                <span className="text-border">•</span>
                <span
                  className={`
                    flex items-center gap-1
                    ${getTimeRemaining(invitation.expires_at) === 'Expires soon' ? 'text-warning-500' : ''}
                  `}
                >
                  <AlertCircle size={12} />
                  {getTimeRemaining(invitation.expires_at)}
                </span>
              </>
            )}
          </div>

          {/* Status badge */}
          <AppBadge
            variant={statusConfig.variant}
            size="sm"
            icon={statusConfig.icon}
          >
            {statusConfig.label}
          </AppBadge>
        </div>
      </div>
    </AppCard>
  );
};

// =============================================================================
// Skeleton Loading State
// =============================================================================

export interface InvitationCardSkeletonProps {
  /** Additional CSS classes */
  className?: string;
}

/**
 * Skeleton loading state for InvitationCard
 */
export const InvitationCardSkeleton: React.FC<InvitationCardSkeletonProps> = ({
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
            {/* Email */}
            <div className="h-5 bg-surface-hover rounded w-48" />
            {/* Subtext */}
            <div className="h-4 bg-surface-hover rounded w-24" />
            {/* Role badge */}
            <div className="h-5 bg-surface-hover rounded-full w-16" />
          </div>
        </div>

        {/* Footer skeleton */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <div className="h-3 bg-surface-hover rounded w-28" />
          <div className="h-5 bg-surface-hover rounded-full w-16" />
        </div>
      </div>
    </AppCard>
  );
};

// =============================================================================
// Empty State
// =============================================================================

export interface InvitationEmptyStateProps {
  /** Message to display */
  message?: string;
  /** Action button label */
  actionLabel?: string;
  /** Callback when action is clicked */
  onAction?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Empty state for when there are no invitations
 */
export const InvitationEmptyState: React.FC<InvitationEmptyStateProps> = ({
  message = 'No pending invitations',
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`
        flex flex-col items-center justify-center
        py-12 px-6 text-center
        ${className}
      `}
    >
      <div className="w-16 h-16 rounded-full bg-surface-hover flex items-center justify-center mb-4">
        <Mail size={28} className="text-text-tertiary" />
      </div>
      <p className="text-text-secondary mb-4">{message}</p>
      {actionLabel && onAction && (
        <AppButton variant="primary" size="sm" onClick={onAction}>
          <UserPlus size={16} />
          {actionLabel}
        </AppButton>
      )}
    </div>
  );
};

// =============================================================================
// Exports
// =============================================================================

export default InvitationCard;
