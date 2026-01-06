/**
 * useCollaborativeGallery Hook
 *
 * Provides collaborative editing functionality for a specific gallery.
 * Wraps the CollaborationContext with gallery-specific operations.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  useCollaboration,
  useCollaborationAction,
  useCollaborationNotifications,
} from '../contexts/CollaborationContext';
import type {
  CollaboratorPresence,
  CollaborativeAction,
  CursorPosition,
  ResourceLock,
} from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CollaborativeGalleryState {
  /** Whether collaborative mode is enabled */
  isCollaborative: boolean;
  /** List of collaborators in the session */
  collaborators: CollaboratorPresence[];
  /** Current user's color */
  myColor: string;
  /** Connection status */
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  /** Active locks on gallery resources */
  activeLocks: ResourceLock[];
  /** Recent notifications */
  notifications: CollaborationNotificationItem[];
  /** Error message if any */
  error: string | null;
}

interface CollaborativeGalleryActions {
  /** Start collaborative editing */
  startCollaboration: () => Promise<void>;
  /** Stop collaborative editing */
  stopCollaboration: () => Promise<void>;
  /** Report cursor movement */
  reportCursor: (x: number, y: number, target?: string) => void;
  /** Report asset selection */
  reportSelection: (assetIds: string[]) => void;
  /** Add assets to gallery (collaborative) */
  addAssets: (assetIds: string[], subGalleryId?: string) => Promise<boolean>;
  /** Remove assets from gallery (collaborative) */
  removeAssets: (assetIds: string[]) => Promise<boolean>;
  /** Move assets to sub-gallery (collaborative) */
  moveAssets: (
    assetIds: string[],
    fromSubGalleryId?: string,
    toSubGalleryId?: string
  ) => Promise<boolean>;
  /** Reorder assets (collaborative) */
  reorderAssets: (assetIds: string[], subGalleryId?: string) => Promise<boolean>;
  /** Create a sub-gallery/collection (collaborative) */
  createCollection: (name: string) => Promise<boolean>;
  /** Delete a sub-gallery/collection (collaborative) */
  deleteCollection: (subGalleryId: string) => Promise<boolean>;
  /** Rename a sub-gallery/collection (collaborative) */
  renameCollection: (subGalleryId: string, name: string) => Promise<boolean>;
  /** Lock a resource for exclusive editing */
  lockResource: (
    resourceType: 'gallery' | 'sub_gallery' | 'asset' | 'settings',
    resourceId: string
  ) => Promise<boolean>;
  /** Release a lock */
  unlockResource: (lockId: string) => Promise<boolean>;
  /** Dismiss a notification */
  dismissNotification: (notificationId: string) => void;
  /** Clear all notifications */
  clearNotifications: () => void;
}

interface CollaborationNotificationItem {
  id: string;
  userName: string;
  action: string;
  summary: string;
  timestamp: Date;
}

