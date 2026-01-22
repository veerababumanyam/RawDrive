/**
 * CollaboratorPresence - Display active collaborators
 *
 * Shows avatar circles for each active collaborator with native HTML tooltips
 * displaying their name and activity status.
 */

import React from 'react';

export interface Collaborator {
  userId: string;
  displayName: string;
  color: string;
}

interface CollaboratorPresenceProps {
  collaborators: Collaborator[];
  maxVisible?: number;
  className?: string;
}

/**
 * Generates initials from a name
 */
const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

/**
 * Component to display a single collaborator avatar
 */
const CollaboratorAvatar: React.FC<{ collaborator: Collaborator }> = ({ collaborator }) => {
  const initials = getInitials(collaborator.displayName);

  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white transition-transform hover:scale-110 cursor-pointer"
      style={{ backgroundColor: collaborator.color }}
      title={collaborator.displayName}
    >
      {initials}
    </div>
  );
};

/**
 * Display collaborator presence with overflow indicator
 */
export const CollaboratorPresence: React.FC<CollaboratorPresenceProps> = ({
  collaborators,
  maxVisible = 4,
  className = '',
}) => {
  if (collaborators.length === 0) {
    return null;
  }

  const visible = collaborators.slice(0, maxVisible);
  const overflow = collaborators.length - maxVisible;
  const overflowNames = collaborators
    .slice(maxVisible)
    .map((c) => c.displayName)
    .join(', ');

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex gap-1">
        {visible.map((collaborator) => (
          <CollaboratorAvatar key={collaborator.userId} collaborator={collaborator} />
        ))}

        {overflow > 0 && (
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-400 transition-colors cursor-pointer"
            title={overflowNames}
          >
            +{overflow}
          </div>
        )}
      </div>

      {collaborators.length > 0 && (
        <span className="text-xs font-medium text-gray-600">
          {collaborators.length} {collaborators.length === 1 ? 'editor' : 'editors'}
        </span>
      )}
    </div>
  );
};
