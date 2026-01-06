/**
 * CollaboratorPresence Component
 *
 * Displays a list of active collaborators in a gallery editing session.
 * Shows avatars, names, and activity status.
 */

import React from 'react';
import type { CollaboratorPresence as CollaboratorPresenceType } from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CollaboratorPresenceProps {
  /** List of collaborators */
  collaborators: CollaboratorPresenceType[];
  /** Current user's ID (to exclude from display) */
  currentUserId?: string;
  /** Maximum number of avatars to show before "+N" */
  maxVisible?: number;
  /** Compact mode (avatars only) */
  compact?: boolean;
  /** Show status indicators */
  showStatus?: boolean;
  /** Class name for container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

interface AvatarProps {
  name: string;
  color: string;
  status: string;
  showStatus?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const Avatar: React.FC<AvatarProps> = ({
  name,
  color,
  status,
  showStatus = true,
  size = 'md',
}) => {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };

  const statusColors = {
    active: 'bg-green-500',
    idle: 'bg-yellow-500',
    disconnected: 'bg-gray-400',
  };

  return (
    <div className="relative inline-block">
      <div
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-medium text-white ring-2 ring-white dark:ring-gray-800`}
        style={{ backgroundColor: color }}
        title={name}
      >
        {initials}
      </div>
      {showStatus && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-gray-800 ${
            statusColors[status as keyof typeof statusColors] || statusColors.disconnected
          }`}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const CollaboratorPresence: React.FC<CollaboratorPresenceProps> = ({
  collaborators,
  currentUserId,
  maxVisible = 5,
  compact = false,
  showStatus = true,
  className = '',
}) => {
  // Filter out current user
  const otherCollaborators = currentUserId
    ? collaborators.filter((c) => c.user_id !== currentUserId)
    : collaborators;

  if (otherCollaborators.length === 0) {
    return null;
  }

  const visible = otherCollaborators.slice(0, maxVisible);
  const remaining = otherCollaborators.length - maxVisible;

  if (compact) {
    return (
      <div className={`flex items-center -space-x-2 ${className}`}>
        {visible.map((collaborator) => (
          <Avatar
            key={collaborator.user_id}
            name={collaborator.display_name}
            color={collaborator.color}
            status={collaborator.status}
            showStatus={showStatus}
            size="sm"
          />
        ))}
        {remaining > 0 && (
          <div
            className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300 ring-2 ring-white dark:ring-gray-800"
            title={`${remaining} more collaborators`}
          >
            +{remaining}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        Collaborators ({otherCollaborators.length})
      </div>
      <div className="flex flex-col gap-1">
        {visible.map((collaborator) => (
          <div
            key={collaborator.user_id}
            className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <Avatar
              name={collaborator.display_name}
              color={collaborator.color}
              status={collaborator.status}
              showStatus={showStatus}
              size="md"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {collaborator.display_name}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {collaborator.status === 'active' ? 'Editing now' : 'Away'}
              </div>
            </div>
            {collaborator.selected_assets.length > 0 && (
              <div
                className="px-1.5 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                title={`Selected ${collaborator.selected_assets.length} items`}
              >
                {collaborator.selected_assets.length}
              </div>
            )}
          </div>
        ))}
        {remaining > 0 && (
          <div className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
            +{remaining} more collaborators
          </div>
        )}
      </div>
    </div>
  );
};

export default CollaboratorPresence;
