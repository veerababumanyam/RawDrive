/**
 * ChangeRoleDialog Component
 *
 * Modal dialog for updating a workspace member's role.
 * Allows admins/owners to change the role of an existing team member.
 * Integrates with the useUpdateMemberRoles hook for role updates.
 *
 * @module ChangeRoleDialog
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  UserCog,
  AlertCircle,
  Crown,
  Shield,
  PenTool,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  AppButton,
} from '@/components/ui';
import { RoleSelector } from './RoleSelector';
import { useUpdateMemberRoles, useRoles } from '@/hooks/useTeam';
import type { WorkspaceMember, Role } from '@/services/teamService';

// =============================================================================
// Types
// =============================================================================

export interface ChangeRoleDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog should close */
  onClose: () => void;
  /** The member whose role is being changed */
  member: WorkspaceMember | null;
  /** Callback when role is updated successfully */
  onSuccess?: (member: WorkspaceMember, newRoleIds: string[]) => void;
  /** Additional CSS classes */
  className?: string;
}

interface FormState {
  roleId: string;
}

interface FormErrors {
  roleId?: string;
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
    return <Crown size={16} className="text-gold-500" />;
  }
  if (normalizedRole === 'admin') {
    return <Shield size={16} className="text-primary-500" />;
  }
  if (normalizedRole === 'editor') {
    return <PenTool size={16} className="text-accent-500" />;
  }
  if (normalizedRole === 'viewer') {
    return <Eye size={16} className="text-text-tertiary" />;
  }
  return <UserCog size={16} className="text-text-secondary" />;
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
 * ChangeRoleDialog provides a modal interface for updating a member's role.
 *
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false);
 * const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null);
 *
 * <ChangeRoleDialog
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   member={selectedMember}
 *   onSuccess={(member, newRoleIds) => console.log(`Updated ${member.user_display_name} to role ${newRoleIds}`)}
 * />
 * ```
 */
export const ChangeRoleDialog: React.FC<ChangeRoleDialogProps> = ({
  isOpen,
  onClose,
  member,
  onSuccess,
  className = '',
}) => {
  // Hooks
  const { updateRoles, isUpdating, error: updateError, reset: resetUpdate } = useUpdateMemberRoles();
  const { roles, isLoading: isLoadingRoles } = useRoles();

  // Form state
  const [formState, setFormState] = useState<FormState>({
    roleId: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});

  // Get current role of the member
  const currentRole = useMemo(() => {
    if (!member) return null;
    return findCurrentRole(member, roles);
  }, [member, roles]);

  // Check if member is an owner (cannot change owner's role)
  const isOwner = useMemo(() => {
    if (!member) return false;
    return hasOwnerRole(member, roles);
  }, [member, roles]);

  // Get selected role for comparison
  const selectedRole = useMemo(() => {
    return roles.find((r) => r.role_id === formState.roleId);
  }, [roles, formState.roleId]);

  // Check if role has changed
  const hasRoleChanged = useMemo(() => {
    if (!currentRole) return !!formState.roleId;
    return formState.roleId !== currentRole.role_id;
  }, [currentRole, formState.roleId]);

  // Reset form when dialog opens/closes or member changes
  useEffect(() => {
    if (isOpen && member) {
      // Set the current role as the initial selection
      const memberCurrentRole = findCurrentRole(member, roles);
      setFormState({
        roleId: memberCurrentRole?.role_id || '',
      });
      setErrors({});
      resetUpdate();
    }
  }, [isOpen, member, roles, resetUpdate]);

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Role validation
    if (!formState.roleId) {
      newErrors.roleId = 'Please select a role';
    }

    // Check if role has actually changed
    if (!hasRoleChanged) {
      newErrors.general = 'Please select a different role';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle role change
  const handleRoleChange = (roleId: string) => {
    setFormState({ roleId });

    // Clear errors when user makes a selection
    if (errors.roleId || errors.general) {
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
      await updateRoles({
        userId: member.user_id,
        roleIds: [formState.roleId],
      });

      // Call success callback
      onSuccess?.(member, [formState.roleId]);

      // Close dialog
      onClose();
    } catch {
      // Error is handled by the mutation hook (shows toast)
      setErrors((prev) => ({
        ...prev,
        general: updateError?.message || 'Failed to update role. Please try again.',
      }));
    }
  };

  // Handle dialog close
  const handleClose = () => {
    if (!isUpdating) {
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
      size="md"
      closeOnBackdropClick={!isUpdating}
      closeOnEscape={!isUpdating}
      title="Change Role"
      className={className}
    >
      <form onSubmit={handleSubmit}>
        <ModalHeader>
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center">
              <UserCog size={20} className="text-accent-600 dark:text-accent-400" />
            </div>
            <div>
              <ModalTitle>Change Role</ModalTitle>
              <ModalDescription>
                Update the role and permissions for this team member
              </ModalDescription>
            </div>
          </div>
        </ModalHeader>

        <ModalBody>
          <div className="space-y-5">
            {/* General error message */}
            {errors.general && (
              <div className="flex items-center gap-2 p-3 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg">
                <AlertCircle size={16} className="text-error-500 flex-shrink-0" />
                <p className="text-sm text-error-700 dark:text-error-300">{errors.general}</p>
              </div>
            )}

            {/* Owner warning */}
            {isOwner && (
              <div className="flex items-start gap-2 p-3 bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg">
                <AlertTriangle size={16} className="text-warning-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-warning-700 dark:text-warning-300">
                    Cannot change Owner role
                  </p>
                  <p className="text-xs text-warning-600 dark:text-warning-400 mt-0.5">
                    Ownership must be transferred through workspace settings.
                  </p>
                </div>
              </div>
            )}

            {/* Member info card */}
            <div className="flex items-center gap-3 p-3 bg-surface-hover rounded-lg">
              {/* Avatar */}
              <div
                className={`
                  flex-shrink-0 w-10 h-10 rounded-full
                  ${avatarColor}
                  flex items-center justify-center
                  text-white font-medium text-sm
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
              </div>

              {/* Current role badge */}
              {currentRole && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface rounded-full border border-border">
                  {getRoleIcon(currentRole.name)}
                  <span className="text-xs font-medium text-text-secondary">
                    {currentRole.name}
                  </span>
                </div>
              )}
            </div>

            {/* Role selector */}
            <div className="space-y-2">
              <RoleSelector
                value={formState.roleId}
                onChange={handleRoleChange}
                excludeOwner
                showDescriptions
                disabled={isUpdating || isOwner}
                label="Select New Role"
                error={errors.roleId}
                variant="list"
              />
            </div>

            {/* Role change preview */}
            {hasRoleChanged && selectedRole && currentRole && !isOwner && (
              <div className="flex items-center gap-2 p-3 bg-info-50 dark:bg-info-900/20 border border-info-200 dark:border-info-800 rounded-lg">
                <div className="flex items-center gap-2 flex-1">
                  <div className="flex items-center gap-1.5">
                    {getRoleIcon(currentRole.name)}
                    <span className="text-sm text-text-secondary">
                      {currentRole.name}
                    </span>
                  </div>
                  <span className="text-text-tertiary">→</span>
                  <div className="flex items-center gap-1.5">
                    {getRoleIcon(selectedRole.name)}
                    <span className="text-sm font-medium text-text-primary">
                      {selectedRole.name}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <AppButton
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isUpdating}
          >
            Cancel
          </AppButton>
          <AppButton
            type="submit"
            variant="primary"
            isLoading={isUpdating}
            loadingText="Updating..."
            disabled={!hasRoleChanged || isOwner || isLoadingRoles}
            leftIcon={!isUpdating ? <UserCog size={16} /> : undefined}
          >
            Update Role
          </AppButton>
        </ModalFooter>
      </form>
    </Modal>
  );
};