interface UseCollaborativeGalleryReturn
  extends CollaborativeGalleryState,
    CollaborativeGalleryActions {}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCollaborativeGallery(
  galleryId: string
): UseCollaborativeGalleryReturn {
  const collaboration = useCollaboration();
  const [notifications, setNotifications] = useState<CollaborationNotificationItem[]>(
    []
  );

  // -------------------------------------------------------------------------
  // Sync with collaboration context
  // -------------------------------------------------------------------------

  const isCollaborative =
    collaboration.isInSession &&
    collaboration.session?.gallery_id === galleryId;

  // -------------------------------------------------------------------------
  // Start/Stop Collaboration
  // -------------------------------------------------------------------------

  const startCollaboration = useCallback(async () => {
    if (collaboration.isInSession) {
      // Already in a session
      if (collaboration.session?.gallery_id !== galleryId) {
        // Different gallery, leave current session first
        await collaboration.leaveSession();
      } else {
        return; // Already in this gallery's session
      }
    }
    await collaboration.joinSession(galleryId);
  }, [collaboration, galleryId]);

  const stopCollaboration = useCallback(async () => {
    await collaboration.leaveSession();
  }, [collaboration]);

  // -------------------------------------------------------------------------
  // Presence Reporting
  // -------------------------------------------------------------------------

  const reportCursor = useCallback(
    (x: number, y: number, target?: string) => {
      if (!isCollaborative) return;

      const position: CursorPosition = {
        x,
        y,
        target,
      };
      collaboration.updateCursor(position);
    },
    [isCollaborative, collaboration]
  );

  const reportSelection = useCallback(
    (assetIds: string[]) => {
      if (!isCollaborative) return;
      collaboration.updateSelection(assetIds);
    },
    [isCollaborative, collaboration]
  );

  // -------------------------------------------------------------------------
  // Asset Actions
  // -------------------------------------------------------------------------

  const addAssets = useCallback(
    async (assetIds: string[], subGalleryId?: string): Promise<boolean> => {
      if (!isCollaborative) return false;

      const result = await collaboration.recordAction('asset:add', {
        asset_ids: assetIds,
        sub_gallery_id: subGalleryId,
      });

      return result.success;
    },
    [isCollaborative, collaboration]
  );

  const removeAssets = useCallback(
    async (assetIds: string[]): Promise<boolean> => {
      if (!isCollaborative) return false;

      const result = await collaboration.recordAction('asset:remove', {
        asset_ids: assetIds,
      });

      return result.success;
    },
    [isCollaborative, collaboration]
  );

  const moveAssets = useCallback(
    async (
      assetIds: string[],
      fromSubGalleryId?: string,
      toSubGalleryId?: string
    ): Promise<boolean> => {
      if (!isCollaborative) return false;

      const result = await collaboration.recordAction('asset:move', {
        asset_ids: assetIds,
        from_sub_gallery_id: fromSubGalleryId,
        to_sub_gallery_id: toSubGalleryId,
      });

      return result.success;
    },
    [isCollaborative, collaboration]
  );

  const reorderAssets = useCallback(
    async (assetIds: string[], subGalleryId?: string): Promise<boolean> => {
      if (!isCollaborative) return false;

      const result = await collaboration.recordAction('asset:reorder', {
        asset_ids: assetIds,
        sub_gallery_id: subGalleryId,
      });

      return result.success;
    },
    [isCollaborative, collaboration]
  );

  // -------------------------------------------------------------------------
  // Collection Actions
  // -------------------------------------------------------------------------

  const createCollection = useCallback(
    async (name: string): Promise<boolean> => {
      if (!isCollaborative) return false;

      const result = await collaboration.recordAction('collection:create', {
        name,
      });

      return result.success;
    },
    [isCollaborative, collaboration]
  );

  const deleteCollection = useCallback(
    async (subGalleryId: string): Promise<boolean> => {
      if (!isCollaborative) return false;

      const result = await collaboration.recordAction('collection:delete', {
        sub_gallery_id: subGalleryId,
      });

      return result.success;
    },
    [isCollaborative, collaboration]
  );

  const renameCollection = useCallback(
    async (subGalleryId: string, name: string): Promise<boolean> => {
      if (!isCollaborative) return false;

      const result = await collaboration.recordAction('collection:rename', {
        sub_gallery_id: subGalleryId,
        name,
      });

      return result.success;
    },
    [isCollaborative, collaboration]
  );

  // -------------------------------------------------------------------------
  // Locking
  // -------------------------------------------------------------------------

  const lockResource = useCallback(
    async (
      resourceType: 'gallery' | 'sub_gallery' | 'asset' | 'settings',
      resourceId: string
    ): Promise<boolean> => {
      if (!isCollaborative) return false;

      const result = await collaboration.acquireLock(resourceType, resourceId);
      return result.success;
    },
    [isCollaborative, collaboration]
  );

  const unlockResource = useCallback(
    async (lockId: string): Promise<boolean> => {
      return collaboration.releaseLock(lockId);
    },
    [collaboration]
  );

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------

  useCollaborationNotifications((notification) => {
    const newNotification: CollaborationNotificationItem = {
      id: `${Date.now()}-${Math.random()}`,
      userName: notification.user_name,
      action: notification.action_type,
      summary: notification.summary,
      timestamp: new Date(notification.timestamp),
    };

    setNotifications((prev) => [newNotification, ...prev].slice(0, 10));
  });

  const dismissNotification = useCallback((notificationId: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // -------------------------------------------------------------------------
  // Action Listener (for external state updates)
  // -------------------------------------------------------------------------

  useCollaborationAction((action: CollaborativeAction, newVersion: number) => {
    // Dispatch custom events for specific action types
    // These can be listened to by gallery components to update their state

    const eventName = `gallery:${action.action_type.replace(':', '_')}`;
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: {
          action,
          newVersion,
          galleryId,
        },
      })
    );
  });

  // -------------------------------------------------------------------------
  // Return Value
  // -------------------------------------------------------------------------

  return {
    // State
    isCollaborative,
    collaborators: isCollaborative ? collaboration.collaborators : [],
    myColor: collaboration.myColor,
    connectionStatus: collaboration.connectionStatus,
    activeLocks: isCollaborative ? collaboration.locks : [],
    notifications,
    error: collaboration.error,

    // Actions
    startCollaboration,
    stopCollaboration,
    reportCursor,
    reportSelection,
    addAssets,
    removeAssets,
    moveAssets,
    reorderAssets,
    createCollection,
    deleteCollection,
    renameCollection,
    lockResource,
    unlockResource,
    dismissNotification,
    clearNotifications,
  };
}

export default useCollaborativeGallery;
