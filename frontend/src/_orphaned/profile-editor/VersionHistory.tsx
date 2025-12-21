/**
 * Version History Component
 *
 * Displays profile version history with restore functionality.
 * Shows snapshots with timestamps, labels, and change summaries.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  RotateCcw,
  Clock,
  User,
  ChevronDown,
  ChevronRight,
  Check,
  AlertTriangle,
  Camera,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { profileEditorService } from '@/services/profileEditorService';
import type { ProfileVersion } from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

interface VersionHistoryProps {
  workspaceId: string;
  onRestore: (versionId: string) => Promise<void>;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format relative time
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Format full date
 */
function formatFullDate(dateString: string): string {
  return new Date(dateString).toLocaleString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get change summary from version
 */
function getChangeSummary(version: ProfileVersion): string {
  const changes: string[] = [];

  if (version.profile_snapshot && Object.keys(version.profile_snapshot).length > 0) {
    changes.push('Profile data');
  }
  if (version.visibility_snapshot && Object.keys(version.visibility_snapshot).length > 0) {
    changes.push('Visibility');
  }
  if (version.theme_snapshot && Object.keys(version.theme_snapshot).length > 0) {
    changes.push('Theme');
  }

  return changes.length > 0 ? changes.join(', ') : 'No changes recorded';
}

// =============================================================================
// Component
// =============================================================================

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  workspaceId,
  onRestore,
}) => {
  // State
  const [versions, setVersions] = useState<ProfileVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  // Fetch versions
  useEffect(() => {
    const fetchVersions = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await profileEditorService.getVersions(workspaceId);
        setVersions(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load version history');
      } finally {
        setIsLoading(false);
      }
    };

    fetchVersions();
  }, [workspaceId]);

  // Handle restore
  const handleRestore = useCallback(
    async (versionId: string) => {
      setRestoringVersionId(versionId);
      try {
        await onRestore(versionId);
        setConfirmRestoreId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to restore version');
      } finally {
        setRestoringVersionId(null);
      }
    },
    [onRestore]
  );

  // Create manual snapshot
  const handleCreateSnapshot = useCallback(async () => {
    try {
      const snapshot = await profileEditorService.createSnapshot(workspaceId, 'Manual snapshot');
      setVersions((prev) => [snapshot, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create snapshot');
    }
  }, [workspaceId]);

  // Toggle version expansion
  const toggleExpanded = useCallback((versionId: string) => {
    setExpandedVersionId((prev) => (prev === versionId ? null : versionId));
  }, []);

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 bg-surface-hover rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-error text-sm mb-2">{error}</p>
        <AppButton variant="outline" size="sm" onClick={() => window.location.reload()}>
          Retry
        </AppButton>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Create Snapshot Button */}
      <AppButton
        variant="outline"
        size="sm"
        onClick={handleCreateSnapshot}
        className="w-full"
      >
        <Camera className="w-4 h-4 mr-2" />
        Create Snapshot
      </AppButton>

      {/* Version List */}
      {versions.length === 0 ? (
        <div className="text-center py-8">
          <History className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
          <p className="text-text-secondary text-sm">No version history yet</p>
          <p className="text-text-tertiary text-xs mt-1">
            Snapshots are created automatically when you publish changes
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {versions.map((version, index) => (
            <VersionCard
              key={version.version_id}
              version={version}
              isLatest={index === 0}
              isExpanded={expandedVersionId === version.version_id}
              isRestoring={restoringVersionId === version.version_id}
              showConfirmRestore={confirmRestoreId === version.version_id}
              onToggleExpand={() => toggleExpanded(version.version_id)}
              onRestore={() => handleRestore(version.version_id)}
              onConfirmRestore={() => setConfirmRestoreId(version.version_id)}
              onCancelRestore={() => setConfirmRestoreId(null)}
            />
          ))}
        </div>
      )}

      {/* Info */}
      <p className="text-xs text-text-tertiary text-center">
        Showing last {versions.length} versions
      </p>
    </div>
  );
};

// =============================================================================
// Version Card Component
// =============================================================================

interface VersionCardProps {
  version: ProfileVersion;
  isLatest: boolean;
  isExpanded: boolean;
  isRestoring: boolean;
  showConfirmRestore: boolean;
  onToggleExpand: () => void;
  onRestore: () => void;
  onConfirmRestore: () => void;
  onCancelRestore: () => void;
}

const VersionCard: React.FC<VersionCardProps> = ({
  version,
  isLatest,
  isExpanded,
  isRestoring,
  showConfirmRestore,
  onToggleExpand,
  onRestore,
  onConfirmRestore,
  onCancelRestore,
}) => {
  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${
        isLatest ? 'border-accent bg-accent/5' : 'border-border'
      }`}
    >
      {/* Header */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between p-3 hover:bg-surface-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              version.is_auto_snapshot
                ? 'bg-surface-hover'
                : 'bg-accent/10'
            }`}
          >
            {version.is_auto_snapshot ? (
              <Clock className="w-4 h-4 text-text-tertiary" />
            ) : (
              <Camera className="w-4 h-4 text-accent" />
            )}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-primary">
                {version.label || `Version ${version.version_number}`}
              </span>
              {isLatest && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-accent text-white rounded">
                  Current
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-text-tertiary">
              <span title={formatFullDate(version.created_at)}>
                {formatRelativeTime(version.created_at)}
              </span>
              <span className="text-text-tertiary">·</span>
              <span>{version.is_auto_snapshot ? 'Auto' : 'Manual'}</span>
            </div>
          </div>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-text-tertiary" />
        ) : (
          <ChevronRight className="w-4 h-4 text-text-tertiary" />
        )}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border p-3 space-y-3">
          {/* Change Summary */}
          <div>
            <p className="text-xs font-medium text-text-secondary mb-1">Changes</p>
            <p className="text-sm text-text-primary">{getChangeSummary(version)}</p>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-text-tertiary">Created:</span>
              <span className="ml-1 text-text-secondary">
                {formatFullDate(version.created_at)}
              </span>
            </div>
            {version.created_by && (
              <div className="flex items-center gap-1">
                <User className="w-3 h-3 text-text-tertiary" />
                <span className="text-text-secondary">{version.created_by}</span>
              </div>
            )}
          </div>

          {/* Restore Actions */}
          {!isLatest && (
            <div className="pt-2 border-t border-border">
              {showConfirmRestore ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 p-2 bg-warning/10 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        Restore this version?
                      </p>
                      <p className="text-xs text-text-secondary">
                        A snapshot of your current state will be saved first.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <AppButton
                      variant="primary"
                      size="sm"
                      onClick={onRestore}
                      disabled={isRestoring}
                      className="flex-1"
                    >
                      {isRestoring ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          Confirm
                        </>
                      )}
                    </AppButton>
                    <AppButton
                      variant="ghost"
                      size="sm"
                      onClick={onCancelRestore}
                      disabled={isRestoring}
                    >
                      Cancel
                    </AppButton>
                  </div>
                </div>
              ) : (
                <AppButton
                  variant="outline"
                  size="sm"
                  onClick={onConfirmRestore}
                  className="w-full"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Restore this version
                </AppButton>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VersionHistory;
