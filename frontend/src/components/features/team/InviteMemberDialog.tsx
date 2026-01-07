/**
 * InviteMemberDialog Component
 *
 * Modal dialog for sending workspace invitations to new team members.
 * Allows users to enter an email address and select a role for the invitee.
 * Integrates with the useInviteMember hook for invitation submission.
 *
 * @module InviteMemberDialog
 */

import React, { useState, useEffect, useMemo } from 'react';
import { UserPlus, Mail, Shield, Crown, PenTool, Eye, UserCog, AlertCircle } from 'lucide-react';
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  AppButton,
  AppInput,
  Select,
} from '@/components/ui';
import { useInviteMember, useRoles } from '@/hooks/useTeam';

// =============================================================================
// Types
// =============================================================================

export interface InviteMemberDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog should close */
  onClose: () => void;
  /** Callback when invitation is sent successfully */
  onSuccess?: (email: string) => void;
  /** Additional CSS classes */
  className?: string;
}

interface FormState {
  email: string;
  roleId: string;
}

interface FormErrors {
  email?: string;
  roleId?: string;
  general?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

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
 * Get role description based on role name
 */
function getRoleDescription(roleName: string): string {
  const normalizedRole = roleName.toLowerCase();
  if (normalizedRole === 'owner') {
    return 'Full access to all workspace features including billing and team management';
  }
  if (normalizedRole === 'admin') {
    return 'Can manage team members, galleries, and workspace settings';
  }
  if (normalizedRole === 'editor') {
    return 'Can create, edit, and manage galleries and assets';
  }
  if (normalizedRole === 'viewer') {
    return 'Can view galleries and assets but cannot make changes';
  }
  return 'Custom role with specific permissions';
}

// =============================================================================
// Component
// =============================================================================

/**
 * InviteMemberDialog provides a modal interface for sending workspace invitations.
 *
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false);
 *
 * <InviteMemberDialog
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onSuccess={(email) => console.log(`Invitation sent to ${email}`)}
 * />
 * ```
 */
export const InviteMemberDialog: React.FC<InviteMemberDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
  className = '',
}) => {
  // Hooks
  const { inviteMember, isInviting, error: inviteError, reset: resetInvite } = useInviteMember();
  const { roles, isLoading: isLoadingRoles } = useRoles();

  // Form state
  const [formState, setFormState] = useState<FormState>({
    email: '',
    roleId: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Filter out Owner role from the list (cannot invite as owner)
  const availableRoles = useMemo(() => {
    return roles.filter((role) => role.name.toLowerCase() !== 'owner');
  }, [roles]);

  // Convert roles to select options
  const roleOptions = useMemo(() => {
    return availableRoles.map((role) => ({
      value: role.role_id,
      label: role.name,
    }));
  }, [availableRoles]);

  // Get selected role details for description
  const selectedRole = useMemo(() => {
    return roles.find((r) => r.role_id === formState.roleId);
  }, [roles, formState.roleId]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setFormState({ email: '', roleId: '' });
      setErrors({});
      setTouched({});
      resetInvite();
    }
  }, [isOpen, resetInvite]);

  // Set default role when roles are loaded
  useEffect(() => {
    if (availableRoles.length > 0 && !formState.roleId) {
      // Default to Viewer role if available, otherwise first non-owner role
      const viewerRole = availableRoles.find((r) => r.name.toLowerCase() === 'viewer');
      const defaultRole = viewerRole || availableRoles[0];
      if (defaultRole) {
        setFormState((prev) => ({ ...prev, roleId: defaultRole.role_id }));
      }
    }
  }, [availableRoles, formState.roleId]);

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Email validation
    if (!formState.email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!isValidEmail(formState.email.trim())) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Role validation
    if (!formState.roleId) {
      newErrors.roleId = 'Please select a role';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle input change
  const handleInputChange = (field: keyof FormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  // Handle input blur
  const handleBlur = (field: keyof FormState) => {
    setTouched((prev) => ({ ...prev, [field]: true }));

    // Validate on blur
    if (field === 'email' && formState.email) {
      if (!isValidEmail(formState.email.trim())) {
        setErrors((prev) => ({ ...prev, email: 'Please enter a valid email address' }));
      }
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Mark all fields as touched
    setTouched({ email: true, roleId: true });

    if (!validateForm()) {
      return;
    }

    try {
      await inviteMember({
        email: formState.email.trim().toLowerCase(),
        role_ids: [formState.roleId],
      });

      // Call success callback
      onSuccess?.(formState.email.trim().toLowerCase());

      // Close dialog
      onClose();
    } catch {
      // Error is handled by the mutation hook (shows toast)
      // We can set a general error if needed
      setErrors((prev) => ({
        ...prev,
        general: inviteError?.message || 'Failed to send invitation. Please try again.',
      }));
    }
  };

  // Handle dialog close
  const handleClose = () => {
    if (!isInviting) {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="md"
      closeOnBackdropClick={!isInviting}
      closeOnEscape={!isInviting}
      title="Invite Team Member"
      className={className}
    >
      <form onSubmit={handleSubmit}>
        <ModalHeader>
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <UserPlus size={20} className="text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <ModalTitle>Invite Team Member</ModalTitle>
              <ModalDescription>
                Send an invitation email to add a new member to your workspace
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

            {/* Email input */}
            <AppInput
              label="Email Address"
              type="email"
              placeholder="colleague@example.com"
              value={formState.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              onBlur={() => handleBlur('email')}
              error={touched.email ? errors.email : undefined}
              leftIcon={<Mail size={16} />}
              isRequired
              disabled={isInviting}
              autoFocus
              autoComplete="email"
            />

            {/* Role selector */}
            <div className="space-y-2">
              <Select
                label="Role"
                options={roleOptions}
                value={formState.roleId}
                onChange={(e) => handleInputChange('roleId', e.target.value)}
                error={touched.roleId ? errors.roleId : undefined}
                placeholder={isLoadingRoles ? 'Loading roles...' : 'Select a role'}
                disabled={isInviting || isLoadingRoles}
              />

              {/* Role description */}
              {selectedRole && (
                <div className="flex items-start gap-2 p-3 bg-surface-hover rounded-lg">
                  <span className="flex-shrink-0 mt-0.5">{getRoleIcon(selectedRole.name)}</span>
                  <div>
                    <p className="text-sm font-medium text-text-primary">{selectedRole.name}</p>
                    <p className="text-xs text-text-secondary mt-0.5">
                      {getRoleDescription(selectedRole.name)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Info message */}
            <div className="flex items-start gap-2 p-3 bg-info-50 dark:bg-info-900/20 border border-info-200 dark:border-info-800 rounded-lg">
              <Mail size={16} className="text-info-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-info-700 dark:text-info-300">
                An email will be sent with instructions to join your workspace.
                The invitation will expire in 7 days.
              </p>
            </div>
          </div>
        </ModalBody>

        <ModalFooter>
          <AppButton
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isInviting}
          >
            Cancel
          </AppButton>
          <AppButton
            type="submit"
            variant="primary"
            isLoading={isInviting}
            loadingText="Sending..."
            leftIcon={!isInviting ? <UserPlus size={16} /> : undefined}
          >
            Send Invitation
          </AppButton>
        </ModalFooter>
      </form>
    </Modal>
  );
};

// =============================================================================
// Skeleton Loading State
// =============================================================================

export interface InviteMemberDialogSkeletonProps {
  /** Additional CSS classes */
  className?: string;
}

/**
 * Skeleton loading state for InviteMemberDialog
 * Useful when pre-rendering the dialog structure
 */
export const InviteMemberDialogSkeleton: React.FC<InviteMemberDialogSkeletonProps> = ({
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
        {/* Email input skeleton */}
        <div className="space-y-1.5">
          <div className="h-4 bg-surface-hover rounded w-24" />
          <div className="h-10 bg-surface-hover rounded" />
        </div>

        {/* Role select skeleton */}
        <div className="space-y-1.5">
          <div className="h-4 bg-surface-hover rounded w-12" />
          <div className="h-10 bg-surface-hover rounded" />
        </div>

        {/* Info box skeleton */}
        <div className="h-16 bg-surface-hover rounded-lg" />
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

export default InviteMemberDialog;
