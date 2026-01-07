/**
 * RemoveMemberDialog Component
 *
 * Confirmation modal dialog for removing a workspace member.
 * Shows member information and requires confirmation before removal.
 * Integrates with the useRemoveMember hook for member removal.
 *
 * @module RemoveMemberDialog
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  UserMinus,
  AlertTriangle,
  Crown,
  Shield,
  PenTool,
  Eye,
  UserCog,
  AlertCircle,
} from 'lucide-react';
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  AppButton,
  AppInput,
} from '@/components/ui';
import { useRemoveMember, useRoles } from '@/hooks/useTeam';
import type { WorkspaceMember, Role } from '@/services/teamService';

// =============================================================================
// Types
// =============================================================================

export interface RemoveMemberDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog should close */
  onClose: () => void;
  /** The member to be removed */
  member: WorkspaceMember | null;
  /** Callback when member is removed successfully */
  onSuccess?: (member: WorkspaceMember) => void;
  /** Additional CSS classes */
  className?: string;
}

interface FormErrors {
  confirmation?: string;
  general?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get role icon based on role name
 */
function getRoleIcon(roleName: string): React.ReactNode {
  const normalizedRole = roleName.toLowerCase();
  if (normalizedRole === 'owner') {
    return <Crown size={14} className="text-gold-500" />;
  }
  if (normalizedRole === 'admin') {
    return <Shield size={14} className="text-primary-500" />;
  }
  if (normalizedRole === 'editor') {
    return <PenTool size={14} className="text-accent-500" />;
  }
  if (normalizedRole === 'viewer') {
    return <Eye size={14} className="text-text-tertiary" />;
  }
  return <UserCog size={14} className="text-text-secondary" />;
}

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
 * Find the current role from role IDs
 */
function findCurrentRole(member: WorkspaceMember, roles: Role[]): Role | null {
  if (member.roles.length === 0) return null;

  // First role is considered the primary role
  const primaryRoleId = member.roles[0];

  // Check if it's a role ID (UUID) or a role name
  const roleById = roles.find((r) => r.role_id === primaryRoleId);
  if (roleById) return roleById;

  // Fallback: try to match by name
  const roleByName = roles.find(
    (r) => r.name.toLowerCase() === primaryRoleId.toLowerCase()
  );
  return roleByName || null;
}

/**
 * Check if member has owner role
 */
function hasOwnerRole(member: WorkspaceMember, roles: Role[]): boolean {
  return member.roles.some((roleId) => {
    const role = roles.find((r) => r.role_id === roleId);
    return role?.name.toLowerCase() === 'owner';
  });
}

// =============================================================================
// Component
// =============================================================================

/**
 * RemoveMemberDialog provides a confirmation modal for removing a team member.
 *
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false);
 * const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null);
 *
 * <RemoveMemberDialog
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   member={selectedMember}
 *   onSuccess={(member) => console.log(`Removed ${member.user_display_name}`)}
 * />
 * ```
 */
export const RemoveMemberDialog: React.FC<RemoveMemberDialogProps> = ({
  isOpen,
  onClose,
  member,
  onSuccess,
  className = '',
}) => {
  // Hooks
  const { removeMember, isRemoving, error: removeError, reset: resetRemove } = useRemoveMember();
  const { roles } = useRoles();

  // Form state
  const [confirmationText, setConfirmationText] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  // Get current role of the member
  const currentRole = useMemo(() => {
    if (!member) return null;
    return findCurrentRole(member, roles);
  }, [member, roles]);

  // Check if member is an owner (cannot remove owner)
  const isOwner = useMemo(() => {
    if (!member) return false;
    return hasOwnerRole(member, roles);
  }, [member, roles]);

  // Check if member is an admin (require confirmation for admins)
  const isAdmin = useMemo(() => {
    if (!member) return false;
    return member.roles.some((roleId) => {
      const role = roles.find((r) => r.role_id === roleId);
      return role?.name.toLowerCase() === 'admin';
    });
  }, [member, roles]);

  // Confirmation is required for admins (type REMOVE to confirm)
  const requiresConfirmation = isAdmin;
  const confirmationKeyword = 'REMOVE';

  // Check if confirmation is valid
  const isConfirmationValid = useMemo(() => {
    if (!requiresConfirmation) return true;
    return confirmationText === confirmationKeyword;
  }, [requiresConfirmation, confirmationText]);

  // Reset form when dialog opens/closes or member changes
  useEffect(() => {
    if (isOpen && member) {
      setConfirmationText('');
      setErrors({});
      resetRemove();
    }
  }, [isOpen, member, resetRemove]);

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (requiresConfirmation && !isConfirmationValid) {
      newErrors.confirmation = `Please type "${confirmationKeyword}" to confirm`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle confirmation text change
  const handleConfirmationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmationText(e.target.value.toUpperCase());
    // Clear error when user types
    if (errors.confirmation) {
      setErrors({});
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!member) return;

    if (!validateForm()) {
      return;
    }

    try {
      await removeMember(member.user_id);

      // Call success callback
      onSuccess?.(member);

      // Close dialog
      onClose();
    } catch {
      // Error is handled by the mutation hook (shows toast)
      setErrors((prev) => ({
        ...prev,
        general: removeError?.message || 'Failed to remove member. Please try again.',
      }));
    }
  };

  // Handle key down for confirmation input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isRemoving) {
      handleSubmit(e);
    }
  };

  // Handle dialog close
  const handleClose = () => {
    if (!isRemoving) {
      onClose();
    }
  };

  // Don't render if no member is selected
  if (!member) return null;

  const avatarColor = getAvatarColor(member.user_id);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="sm"
      closeOnBackdropClick={!isRemoving}
      closeOnEscape={!isRemoving}
      title="Remove Member"
      className={className}
    >
      <form onSubmit={handleSubmit}>
        <ModalHeader bordered={false}>
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-error-100 dark:bg-error-900/30 flex items-center justify-center">
              <UserMinus size={20} className="text-error-600 dark:text-error-400" />
            </div>
            <div>
              <ModalTitle>Remove Team Member</ModalTitle>
              <ModalDescription>
                This action will revoke access to the workspace
              </ModalDescription>
            </div>
          </div>
        </ModalHeader>

        <ModalBody>
          <div className="space-y-4">
            {/* General error message */}
            {errors.general && (
              <div className="flex items-center gap-2 p-3 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg">
                <AlertCircle size={16} className="text-error-500 flex-shrink-0" />
                <p className="text-sm text-error-700 dark:text-error-300">{errors.general}</p>
              </div>
            )}

            {/* Owner warning - cannot remove */}
            {isOwner && (
              <div className="flex items-start gap-2 p-3 bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg">
                <AlertTriangle size={16} className="text-warning-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-warning-700 dark:text-warning-300">
                    Cannot remove Owner
                  </p>
                  <p className="text-xs text-warning-600 dark:text-warning-400 mt-0.5">
                    Ownership must be transferred before the owner can be removed.
                  </p>
                </div>
              </div>
            )}

            {/* Member info card */}
            <div className="flex items-center gap-3 p-3 bg-surface-hover rounded-lg">
              {/* Avatar */}
              <div
                className={`
                  flex-shrink-0 w-12 h-12 rounded-full
                  ${avatarColor}
                  flex items-center justify-center
                  text-white font-semibold text-lg
                `}
              >
                {getInitials(member.user_display_name)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-text-primary truncate">
                  {member.user_display_name}
                </p>
                <p className="text-sm text-text-secondary truncate">
                  {member.user_email}
                </p>
                {/* Current role badge */}
                {currentRole && (
                  <div className="flex items-center gap-1.5 mt-1">
                    {getRoleIcon(currentRole.name)}
                    <span className="text-xs text-text-tertiary">
                      {currentRole.name}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Warning message */}
            {!isOwner && (
              <div
                className={`
                  p-3 rounded-lg text-sm
                  bg-error-50 dark:bg-error-900/20
                  text-error-700 dark:text-error-300
                  border border-error-200 dark:border-error-800
                `}
              >
                <strong>Warning:</strong> This will immediately revoke{' '}
                <strong>{member.user_display_name}</strong>'s access to this workspace.
                They will no longer be able to view or edit any content.
              </div>
            )}

            {/* Confirmation input for admins */}
            {requiresConfirmation && !isOwner && (
              <div className="space-y-2">
                <p className="text-sm text-text-secondary">
                  You are about to remove an <strong>Admin</strong>. To confirm, type{' '}
                  <strong className="text-text-primary font-mono">{confirmationKeyword}</strong>{' '}
                  below:
                </p>
                <AppInput
                  value={confirmationText}
                  onChange={handleConfirmationChange}
                  onKeyDown={handleKeyDown}
                  placeholder={`Type "${confirmationKeyword}" to confirm`}
                  error={errors.confirmation}
                  disabled={isRemoving}
                  autoFocus
                  className="font-mono"
                  aria-label="Confirmation text"
                />
              </div>
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <AppButton
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isRemoving}
          >
            Cancel
          </AppButton>
          <AppButton
            type="submit"
            variant="destructive"
            isLoading={isRemoving}
            loadingText="Removing..."
            disabled={isOwner || (requiresConfirmation && !isConfirmationValid)}
            leftIcon={!isRemoving ? <UserMinus size={16} /> : undefined}
          >
            Remove Member
          </AppButton>
        </ModalFooter>
      </form>
    </Modal>
  );
};

// =============================================================================
// Skeleton Loading State
// =============================================================================

export interface RemoveMemberDialogSkeletonProps {
  /** Additional CSS classes */
  className?: string;
}

/**
 * Skeleton loading state for RemoveMemberDialog
 * Useful when pre-rendering the dialog structure
 */
export const RemoveMemberDialogSkeleton: React.FC<RemoveMemberDialogSkeletonProps> = ({
  className = '',
}) => {
  return (
    <div className={`animate-pulse ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-surface-hover" />
          <div className="space-y-2">
            <div className="h-5 bg-surface-hover rounded w-40" />
            <div className="h-4 bg-surface-hover rounded w-56" />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-6 space-y-4">
        {/* Member info skeleton */}
        <div className="flex items-center gap-3 p-3 bg-surface-hover rounded-lg">
          <div className="w-12 h-12 rounded-full bg-surface" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-surface rounded w-32" />
            <div className="h-3 bg-surface rounded w-40" />
            <div className="h-3 bg-surface rounded w-16" />
          </div>
        </div>

        {/* Warning skeleton */}
        <div className="p-3 bg-surface-hover rounded-lg">
          <div className="h-4 bg-surface rounded w-full" />
          <div className="h-4 bg-surface rounded w-3/4 mt-2" />
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
        <div className="h-10 bg-surface-hover rounded w-20" />
        <div className="h-10 bg-surface-hover rounded w-32" />
      </div>
    </div>
  );
};

// =============================================================================
// Exports
// =============================================================================

export default RemoveMemberDialog;
