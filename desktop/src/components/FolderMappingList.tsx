/**
 * FolderMappingList component for RawDrive Desktop Sync.
 * Feature: 029-pro-review-xmp-sync
 * Task: T071
 *
 * Display and manage folder-to-gallery mappings.
 */

import { useState, useEffect, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  tauriApi,
  type FolderMapping,
  type SyncDirection,
} from '../services/tauriApi';

interface FolderMappingListProps {
  onRefresh?: () => void;
}

export function FolderMappingList({ onRefresh }: FolderMappingListProps) {
  const [mappings, setMappings] = useState<FolderMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadMappings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await tauriApi.getMappings();
      setMappings(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mappings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

  const handleToggle = async (id: string) => {
    try {
      await tauriApi.toggleMapping(id);
      await loadMappings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle mapping');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this folder mapping?')) {
      return;
    }

    try {
      await tauriApi.deleteMapping(id);
      await loadMappings();
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete mapping');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getDirectionLabel = (direction: SyncDirection) => {
    switch (direction) {
      case 'local_to_cloud':
        return 'Upload Only';
      case 'cloud_to_local':
        return 'Download Only';
      case 'bidirectional':
        return 'Two-way Sync';
      default:
        return direction;
    }
  };

  const getDirectionIcon = (direction: SyncDirection) => {
    switch (direction) {
      case 'local_to_cloud':
        return '↑';
      case 'cloud_to_local':
        return '↓';
      case 'bidirectional':
        return '↕';
      default:
        return '?';
    }
  };

  if (loading && mappings.length === 0) {
    return (
      <div className="mapping-list loading">
        <div className="loading-spinner" />
        <p>Loading folder mappings...</p>
      </div>
    );
  }

  return (
    <div className="mapping-list">
      <div className="mapping-header">
        <h2>Folder Mappings</h2>
        <button
          className="btn-primary btn-sm"
          onClick={() => setShowAddModal(true)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4v16m-8-8h16" stroke="currentColor" strokeWidth="2" />
          </svg>
          Add Mapping
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z" />
          </svg>
          {error}
          <button className="btn-text" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {mappings.length === 0 ? (
        <div className="empty-state">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
          <h3>No Folder Mappings</h3>
          <p>
            Create your first folder mapping to start syncing photos between
            your local folders and RawDrive galleries.
          </p>
          <button
            className="btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            Create First Mapping
          </button>
        </div>
      ) : (
        <div className="mapping-grid">
          {mappings.map((mapping) => (
            <div
              key={mapping.id}
              className={`mapping-card ${mapping.enabled ? 'enabled' : 'disabled'}`}
            >
              <div className="mapping-status">
                <button
                  className={`toggle ${mapping.enabled ? 'on' : 'off'}`}
                  onClick={() => handleToggle(mapping.id)}
                  aria-label={mapping.enabled ? 'Disable sync' : 'Enable sync'}
                >
                  <span className="toggle-slider" />
                </button>
              </div>

              <div className="mapping-info">
                <div className="mapping-paths">
                  <div className="path local">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <span title={mapping.local_path}>{mapping.local_path}</span>
                  </div>

                  <div className="direction-indicator">
                    <span className="direction-icon">
                      {getDirectionIcon(mapping.direction as SyncDirection)}
                    </span>
                    <span className="direction-label">
                      {getDirectionLabel(mapping.direction as SyncDirection)}
                    </span>
                  </div>

                  <div className="path gallery">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span>{mapping.gallery_title}</span>
                  </div>
                </div>

                <div className="mapping-meta">
                  <span className="last-sync">
                    Last sync: {formatDate(mapping.last_sync_at)}
                  </span>
                </div>
              </div>

              <div className="mapping-actions">
                <button
                  className="btn-icon"
                  onClick={() => handleDelete(mapping.id)}
                  aria-label="Delete mapping"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddMappingModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            loadMappings();
            setShowAddModal(false);
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Add Mapping Modal
// =============================================================================

interface AddMappingModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function AddMappingModal({ onClose, onCreated }: AddMappingModalProps) {
  const [localPath, setLocalPath] = useState('');
  const [galleryId, setGalleryId] = useState('');
  const [galleryTitle, setGalleryTitle] = useState('');
  const [direction, setDirection] = useState<SyncDirection>('bidirectional');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Folder to Sync',
      });

      if (selected && typeof selected === 'string') {
        setLocalPath(selected);
      }
    } catch (err) {
      setError('Failed to open folder picker');
    }
  };

  const handleCreate = async () => {
    if (!localPath || !galleryId || !galleryTitle) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await tauriApi.createMapping({
        local_path: localPath,
        gallery_id: galleryId,
        gallery_title: galleryTitle,
        direction,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create mapping');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Folder Mapping</h3>
          <button className="btn-icon" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Local Folder</label>
            <div className="input-with-button">
              <input
                type="text"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder="/path/to/folder"
                readOnly
              />
              <button className="btn-secondary" onClick={handleSelectFolder}>
                Browse...
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Gallery ID</label>
            <input
              type="text"
              value={galleryId}
              onChange={(e) => setGalleryId(e.target.value)}
              placeholder="Enter gallery ID"
            />
            <p className="form-hint">
              You can find this in the gallery URL or settings
            </p>
          </div>

          <div className="form-group">
            <label>Gallery Title</label>
            <input
              type="text"
              value={galleryTitle}
              onChange={(e) => setGalleryTitle(e.target.value)}
              placeholder="My Gallery"
            />
          </div>

          <div className="form-group">
            <label>Sync Direction</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as SyncDirection)}
            >
              <option value="bidirectional">Two-way Sync (↕)</option>
              <option value="local_to_cloud">Upload Only (↑)</option>
              <option value="cloud_to_local">Download Only (↓)</option>
            </select>
            <p className="form-hint">
              {direction === 'bidirectional' &&
                'Changes sync both ways between folder and gallery'}
              {direction === 'local_to_cloud' &&
                'Only upload new files from folder to gallery'}
              {direction === 'cloud_to_local' &&
                'Only download new files from gallery to folder'}
            </p>
          </div>

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleCreate}
            disabled={loading || !localPath || !galleryId || !galleryTitle}
          >
            {loading ? 'Creating...' : 'Create Mapping'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default FolderMappingList;