// =============================================================================
// Skeleton Loading State
// =============================================================================

export interface ChangeRoleDialogSkeletonProps {
  /** Additional CSS classes */
  className?: string;
}

/**
 * Skeleton loading state for ChangeRoleDialog
 * Useful when pre-rendering the dialog structure
 */
export const ChangeRoleDialogSkeleton: React.FC<ChangeRoleDialogSkeletonProps> = ({
  className = '',
}) => {
  return (
    <div className={`animate-pulse ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-surface-hover" />
          <div className="space-y-2">
            <div className="h-5 bg-surface-hover rounded w-32" />
            <div className="h-4 bg-surface-hover rounded w-56" />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-6 space-y-5">
        {/* Member info skeleton */}
        <div className="flex items-center gap-3 p-3 bg-surface-hover rounded-lg">
          <div className="w-10 h-10 rounded-full bg-surface" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-surface rounded w-32" />
            <div className="h-3 bg-surface rounded w-40" />
          </div>
          <div className="h-6 bg-surface rounded-full w-16" />
        </div>

        {/* Role selector skeleton */}
        <div className="space-y-2">
          <div className="h-4 bg-surface-hover rounded w-24" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border border-border rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-surface-hover rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-surface-hover rounded w-20" />
                    <div className="h-3 bg-surface-hover rounded w-full" />
                  </div>
                  <div className="w-5 h-5 bg-surface-hover rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
        <div className="h-10 bg-surface-hover rounded w-20" />
        <div className="h-10 bg-surface-hover rounded w-28" />
      </div>
    </div>
  );
};

// =============================================================================
// Exports
// =============================================================================

export default ChangeRoleDialog;
