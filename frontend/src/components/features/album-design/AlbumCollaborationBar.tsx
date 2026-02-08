/**
 * AlbumCollaborationBar Component
 *
 * Displays collaboration status, active collaborators, and controls for album editing.
 */

import React, { useState } from 'react';
import type { AlbumCollaboratorPresence } from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlbumCollaborationBarProps {
  /** Connection status */
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  /** List of active collaborators */
  collaborators: AlbumCollaboratorPresence[];
  /** Current user ID */
  currentUserId: string;
  /** Current user's assigned color */
  myColor: string;
  /** Callback to stop collaboration */
  onStopCollaboration: () => void;
}

// ---------------------------------------------------------------------------
// Status Indicator Component
// ---------------------------------------------------------------------------

interface StatusIndicatorProps {
  status: 'disconnected' | 'connecting' | 'connected';
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
  const config = {
    disconnected: {
      color: 'bg-gray-400',
      text: 'Offline',
      pulse: false,
    },
    connecting: {
      color: 'bg-yellow-400',
      text: 'Connecting...',
      pulse: true,
    },
    connected: {
      color: 'bg-green-500',
      text: 'Live',
      pulse: true,
    },
  };

  const { color, text, pulse } = config[status];

  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        {pulse && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-75`}
          />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
      </span>
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{text}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Collaborator Avatar Component
// ---------------------------------------------------------------------------

interface CollaboratorAvatarProps {
  collaborator: AlbumCollaboratorPresence;
  size?: 'sm' | 'md';
}

const CollaboratorAvatar: React.FC<CollaboratorAvatarProps> = ({
  collaborator,
  size = 'sm',
}) => {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
  };

  const statusColors = {
    active: 'ring-green-500',
    idle: 'ring-yellow-500',
    away: 'ring-gray-400',
  };

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center text-white font-medium ring-2 ${statusColors[collaborator.status]}`}
      style={{ backgroundColor: collaborator.color }}
      title={`${collaborator.display_name} (${collaborator.status})`}
    >
      {collaborator.avatar_url ? (
        <img
          src={collaborator.avatar_url}
          alt={collaborator.display_name}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        collaborator.display_name.charAt(0).toUpperCase()
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const AlbumCollaborationBar: React.FC<AlbumCollaborationBarProps> = ({
  connectionStatus,
  collaborators,
  currentUserId,
  myColor,
  onStopCollaboration,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const otherCollaborators = collaborators.filter((c) => c.user_id !== currentUserId);
  const activeCount = otherCollaborators.filter((c) => c.status === 'active').length;

  return (
    <div className="relative bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-900/30">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Left: Status and collaborators */}
        <div className="flex items-center gap-4">
          <StatusIndicator status={connectionStatus} />

          {/* My Color */}
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full ring-2 ring-white dark:ring-gray-800"
              style={{ backgroundColor: myColor }}
              title="Your color"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">You</span>
          </div>

          {/* Collaborator Avatars */}
          {otherCollaborators.length > 0 && (
            <button
              className="flex items-center gap-2"
              onClick={() => setShowDetails(!showDetails)}
            >
              <div className="flex -space-x-1.5">
                {otherCollaborators.slice(0, 5).map((collaborator) => (
                  <CollaboratorAvatar key={collaborator.user_id} collaborator={collaborator} />
                ))}
                {otherCollaborators.length > 5 && (
                  <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs font-medium text-gray-700 dark:text-gray-300 ring-2 ring-white dark:ring-gray-800">
                    +{otherCollaborators.length - 5}
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {activeCount} {activeCount === 1 ? 'editor' : 'editors'} online
              </span>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${
                  showDetails ? 'rotate-180' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Right: Leave button */}
        <button
          onClick={onStopCollaboration}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          Leave
        </button>
      </div>

      {/* Expanded Details */}
      {showDetails && otherCollaborators.length > 0 && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDetails(false)}
          />

          {/* Dropdown */}
          <div className="absolute left-4 top-full mt-1 w-64 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Collaborators
              </h3>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {otherCollaborators.map((collaborator) => (
                <div
                  key={collaborator.user_id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <CollaboratorAvatar collaborator={collaborator} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {collaborator.display_name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                      {collaborator.status}
                      {collaborator.current_spread_id && ' • Editing spread'}
                    </p>
                  </div>
                  {collaborator.selected_elements.length > 0 && (
                    <span className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                      {collaborator.selected_elements.length} selected
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AlbumCollaborationBar;
