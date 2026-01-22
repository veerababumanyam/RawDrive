/**
 * Sync Status Component for RawDrive Desktop.
 * Feature: 029-pro-review-xmp-sync
 * Task: T083
 *
 * Displays current sync status with progress and controls.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  startSync,
  stopSync,
  pauseSync,
  resumeSync,
  getSyncStatus,
  retryFailed,
  clearCompleted,
  checkNetwork,
  scanMapping,
  type SyncStatus as SyncStatusType,
  type MappingSyncStatus,
  type NetworkStatus,
} from '../services/tauriApi';

// =============================================================================
// Sub-components
// =============================================================================

interface ProgressBarProps {
  progress: number;
  className?: string;
}

function ProgressBar({ progress, className = '' }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, progress * 100));

  return (
    <div className={`progress-bar-container ${className}`}>
      <div className="progress-bar-track">
        <div
          className="progress-bar-fill"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="progress-bar-label">{percent.toFixed(1)}%</span>
    </div>
  );
}

interface NetworkStatusBadgeProps {
  status: NetworkStatus;
}

function NetworkStatusBadge({ status }: NetworkStatusBadgeProps) {
  const statusConfig: Record<NetworkStatus, { label: string; className: string }> = {
    Connected: { label: 'Connected', className: 'status-connected' },
    Disconnected: { label: 'Offline', className: 'status-disconnected' },
    Reconnecting: { label: 'Reconnecting...', className: 'status-reconnecting' },
  };

  const config = statusConfig[status];

  return (
    <span className={`network-badge ${config.className}`}>
      <span className="network-indicator" />
      {config.label}
    </span>
  );
}

interface MappingStatusCardProps {
  mapping: MappingSyncStatus;
  onScan: (mappingId: string) => void;
}

function MappingStatusCard({ mapping, onScan }: MappingStatusCardProps) {
  return (
    <div className="mapping-status-card">
      <div className="mapping-header">
        <h4>{mapping.gallery_title}</h4>
        <span className={`mapping-status ${mapping.is_syncing ? 'active' : 'inactive'}`}>
          {mapping.is_paused ? 'Paused' : mapping.is_syncing ? 'Syncing' : 'Idle'}
        </span>
      </div>

      <div className="mapping-path">{mapping.local_path}</div>

      <div className="mapping-stats">
        <div className="stat">
          <span className="stat-value">{mapping.files_pending}</span>
          <span className="stat-label">Pending</span>
        </div>
        <div className="stat">
          <span className="stat-value">{mapping.files_uploading}</span>
          <span className="stat-label">Uploading</span>
        </div>
        <div className="stat">
          <span className="stat-value">{mapping.files_completed}</span>
          <span className="stat-label">Complete</span>
        </div>
        <div className="stat stat-failed">
          <span className="stat-value">{mapping.files_failed}</span>
          <span className="stat-label">Failed</span>
        </div>
      </div>

      {mapping.is_syncing && mapping.progress_percent > 0 && (
        <ProgressBar progress={mapping.progress_percent / 100} />
      )}

      {mapping.current_file && (
        <div className="current-file">
          <span className="current-file-label">Current:</span>
          <span className="current-file-name">{mapping.current_file}</span>
        </div>
      )}

      {mapping.last_error && (
        <div className="mapping-error">
          <span className="error-icon">!</span>
          {mapping.last_error}
        </div>
      )}

      <div className="mapping-actions">
        <button
          className="btn-secondary"
          onClick={() => onScan(mapping.mapping_id)}
          disabled={mapping.is_syncing}
        >
          Scan Folder
        </button>
        {mapping.last_sync && (
          <span className="last-sync">
            Last sync: {new Date(mapping.last_sync).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

interface SyncStatusProps {
  className?: string;
}

export function SyncStatus({ className = '' }: SyncStatusProps) {
  const [status, setStatus] = useState<SyncStatusType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Fetch sync status
  const fetchStatus = useCallback(async () => {
    try {
      const newStatus = await getSyncStatus();
      setStatus(newStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get sync status');
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll for status updates
  useEffect(() => {
    fetchStatus();

    const interval = setInterval(() => {
      if (!actionInProgress) {
        fetchStatus();
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [fetchStatus, actionInProgress]);

  // Action handlers
  const handleStartSync = async () => {
    setActionInProgress(true);
    try {
      await startSync();
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start sync');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleStopSync = async () => {
    setActionInProgress(true);
    try {
      await stopSync();
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop sync');
    } finally {
      setActionInProgress(false);
    }
  };

  const handlePauseSync = async () => {
    setActionInProgress(true);
    try {
      await pauseSync();
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause sync');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleResumeSync = async () => {
    setActionInProgress(true);
    try {
      await resumeSync();
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume sync');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleRetryFailed = async () => {
    setActionInProgress(true);
    try {
      await retryFailed();
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry items');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleClearCompleted = async () => {
    setActionInProgress(true);
    try {
      await clearCompleted();
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear completed');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleCheckNetwork = async () => {
    setActionInProgress(true);
    try {
      await checkNetwork();
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check network');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleScanMapping = async (mappingId: string) => {
    setActionInProgress(true);
    try {
      const count = await scanMapping(mappingId);
      setError(null);
      // Show success message briefly
      setError(`Found ${count} files to sync`);
      setTimeout(() => setError(null), 3000);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan folder');
    } finally {
      setActionInProgress(false);
    }
  };

  // Format bytes for display
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className={`sync-status ${className}`}>
        <div className="sync-loading">Loading sync status...</div>
      </div>
    );
  }

  return (
    <div className={`sync-status ${className}`}>
      {/* Header */}
      <div className="sync-header">
        <h2>Sync Status</h2>
        {status && (
          <NetworkStatusBadge status={status.network_status} />
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className={`sync-message ${error.startsWith('Found') ? 'success' : 'error'}`}>
          {error}
          <button
            className="dismiss-btn"
            onClick={() => setError(null)}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {/* Overall status */}
      {status && (
        <>
          <div className="sync-overview">
            <div className="sync-state">
              <span className={`state-indicator ${status.is_running ? 'running' : 'stopped'} ${status.is_paused ? 'paused' : ''}`}>
                {status.is_paused ? 'Paused' : status.is_running ? 'Running' : 'Stopped'}
              </span>
            </div>

            <div className="sync-stats-grid">
              <div className="stat-box">
                <div className="stat-value">{status.total_pending}</div>
                <div className="stat-label">Pending</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{status.total_uploading}</div>
                <div className="stat-label">Uploading</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{status.total_completed}</div>
                <div className="stat-label">Completed</div>
              </div>
              <div className="stat-box stat-failed">
                <div className="stat-value">{status.total_failed}</div>
                <div className="stat-label">Failed</div>
              </div>
            </div>

            {/* Overall progress */}
            {status.is_running && status.total_bytes > 0 && (
              <div className="overall-progress">
                <ProgressBar progress={status.overall_progress} />
                <div className="progress-details">
                  {formatBytes(status.bytes_transferred)} / {formatBytes(status.total_bytes)}
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="sync-controls">
              {!status.is_running ? (
                <button
                  className="btn-primary"
                  onClick={handleStartSync}
                  disabled={actionInProgress}
                >
                  Start Sync
                </button>
              ) : (
                <>
                  <button
                    className="btn-danger"
                    onClick={handleStopSync}
                    disabled={actionInProgress}
                  >
                    Stop
                  </button>
                  {status.is_paused ? (
                    <button
                      className="btn-primary"
                      onClick={handleResumeSync}
                      disabled={actionInProgress}
                    >
                      Resume
                    </button>
                  ) : (
                    <button
                      className="btn-secondary"
                      onClick={handlePauseSync}
                      disabled={actionInProgress}
                    >
                      Pause
                    </button>
                  )}
                </>
              )}

              {status.total_failed > 0 && (
                <button
                  className="btn-secondary"
                  onClick={handleRetryFailed}
                  disabled={actionInProgress}
                >
                  Retry Failed ({status.total_failed})
                </button>
              )}

              {status.total_completed > 0 && (
                <button
                  className="btn-ghost"
                  onClick={handleClearCompleted}
                  disabled={actionInProgress}
                >
                  Clear Completed
                </button>
              )}

              <button
                className="btn-ghost"
                onClick={handleCheckNetwork}
                disabled={actionInProgress}
                title="Check network connection"
              >
                Check Network
              </button>
            </div>
          </div>

          {/* Per-mapping status */}
          {status.mappings.length > 0 && (
            <div className="mapping-statuses">
              <h3>Folder Mappings</h3>
              {status.mappings.map((mapping) => (
                <MappingStatusCard
                  key={mapping.mapping_id}
                  mapping={mapping}
                  onScan={handleScanMapping}
                />
              ))}
            </div>
          )}

          {status.mappings.length === 0 && !status.is_running && (
            <div className="no-mappings">
              <p>No folder mappings configured.</p>
              <p>Add a folder mapping to start syncing files.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default SyncStatus;
