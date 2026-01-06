/**
 * CollaborationToolbar Component
 *
 * A toolbar that displays collaboration status, collaborators,
 * and controls for collaborative gallery editing.
 */

import React, { useState } from 'react';
import type { CollaboratorPresence, EditConflict } from '@rawdrive/shared-types';
import { CollaboratorPresence as CollaboratorPresenceList } from './CollaboratorPresence';
import { ConflictList } from './ConflictResolver';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CollaborationToolbarProps {
  /** Whether collaborative mode is active */
  isCollaborative: boolean;
  /** Connection status */
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  /** List of collaborators */
  collaborators: CollaboratorPresence[];
  /** Current user's ID */
  currentUserId?: string;
  /** Current user's color */
  myColor: string;
  /** Unresolved conflicts */
  conflicts: EditConflict[];
  /** Callback to start collaboration */
  onStartCollaboration: () => void;
  /** Callback to stop collaboration */
  onStopCollaboration: () => void;
  /** Callback when conflict is selected */
  onSelectConflict: (conflictId: string) => void;
  /** Class name for container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Status Badge Component
// ---------------------------------------------------------------------------

interface StatusBadgeProps {
  status: 'disconnected' | 'connecting' | 'connected';
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const statusConfig = {
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

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.color} opacity-75`}
          />
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${config.color}`}
        />
      </span>
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
        {config.text}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const CollaborationToolbar: React.FC<CollaborationToolbarProps> = ({
  isCollaborative,
  connectionStatus,
  collaborators,
  currentUserId,
  myColor,
  conflicts,
  onStartCollaboration,
  onStopCollaboration,
  onSelectConflict,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const otherCollaborators = currentUserId
    ? collaborators.filter((c) => c.user_id !== currentUserId)
    : collaborators;

  if (!isCollaborative) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <button
          onClick={onStartCollaboration}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          Start Collaboration
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Collapsed View */}
      <div className="flex items-center gap-3">
        <StatusBadge status={connectionStatus} />

        {/* My Color Indicator */}
        <div
          className="w-4 h-4 rounded-full ring-2 ring-white dark:ring-gray-800"
          style={{ backgroundColor: myColor }}
          title="Your color"
        />

        {/* Collaborator Avatars */}
        {otherCollaborators.length > 0 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded-lg transition-colors"
          >
            <CollaboratorPresenceList
              collaborators={collaborators}
              currentUserId={currentUserId}
              maxVisible={3}
              compact
              showStatus={false}
            />
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${
                isExpanded ? 'rotate-180' : ''
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

        {/* Conflict Indicator */}
        {conflicts.length > 0 && (
          <button
            onClick={() => setIsExpanded(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 rounded-full hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            {conflicts.length}
          </button>
        )}

        {/* Stop Collaboration Button */}
        <button
          onClick={onStopCollaboration}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          title="Leave collaboration"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        </button>
      </div>

      {/* Expanded Dropdown */}
      {isExpanded && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsExpanded(false)}
          />

          {/* Dropdown Panel */}
          <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Collaboration
                </h3>
                <StatusBadge status={connectionStatus} />
              </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Collaborators */}
              {otherCollaborators.length > 0 ? (
                <CollaboratorPresenceList
                  collaborators={collaborators}
                  currentUserId={currentUserId}
                  maxVisible={10}
                  showStatus
                />
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                  No other collaborators yet
                </div>
              )}

              {/* Conflicts */}
              {conflicts.length > 0 && (
                <ConflictList
                  conflicts={conflicts}
                  onSelectConflict={(id) => {
                    onSelectConflict(id);
                    setIsExpanded(false);
                  }}
                />
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={onStopCollaboration}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Leave Collaboration
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CollaborationToolbar;
