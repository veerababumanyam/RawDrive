/**
 * RoleSelector Component
 *
 * A reusable component for selecting workspace roles.
 * Supports both single-select and multi-select modes, displays role icons
 * and descriptions, and integrates with the useRoles hook.
 *
 * @module RoleSelector
 */

import React, { useMemo, useCallback } from 'react';
import { Crown, Shield, PenTool, Eye, UserCog, Check, AlertCircle } from 'lucide-react';
import { AppCard, Spinner } from '@/components/ui';
import { useRoles } from '@/hooks/useTeam';
import type { Role } from '@/services/teamService';

// =============================================================================
// Types
// =============================================================================

export interface RoleSelectorProps {
  /** Currently selected role ID (single select mode) */
  value?: string;
  /** Currently selected role IDs (multi-select mode) */
  values?: string[];
  /** Callback when selection changes (single select mode) */
  onChange?: (roleId: string) => void;
  /** Callback when selection changes (multi-select mode) */
  onMultiChange?: (roleIds: string[]) => void;
  /** Whether to allow multiple selections */
  multiple?: boolean;
  /** Whether to exclude the Owner role from selection */
  excludeOwner?: boolean;
  /** Whether to only show system roles (exclude custom roles) */
  systemOnly?: boolean;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Whether to show role descriptions */
  showDescriptions?: boolean;
  /** Whether to show permissions for each role */
  showPermissions?: boolean;
  /** Label for the selector */
  label?: string;
  /** Error message to display */
  error?: string;
  /** Helper text to display */
  helperText?: string;
  /** Layout variant */
  variant?: 'list' | 'grid' | 'compact';
  /** Additional CSS classes */
  className?: string;
  /** Roles to use (if not fetching from useRoles hook) */
  roles?: Role[];
  /** Whether roles are loading (when using external roles) */
  isLoading?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get role icon based on role name
 */
function getRoleIcon(roleName: string, size: number = 16): React.ReactNode {
  const normalizedRole = roleName.toLowerCase();
  if (normalizedRole === 'owner') {
    return <Crown size={size} className="text-gold-500" />;
  }
  if (normalizedRole === 'admin') {
    return <Shield size={size} className="text-primary-500" />;
  }
  if (normalizedRole === 'editor') {
    return <PenTool size={size} className="text-accent-500" />;
  }
  if (normalizedRole === 'viewer') {
    return <Eye size={size} className="text-text-tertiary" />;
  }
  return <UserCog size={size} className="text-text-secondary" />;
}

/**
 * Get role description based on role name
 */
function getRoleDescription(role: Role): string {
  const normalizedRole = role.name.toLowerCase();
  if (normalizedRole === 'owner') {
    return 'Full access to all workspace features including billing, team management, and settings.';
  }
  if (normalizedRole === 'admin') {
    return 'Can manage team members, galleries, clients, and workspace settings (except billing).';
  }
  if (normalizedRole === 'editor') {
    return 'Can create, edit, and manage galleries, assets, and view clients.';
  }
  if (normalizedRole === 'viewer') {
    return 'Can view galleries and assets but cannot make any changes.';
  }
  // For custom roles, generate description from permissions
  if (role.permissions.length > 0) {
    return `Custom role with ${role.permissions.length} permissions.`;
  }
  return 'Custom role with specific permissions.';
}

/**
 * Get the highlight color for a role
 */
function getRoleHighlightColor(roleName: string): string {
  const normalizedRole = roleName.toLowerCase();
  if (normalizedRole === 'owner') return 'border-gold-500 bg-gold-50 dark:bg-gold-900/20';
  if (normalizedRole === 'admin') return 'border-primary-500 bg-primary-50 dark:bg-primary-900/20';
  if (normalizedRole === 'editor') return 'border-accent-500 bg-accent-50 dark:bg-accent-900/20';
  if (normalizedRole === 'viewer') return 'border-neutral-400 bg-neutral-50 dark:bg-neutral-800/50';
  return 'border-primary-500 bg-primary-50 dark:bg-primary-900/20';
}

/**
 * Format permission strings for display
 */
function formatPermission(permission: string): string {
  const permissionLabels: Record<string, string> = {
    'workspace:*': 'Full workspace access',
    'settings:read': 'View settings',
    'settings:write': 'Edit settings',
    'member:read': 'View team',
    'member:write': 'Manage team',
    'member:invite': 'Invite members',
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
  return permissionLabels[permission] || permission;
}

// =============================================================================
// Component
// =============================================================================

/**
 * RoleSelector provides a UI for selecting workspace roles.
 *
 * @example
 * Single select:
 * ```tsx
 * const [selectedRole, setSelectedRole] = useState('');
 *
 * <RoleSelector
 *   value={selectedRole}
 *   onChange={setSelectedRole}
 *   excludeOwner
 *   showDescriptions
 * />
 * ```
 *
 * @example
 * Multi-select:
 * ```tsx
 * const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
 *
 * <RoleSelector
 *   values={selectedRoles}
 *   onMultiChange={setSelectedRoles}
 *   multiple
 *   excludeOwner
 * />
 * ```
 */
export const RoleSelector: React.FC<RoleSelectorProps> = ({
  value,
  values = [],
  onChange,
  onMultiChange,
  multiple = false,
  excludeOwner = false,
  systemOnly = false,
  disabled = false,
  showDescriptions = true,
  showPermissions = false,
  label,
  error,
  helperText,
  variant = 'list',
  className = '',
  roles: externalRoles,
  isLoading: externalLoading,
}) => {
  // Fetch roles if not provided externally
  const {
    roles: fetchedRoles,
    isLoading: isFetchingRoles,
  } = useRoles({ enabled: !externalRoles });

  // Use external roles if provided, otherwise use fetched roles
  const roles = externalRoles ?? fetchedRoles;
  const isLoading = externalLoading ?? isFetchingRoles;

  // Filter roles based on props
  const availableRoles = useMemo(() => {
    let filtered = roles;

    if (excludeOwner) {
      filtered = filtered.filter((role) => role.name.toLowerCase() !== 'owner');
    }

    if (systemOnly) {
      filtered = filtered.filter((role) => role.is_system);
    }

    // Sort: system roles first (in order: Owner, Admin, Editor, Viewer), then custom roles
    const roleOrder: Record<string, number> = {
      owner: 0,
      admin: 1,
      editor: 2,
      viewer: 3,
    };

    return filtered.sort((a, b) => {
      // System roles come first
      if (a.is_system && !b.is_system) return -1;
      if (!a.is_system && b.is_system) return 1;

      // Sort system roles by predefined order
      if (a.is_system && b.is_system) {
        const orderA = roleOrder[a.name.toLowerCase()] ?? 99;
        const orderB = roleOrder[b.name.toLowerCase()] ?? 99;
        return orderA - orderB;
      }

      // Sort custom roles alphabetically
      return a.name.localeCompare(b.name);
    });
  }, [roles, excludeOwner, systemOnly]);

  // Check if a role is selected
  const isSelected = useCallback(
    (roleId: string): boolean => {
      if (multiple) {
        return values.includes(roleId);
      }
      return value === roleId;
    },
    [multiple, value, values]
  );

  // Handle role selection
  const handleSelect = useCallback(
    (roleId: string) => {
      if (disabled) return;

      if (multiple) {
        const newValues = values.includes(roleId)
          ? values.filter((id) => id !== roleId)
          : [...values, roleId];
        onMultiChange?.(newValues);
      } else {
        onChange?.(roleId);
      }
    },
    [disabled, multiple, values, onChange, onMultiChange]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, roleId: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSelect(roleId);
      }
    },
    [handleSelect]
  );

