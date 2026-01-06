/**
 * ConflictResolver Component
 *
 * Displays and handles resolution of edit conflicts during
 * collaborative gallery editing.
 */

import React, { useState } from 'react';
import type { EditConflict, ConflictResolutionOption } from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConflictResolverProps {
  /** The conflict to resolve */
  conflict: EditConflict;
  /** Callback when conflict is resolved */
  onResolve: (conflictId: string, optionId: string) => void;
  /** Callback when user dismisses without resolving */
  onDismiss?: (conflictId: string) => void;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

const getConflictIcon = (conflictType: string): string => {
  switch (conflictType) {
    case 'concurrent_edit':
      return '⚡';
    case 'stale_version':
      return '🔄';
    case 'lock_violation':
      return '🔒';
    default:
      return '⚠️';
  }
};

const getConflictTitle = (conflictType: string): string => {
  switch (conflictType) {
    case 'concurrent_edit':
      return 'Concurrent Edit Detected';
    case 'stale_version':
      return 'Changes Made While You Were Away';
    case 'lock_violation':
      return 'Resource Locked by Another User';
    default:
      return 'Edit Conflict';
  }
};

const getConflictDescription = (conflictType: string): string => {
  switch (conflictType) {
    case 'concurrent_edit':
      return 'Another collaborator made changes to the same items at the same time.';
    case 'stale_version':
      return 'The gallery has been updated since you loaded it. Some of your changes may conflict.';
    case 'lock_violation':
      return 'Another user has locked this resource for editing.';
    default:
      return 'There was a conflict with your changes.';
  }
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const ConflictResolver: React.FC<ConflictResolverProps> = ({
  conflict,
  onResolve,
  onDismiss,
}) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const handleResolve = async () => {
    if (!selectedOption) return;

    setIsResolving(true);
    try {
      await onResolve(conflict.conflict_id, selectedOption);
    } finally {
      setIsResolving(false);
    }
  };

  const resolutionOptions = conflict.resolution_options || [
    {
      option_id: 'keep_mine',
      description: 'Keep my changes and discard theirs',
    },
    {
      option_id: 'keep_theirs',
      description: 'Keep their changes and discard mine',
      recommended: true,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-3">
            <span className="text-2xl" role="img" aria-label="conflict">
              {getConflictIcon(conflict.conflict_type)}
            </span>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {getConflictTitle(conflict.conflict_type)}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {getConflictDescription(conflict.conflict_type)}
              </p>
            </div>
          </div>
        </div>

        {/* Conflict Details */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                Resource:
              </span>{' '}
              {conflict.resource_type} ({conflict.resource_id.slice(0, 8)}...)
            </p>
            <p className="mt-1">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                Detected:
              </span>{' '}
              {new Date(conflict.detected_at).toLocaleTimeString()}
            </p>
          </div>
        </div>

        {/* Resolution Options */}
        <div className="px-6 py-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            How would you like to resolve this conflict?
          </p>
          <div className="space-y-2">
            {resolutionOptions.map((option) => (
              <label
                key={option.option_id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedOption === option.option_id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="resolution"
                  value={option.option_id}
                  checked={selectedOption === option.option_id}
                  onChange={(e) => setSelectedOption(e.target.value)}
                  className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {option.description}
                  </p>
                  {option.recommended && (
                    <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 rounded">
                      Recommended
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-end gap-3">
          {onDismiss && (
            <button
              onClick={() => onDismiss(conflict.conflict_id)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              Dismiss
            </button>
          )}
          <button
            onClick={handleResolve}
            disabled={!selectedOption || isResolving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {isResolving ? 'Resolving...' : 'Resolve Conflict'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Conflict List Component
// ---------------------------------------------------------------------------

interface ConflictListProps {
  /** List of unresolved conflicts */
  conflicts: EditConflict[];
  /** Callback when a conflict is selected */
  onSelectConflict: (conflictId: string) => void;
}

export const ConflictList: React.FC<ConflictListProps> = ({
  conflicts,
  onSelectConflict,
}) => {
  if (conflicts.length === 0) {
    return null;
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 mb-2">
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="font-medium">
          {conflicts.length} unresolved conflict{conflicts.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="space-y-1">
        {conflicts.map((conflict) => (
          <button
            key={conflict.conflict_id}
            onClick={() => onSelectConflict(conflict.conflict_id)}
            className="w-full text-left px-3 py-2 text-sm text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded transition-colors"
          >
            {getConflictIcon(conflict.conflict_type)}{' '}
            {conflict.resource_type} conflict
          </button>
        ))}
      </div>
    </div>
  );
};

export default ConflictResolver;
