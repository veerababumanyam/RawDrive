/**
 * useAlbumVersionHistory Hook
 *
 * Manages album version history with snapshot creation and rollback capabilities.
 * Listens to WebSocket events for real-time version updates.
 */

import { useCallback, useEffect, useState } from 'react';
import type { AlbumVersion, AlbumSnapshot } from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseAlbumVersionHistoryOptions {
  /** Album ID */
  albumId: string;
  /** Workspace ID */
  workspaceId: string;
  /** Auto-fetch versions on mount */
  autoFetch?: boolean;
}

interface UseAlbumVersionHistoryReturn {
  /** All versions */
  versions: AlbumVersion[];
  /** Whether versions are loading */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Refresh versions from API */
  refreshVersions: () => Promise<void>;
  /** Create a named snapshot */
  createSnapshot: (name: string, description?: string) => Promise<AlbumVersion | null>;
  /** Rollback to a specific version */
  rollbackToVersion: (versionId: string) => Promise<boolean>;
  /** Get version by ID */
  getVersion: (versionId: string) => AlbumVersion | undefined;
  /** Preview a version (returns snapshot data) */
  previewVersion: (versionId: string) => Promise<AlbumSnapshot | null>;
  /** Compare two versions */
  compareVersions: (
    versionId1: string,
    versionId2: string
  ) => Promise<{ added: string[]; removed: string[]; modified: string[] } | null>;
  /** Current version (most recent) */
  currentVersion: AlbumVersion | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAlbumVersionHistory({
  albumId,
  workspaceId,
  autoFetch = true,
}: UseAlbumVersionHistoryOptions): UseAlbumVersionHistoryReturn {
  const [versions, setVersions] = useState<AlbumVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch versions from API
  const fetchVersions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/albums/${albumId}/versions`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch versions');
      }

      const data = await response.json();
      // Sort by version number descending (most recent first)
      const sortedVersions = (data.versions || []).sort(
        (a: AlbumVersion, b: AlbumVersion) => b.version_number - a.version_number
      );
      setVersions(sortedVersions);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch versions';
      setError(message);
      console.error('Error fetching album versions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [albumId, workspaceId]);

  // Create a named snapshot
  const createSnapshot = useCallback(
    async (name: string, description?: string): Promise<AlbumVersion | null> => {
      try {
        const response = await fetch(
          `/api/v1/workspaces/${workspaceId}/albums/${albumId}/versions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name,
              description,
              is_named_snapshot: true,
            }),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to create snapshot');
        }

        const newVersion = await response.json();
        setVersions((prev) => [newVersion, ...prev]);
        return newVersion;
      } catch (err) {
        console.error('Error creating snapshot:', err);
        return null;
      }
    },
    [albumId, workspaceId]
  );

  // Rollback to a specific version
  const rollbackToVersion = useCallback(
    async (versionId: string): Promise<boolean> => {
      try {
        const response = await fetch(
          `/api/v1/workspaces/${workspaceId}/albums/${albumId}/versions/${versionId}/rollback`,
          {
            method: 'POST',
          }
        );

        if (!response.ok) {
          throw new Error('Failed to rollback to version');
        }

        // Refresh versions after rollback
        await fetchVersions();
        return true;
      } catch (err) {
        console.error('Error rolling back to version:', err);
        return false;
      }
    },
    [albumId, workspaceId, fetchVersions]
  );

  // Get version by ID
  const getVersion = useCallback(
    (versionId: string): AlbumVersion | undefined => {
      return versions.find((v) => v.id === versionId);
    },
    [versions]
  );

  // Preview a version
  const previewVersion = useCallback(
    async (versionId: string): Promise<AlbumSnapshot | null> => {
      try {
        const response = await fetch(
          `/api/v1/workspaces/${workspaceId}/albums/${albumId}/versions/${versionId}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch version snapshot');
        }

        const data = await response.json();
        return data.snapshot || null;
      } catch (err) {
        console.error('Error previewing version:', err);
        return null;
      }
    },
    [albumId, workspaceId]
  );

  // Compare two versions
  const compareVersions = useCallback(
    async (
      versionId1: string,
      versionId2: string
    ): Promise<{ added: string[]; removed: string[]; modified: string[] } | null> => {
      try {
        const response = await fetch(
          `/api/v1/workspaces/${workspaceId}/albums/${albumId}/versions/compare?` +
            `version1=${versionId1}&version2=${versionId2}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to compare versions');
        }

        return await response.json();
      } catch (err) {
        console.error('Error comparing versions:', err);
        return null;
      }
    },
    [albumId, workspaceId]
  );

  // Get current version (most recent)
  const currentVersion = versions.length > 0 ? versions[0] : null;

  // Listen for WebSocket version events
  useEffect(() => {
    const handleVersionEvent = (event: CustomEvent) => {
      const { type, version } = event.detail;

      switch (type) {
        case 'album:version_created':
          setVersions((prev) => {
            // Avoid duplicates
            if (prev.some((v) => v.id === version.id)) return prev;
            return [version, ...prev];
          });
          break;

        case 'album:version_restored':
          // Refresh the full list after a rollback
          fetchVersions();
          break;
      }
    };

    window.addEventListener('album:version', handleVersionEvent as EventListener);
    return () => {
      window.removeEventListener('album:version', handleVersionEvent as EventListener);
    };
  }, [fetchVersions]);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchVersions();
    }
  }, [autoFetch, fetchVersions]);

  return {
    versions,
    isLoading,
    error,
    refreshVersions: fetchVersions,
    createSnapshot,
    rollbackToVersion,
    getVersion,
    previewVersion,
    compareVersions,
    currentVersion,
  };
}

export default useAlbumVersionHistory;