  // Layout classes based on variant
  const layoutClasses = useMemo(() => {
    switch (variant) {
      case 'grid':
        return 'grid grid-cols-1 sm:grid-cols-2 gap-3';
      case 'compact':
        return 'flex flex-wrap gap-2';
      case 'list':
      default:
        return 'flex flex-col gap-2';
    }
  }, [variant]);

  // Loading state
  if (isLoading) {
    return (
      <div className={`${className}`}>
        {label && (
          <label className="block text-sm font-medium text-text-primary mb-2">
            {label}
          </label>
        )}
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" />
          <span className="ml-2 text-sm text-text-secondary">Loading roles...</span>
        </div>
      </div>
    );
  }

  // Empty state
  if (availableRoles.length === 0) {
    return (
      <div className={`${className}`}>
        {label && (
          <label className="block text-sm font-medium text-text-primary mb-2">
            {label}
          </label>
        )}
        <div className="flex items-center justify-center py-8 text-text-secondary">
          <AlertCircle size={16} className="mr-2" />
          <span className="text-sm">No roles available</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {label && (
        <label className="block text-sm font-medium text-text-primary mb-2">
          {label}
          {multiple && (
            <span className="ml-1 text-xs text-text-tertiary font-normal">
              (select multiple)
            </span>
          )}
        </label>
      )}

      <div
        className={layoutClasses}
        role={multiple ? 'group' : 'radiogroup'}
        aria-label={label || 'Role selection'}
      >
        {availableRoles.map((role) => {
          const selected = isSelected(role.role_id);
          const isCompact = variant === 'compact';

          return (
            <div
              key={role.role_id}
              role={multiple ? 'checkbox' : 'radio'}
              aria-checked={selected}
              tabIndex={disabled ? -1 : 0}
              onClick={() => handleSelect(role.role_id)}
              onKeyDown={(e) => handleKeyDown(e, role.role_id)}
              className={`
                relative
                ${isCompact ? 'inline-flex items-center' : ''}
                ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
              `}
            >
              {isCompact ? (
                // Compact variant: pill-style buttons
                <div
                  className={`
                    inline-flex items-center gap-1.5 px-3 py-1.5
                    rounded-full border-2 transition-all duration-150
                    ${
                      selected
                        ? getRoleHighlightColor(role.name)
                        : 'border-border bg-surface hover:border-border-hover'
                    }
                    ${disabled ? '' : 'hover:shadow-sm'}
                  `}
                >
                  {getRoleIcon(role.name, 14)}
                  <span className="text-sm font-medium text-text-primary">
                    {role.name}
                  </span>
                  {selected && (
                    <Check size={14} className="text-primary-600 dark:text-primary-400" />
                  )}
                </div>
              ) : (
                // List and grid variants: card-style
                <AppCard
                  variant="outlined"
                  radius="lg"
                  className={`
                    transition-all duration-150
                    ${
                      selected
                        ? `border-2 ${getRoleHighlightColor(role.name)}`
                        : 'border hover:border-border-hover'
                    }
                    ${disabled ? '' : 'hover:shadow-sm'}
                  `}
                >
                  <div className="p-3">
                    <div className="flex items-start gap-3">
                      {/* Role Icon */}
                      <div
                        className={`
                          flex-shrink-0 w-10 h-10 rounded-lg
                          flex items-center justify-center
                          ${selected ? 'bg-white/50 dark:bg-black/20' : 'bg-surface-hover'}
                          transition-colors duration-150
                        `}
                      >
                        {getRoleIcon(role.name, 20)}
                      </div>

                      {/* Role Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-text-primary">
                            {role.name}
                          </h4>
                          {role.is_system && (
                            <span className="text-[10px] uppercase tracking-wide text-text-tertiary bg-surface-hover px-1.5 py-0.5 rounded">
                              System
                            </span>
                          )}
                        </div>

                        {showDescriptions && (
                          <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                            {getRoleDescription(role)}
                          </p>
                        )}

                        {showPermissions && role.permissions.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {role.permissions.slice(0, 4).map((permission) => (
                              <span
                                key={permission}
                                className="text-[10px] bg-surface-hover text-text-secondary px-1.5 py-0.5 rounded"
                              >
                                {formatPermission(permission)}
                              </span>
                            ))}
                            {role.permissions.length > 4 && (
                              <span className="text-[10px] text-text-tertiary">
                                +{role.permissions.length - 4} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Selection indicator */}
                      <div
                        className={`
                          flex-shrink-0 w-5 h-5 rounded-full
                          flex items-center justify-center
                          transition-all duration-150
                          ${
                            selected
                              ? 'bg-primary-500 text-white'
                              : 'border-2 border-border bg-surface'
                          }
                        `}
                      >
                        {selected && <Check size={12} strokeWidth={3} />}
                      </div>
                    </div>
                  </div>
                </AppCard>
              )}
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-2 text-xs text-error flex items-center gap-1" role="alert">
          <AlertCircle size={12} />
          {error}
        </p>
      )}

      {/* Helper text */}
      {helperText && !error && (
        <p className="mt-2 text-xs text-text-tertiary">{helperText}</p>
      )}
    </div>
  );
};

// =============================================================================
// Skeleton Loading State
// =============================================================================

export interface RoleSelectorSkeletonProps {
  /** Number of skeleton items to show */
  count?: number;
  /** Layout variant */
  variant?: 'list' | 'grid' | 'compact';
  /** Additional CSS classes */
  className?: string;
}

/**
 * Skeleton loading state for RoleSelector
 */
export const RoleSelectorSkeleton: React.FC<RoleSelectorSkeletonProps> = ({
  count = 4,
  variant = 'list',
  className = '',
}) => {
  const layoutClasses = useMemo(() => {
    switch (variant) {
      case 'grid':
        return 'grid grid-cols-1 sm:grid-cols-2 gap-3';
      case 'compact':
        return 'flex flex-wrap gap-2';
      case 'list':
      default:
        return 'flex flex-col gap-2';
    }
  }, [variant]);

  if (variant === 'compact') {
    return (
      <div className={`animate-pulse ${layoutClasses} ${className}`}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="h-8 bg-surface-hover rounded-full"
            style={{ width: `${70 + (i % 3) * 20}px` }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`animate-pulse ${layoutClasses} ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-border rounded-lg p-3">
          <div className="flex items-start gap-3">
            {/* Icon skeleton */}
            <div className="w-10 h-10 bg-surface-hover rounded-lg flex-shrink-0" />

            {/* Content skeleton */}
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-surface-hover rounded w-20" />
              <div className="h-3 bg-surface-hover rounded w-full" />
              <div className="h-3 bg-surface-hover rounded w-3/4" />
            </div>

            {/* Checkbox skeleton */}
            <div className="w-5 h-5 bg-surface-hover rounded-full flex-shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
};

// =============================================================================
// Inline Role Selector (Simple dropdown alternative)
// =============================================================================

export interface InlineRoleSelectorProps {
  /** Currently selected role ID */
  value?: string;
  /** Callback when selection changes */
  onChange?: (roleId: string) => void;
  /** Whether to exclude the Owner role */
  excludeOwner?: boolean;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Label for the selector */
  label?: string;
  /** Error message */
  error?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Additional CSS classes */
  className?: string;
  /** Roles to use (if not fetching from useRoles hook) */
  roles?: Role[];
  /** Whether roles are loading */
  isLoading?: boolean;
}

/**
 * InlineRoleSelector provides a simpler dropdown-style role selector.
 * Use this when you need a more compact selection UI.
 *
 * @example
 * ```tsx
 * <InlineRoleSelector
 *   value={selectedRole}
 *   onChange={setSelectedRole}
 *   excludeOwner
 *   label="Select Role"
 * />
 * ```
 */
export const InlineRoleSelector: React.FC<InlineRoleSelectorProps> = ({
  value,
  onChange,
  excludeOwner = false,
  disabled = false,
  label,
  error,
  placeholder = 'Select a role',
  className = '',
  roles: externalRoles,
  isLoading: externalLoading,
}) => {
  // Fetch roles if not provided externally
  const { roles: fetchedRoles, isLoading: isFetchingRoles } = useRoles({
    enabled: !externalRoles,
  });

  // Use external roles if provided
  const roles = externalRoles ?? fetchedRoles;
  const isLoading = externalLoading ?? isFetchingRoles;

  // Filter roles
  const availableRoles = useMemo(() => {
    let filtered = roles;

    if (excludeOwner) {
      filtered = filtered.filter((role) => role.name.toLowerCase() !== 'owner');
    }

    // Sort: system roles first
    return filtered.sort((a, b) => {
      if (a.is_system && !b.is_system) return -1;
      if (!a.is_system && b.is_system) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [roles, excludeOwner]);

  // Get selected role for display
  const selectedRole = useMemo(() => {
    return roles.find((r) => r.role_id === value);
  }, [roles, value]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange?.(e.target.value);
  };

  const hasError = !!error;

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-text-primary mb-1.5">
          {label}
        </label>
      )}

      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          {selectedRole ? (
            getRoleIcon(selectedRole.name, 16)
          ) : (
            <UserCog size={16} className="text-text-tertiary" />
          )}
        </div>

        <select
          value={value || ''}
          onChange={handleChange}
          disabled={disabled || isLoading}
          className={`
            appearance-none w-full
            py-2.5 pl-10 pr-10 text-sm
            bg-surface text-text-primary
            border ${hasError ? 'border-error' : 'border-border'}
            rounded-input outline-none
            cursor-pointer
            transition-all duration-150 ease-out
            hover:border-border-hover
            focus:border-border-focus focus:ring-2 ${hasError ? 'focus:ring-error-100' : 'focus:ring-primary-100'}
            disabled:bg-background-alt disabled:text-text-disabled disabled:cursor-not-allowed
          `}
          aria-invalid={hasError}
        >
          <option value="" disabled>
            {isLoading ? 'Loading roles...' : placeholder}
          </option>
          {availableRoles.map((role) => (
            <option key={role.role_id} value={role.role_id}>
              {role.name}
              {role.is_system ? ' (System)' : ''}
            </option>
          ))}
        </select>

        {/* Chevron icon */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg
            className="w-4 h-4 text-text-tertiary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>

      {/* Selected role description */}
      {selectedRole && (
        <div className="flex items-start gap-2 mt-2 p-2 bg-surface-hover rounded">
          <span className="flex-shrink-0 mt-0.5">
            {getRoleIcon(selectedRole.name, 14)}
          </span>
          <div>
            <p className="text-xs text-text-secondary">
              {getRoleDescription(selectedRole)}
            </p>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="mt-1.5 text-xs text-error flex items-center gap-1" role="alert">
          <AlertCircle size={12} />
          {error}
        </p>
      )}
    </div>
  );
};

// =============================================================================
// Exports
// =============================================================================

export default RoleSelector;
