/**
 * useDesignCollaboration - Gallery Design Studio Collaboration
 *
 * Manages collaborative design editing with:
 * - Real-time design config synchronization
 * - Design control locking (cover, typography, theme, grid)
 * - Active viewer tracking
 * - Design publish broadcasting
 *
 * Usage:
 * ```tsx
 * const { isCollaborating, lockedSections, viewerCount, lockSection, unlockSection, broadcastUpdate } = useDesignCollaboration({
 *   galleryId,
 *   enabled: true,
 * });
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GalleryDesignConfig } from '../types/gallery-design';
import type { ResourceLock } from '@rawdrive/shared-types';
import { useOptionalCollaboration, DEFAULT_COLLABORATION_STATE, useCollaborationAction } from '../contexts/CollaborationContext';
import { API_BASE } from '@rawdrive/shared-constants';

export type DesignSection = 'cover' | 'typography' | 'theme' | 'grid';

interface DesignControlLock {
  section: DesignSection;
  locked_by_user_id?: string;
  locked_by_user_name?: string;
  locked_at?: string;
  lock_id?: string;
}

export interface UseDesignCollaborationOptions {
  galleryId: string;
  enabled?: boolean;
  onRemoteUpdate?: (config: Partial<GalleryDesignConfig>, updatedBy: string) => void;
  onSectionLocked?: (section: DesignSection, by: string) => void;
  onSectionUnlocked?: (section: DesignSection) => void;
}

export interface UseDesignCollaborationReturn {
  // State
  isCollaborating: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  lockedSections: Map<DesignSection, DesignControlLock>;
  collaborators: Array<{ userId: string; displayName: string; color: string }>;
  viewerCount: number;
  error?: string;

  // Actions
  lockSection: (section: DesignSection) => Promise<{ success: boolean; error?: string }>;
  unlockSection: (section: DesignSection) => Promise<boolean>;
  isSectionLocked: (section: DesignSection) => boolean;
  isSectionLockedByMe: (section: DesignSection) => boolean;
  broadcastDesignUpdate: (config: Partial<GalleryDesignConfig>, section?: DesignSection) => Promise<void>;
}

/**
 * Hook for managing collaborative design editing
 */
