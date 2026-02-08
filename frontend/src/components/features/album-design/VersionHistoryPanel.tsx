/**
 * VersionHistoryPanel Component
 *
 * Displays version history for an album with rollback capability.
 */

import React, { useState } from 'react';
import type { AlbumVersion } from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VersionHistoryPanelProps {
  /** Version history list */
  versions: AlbumVersion[];
  /** Current version number */
  currentVersion: number;
  /** Whether versions are loading */
  isLoading: boolean;
  /** Callback to rollback to a version */
  onRollback: (versionId: string) => void;
  /** Callback to create a new version snapshot */
  onCreateSnapshot: (name?: string) => void;
  /** Callback to close the panel */
  onClose: () => void;
  /** Class name for container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Version Item Component
// ---------------------------------------------------------------------------

interface VersionItemProps {
  version: AlbumVersion;
  isCurrent: boolean;
  onRollback: () => void;
  onPreview: () => void;
}

const VersionItem: React.FC<VersionItemProps> = ({
  version,
  isCurrent,
  onRollback,
  onPreview,
}) => {
  const [showActions, setShowActions] = useState(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div
      className={`relative p-3 rounded-lg border transition-all ${
        isCurrent
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Version Info */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              v{version.version_number}
            </span>
            {isCurrent && (
              <span className="px-1.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 rounded">
                Current
              </span>
            )}
          </div>
          {version.name && (
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">
              {version.name}
            </p>
          )}
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatDate(version.created_at)}
        </span>
      </div>

      {/* Author */}
      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
        {version.created_by_name}
      </div>

      {/* Actions */}
      {showActions && !isCurrent && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onPreview}
            className="flex-1 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          >
            Preview
          </button>
          <button
            onClick={onRollback}
            className="flex-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
          >
            Restore
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
  versions,
  currentVersion,
  isLoading,
  onRollback,
  onCreateSnapshot,
  onClose,
  className = '',
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [previewVersion, setPreviewVersion] = useState<AlbumVersion | null>(null);

  const handleCreateSnapshot = () => {
    onCreateSnapshot(snapshotName || undefined);
    setSnapshotName('');
    setShowCreateModal(false);
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-900 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">
          Version History
        </h2>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Create Snapshot Button */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
            />
          </svg>
          Save Current Version
        </button>
      </div>

      {/* Version List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 dark:text-gray-600 mb-2">
              <svg
                className="w-12 h-12 mx-auto"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No versions saved yet
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Save a version to track your progress
            </p>
          </div>
        ) : (
          versions.map((version) => (
            <VersionItem
              key={version.id}
              version={version}
              isCurrent={version.version_number === currentVersion}
              onRollback={() => onRollback(version.id)}
              onPreview={() => setPreviewVersion(version)}
            />
          ))
        )}
      </div>

      {/* Create Snapshot Modal */}
      {showCreateModal && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Save Version
            </h3>
            <input
              type="text"
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              placeholder="Version name (optional)"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSnapshot}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}

      {/* Preview Modal */}
      {previewVersion && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setPreviewVersion(null)}
          />
          <div className="fixed inset-8 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                Preview: v{previewVersion.version_number}
                {previewVersion.name && ` - ${previewVersion.name}`}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onRollback(previewVersion.id);
                    setPreviewVersion(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Restore This Version
                </button>
                <button
                  onClick={() => setPreviewVersion(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-8 bg-gray-100 dark:bg-gray-950">
              {/* Preview content would render the snapshot here */}
              <div className="text-center text-gray-500 dark:text-gray-400">
                Preview rendering would go here
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default VersionHistoryPanel;