export const useDesignCollaboration = (
  options: UseDesignCollaborationOptions
): UseDesignCollaborationReturn => {
  const { galleryId, enabled = true, onRemoteUpdate, onSectionLocked, onSectionUnlocked } = options;

  // Get collaboration context (optional - gracefully degrades if no provider)
  const collaborationContext = useOptionalCollaboration();
  const collaboration = collaborationContext ?? DEFAULT_COLLABORATION_STATE;

  // Local state
  const [viewerCount, setViewerCount] = useState(0);
  const [lockedSections, setLockedSections] = useState<Map<DesignSection, DesignControlLock>>(new Map());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Refs for tracking lock state
  const myLocksRef = useRef<Map<DesignSection, string>>(new Map()); // section -> lock_id
  const viewerCountIntervalRef = useRef<number | null>(null);

  // -------------------------------------------------------------------------
  // Initialize
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!enabled) return;

    // Get current user ID from token
    const initializeUserId = async () => {
      const { getStoredTokens } = await import('../services/tokenStorage');
      const tokens = getStoredTokens();

      if (tokens?.accessToken) {
        // Decode JWT to get user ID
        try {
          const parts = tokens.accessToken.split('.');
          if (parts.length === 3) {
            const decoded = JSON.parse(atob(parts[1]));
            setCurrentUserId(decoded.sub);
          }
        } catch (e) {
          console.warn('Failed to decode user ID from token:', e);
        }
      }
    };

    initializeUserId();
  }, [enabled]);

  // -------------------------------------------------------------------------
  // Viewer Count Polling
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!enabled) return;

    const fetchViewerCount = async () => {
      try {
        const { getStoredTokens } = await import('../services/tokenStorage');
        const tokens = getStoredTokens();

        const response = await fetch(`${API_BASE}/collaboration/galleries/${galleryId}/viewer-count`, {
          headers: {
            Authorization: `Bearer ${tokens?.accessToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setViewerCount(data.viewer_count || 0);
        }
      } catch (e) {
        console.warn('Failed to fetch viewer count:', e);
      }
    };

    // Fetch immediately
    fetchViewerCount();

    // Poll every 5 seconds
    viewerCountIntervalRef.current = window.setInterval(fetchViewerCount, 5000);

    return () => {
      if (viewerCountIntervalRef.current) {
        clearInterval(viewerCountIntervalRef.current);
      }
    };
  }, [galleryId, enabled]);

  // -------------------------------------------------------------------------
  // Design Lock Management
  // -------------------------------------------------------------------------

  const lockSection = useCallback(
    async (section: DesignSection): Promise<{ success: boolean; error?: string }> => {
      if (!collaboration.isInSession) {
        return { success: false, error: 'Not in a collaboration session' };
      }

      try {
        const designResourceType = `design_${section}`;

        const result = await collaboration.acquireLock(
          designResourceType as 'gallery' | 'sub_gallery' | 'asset' | 'settings',
          galleryId,
          `Editing ${section} settings`
        );

        if (result.success && result.lock) {
          myLocksRef.current.set(section, result.lock.lock_id);

          // Update locked sections
          setLockedSections((prev) => {
            const updated = new Map(prev);
            updated.set(section, {
              section,
              locked_by_user_id: currentUserId || undefined,
              lock_id: result.lock!.lock_id,
              locked_at: new Date().toISOString(),
            });
            return updated;
          });

          onSectionLocked?.(section, currentUserId || '');

          return { success: true };
        }

        return result as { success: boolean; error?: string };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to acquire lock';
        console.error('Error locking section:', message, err);
        return { success: false, error: message };
      }
    },
    [collaboration, galleryId, currentUserId, onSectionLocked]
  );

  const unlockSection = useCallback(
    async (section: DesignSection): Promise<boolean> => {
      const lockId = myLocksRef.current.get(section);

      if (!lockId) {
        return false;
      }

      try {
        const success = await collaboration.releaseLock(lockId);

        if (success) {
          myLocksRef.current.delete(section);

          setLockedSections((prev) => {
            const updated = new Map(prev);
            updated.delete(section);
            return updated;
          });

          onSectionUnlocked?.(section);
        }

        return success;
      } catch (err) {
        console.error('Error unlocking section:', err);
        return false;
      }
    },
    [collaboration, onSectionUnlocked]
  );

  const isSectionLocked = useCallback(
    (section: DesignSection): boolean => {
      return lockedSections.has(section);
    },
    [lockedSections]
  );

  const isSectionLockedByMe = useCallback(
    (section: DesignSection): boolean => {
      const lock = lockedSections.get(section);
      return lock?.locked_by_user_id === currentUserId;
    },
    [lockedSections, currentUserId]
  );

  // -------------------------------------------------------------------------
  // Design Update Broadcasting
  // -------------------------------------------------------------------------

  const broadcastDesignUpdate = useCallback(
    async (config: Partial<GalleryDesignConfig>, section?: DesignSection): Promise<void> => {
      if (!collaboration.isInSession) {
        console.warn('Not in collaboration session - design updates not broadcast');
        return;
      }

      try {
        const actionType = section ? `design:${section}_update` : 'design:update';

        await collaboration.recordAction(actionType, {
          design_config: config,
          section,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Error broadcasting design update:', err);
      }
    },
    [collaboration]
  );

  // -------------------------------------------------------------------------
  // Listen for Remote Design Updates
  // -------------------------------------------------------------------------

  useCollaborationAction((action, newVersion) => {
    if (!action.action_type.startsWith('design:')) {
      return;
    }

    const payload = action.payload as unknown;
    if (typeof payload === 'object' && payload !== null) {
      const payloadObj = payload as Record<string, unknown>;
      const designConfig = payloadObj.design_config as Partial<GalleryDesignConfig> | undefined;
      const updatedBy = action.user_id;

      if (designConfig) {
        onRemoteUpdate?.(designConfig, updatedBy);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Listen for Lock State Changes
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!collaboration.locks) {
      return;
    }

    // Update locked sections from collaboration context
    const designLocks = new Map<DesignSection, DesignControlLock>();

    collaboration.locks.forEach((lock: ResourceLock) => {
      // Extract section from resource_type: "design_cover" -> "cover"
      if (lock.resource_type.startsWith('design_')) {
        const section = lock.resource_type.replace('design_', '') as DesignSection;
        designLocks.set(section, {
          section,
          locked_by_user_id: lock.user_id,
          locked_by_user_name: (lock as any).user_name || 'Unknown',
          locked_at: (lock as any).created_at || new Date().toISOString(),
          lock_id: lock.lock_id,
        });

        // Notify if locked by someone else
        if (lock.user_id !== currentUserId && !myLocksRef.current.has(section)) {
          onSectionLocked?.(section, (lock as any).user_name || 'Unknown');
        }
      }
    });

    setLockedSections(designLocks);
  }, [collaboration.locks, currentUserId, onSectionLocked]);

  // -------------------------------------------------------------------------
  // Cleanup on Unmount
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      // Release all locks held by this component
      myLocksRef.current.forEach((lockId, section) => {
        unlockSection(section).catch((err) => console.error('Failed to release lock:', err));
      });

      if (viewerCountIntervalRef.current) {
        clearInterval(viewerCountIntervalRef.current);
      }
    };
  }, [unlockSection]);

  // -------------------------------------------------------------------------
  // Return Hook API
  // -------------------------------------------------------------------------

  return {
    // State
    isCollaborating: collaboration.isInSession,
    connectionStatus: collaboration.connectionStatus,
    lockedSections,
    collaborators: collaboration.collaborators.map((c) => ({
      userId: c.user_id,
      displayName: c.display_name,
      color: c.color,
    })),
    viewerCount,
    error: collaboration.error || undefined,

    // Actions
    lockSection,
    unlockSection,
    isSectionLocked,
    isSectionLockedByMe,
    broadcastDesignUpdate,
  };
};
