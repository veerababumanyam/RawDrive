/**
 * CollaborationContext
 *
 * Provides collaborative editing functionality for galleries including:
 * - Session management (create, join, leave)
 * - Real-time presence tracking
 * - Cursor position broadcasting
 * - Action synchronization
 * - Conflict resolution
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import type {
  CollaboratorPresence,
  CursorPosition,
  EditSession,
  CollaborativeAction,
  CollaborativeActionType,
  EditConflict,
  ResourceLock,
} from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CollaborationState {
  /** Current session data */
  session: EditSession | null;
  /** Whether a session is active */
  isInSession: boolean;
  /** Whether currently connecting to a session */
  isConnecting: boolean;
  /** Current collaborators */
  collaborators: CollaboratorPresence[];
  /** Current user's assigned color */
  myColor: string;
  /** Current version number */
  version: number;
  /** Active locks */
  locks: ResourceLock[];
  /** Unresolved conflicts */
  conflicts: EditConflict[];
  /** Connection status */
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  /** Last error */
  error: string | null;
}

interface CollaborationActions {
  /** Join or create a session for a gallery */
  joinSession: (galleryId: string) => Promise<void>;
  /** Leave the current session */
  leaveSession: () => Promise<void>;
  /** Update cursor position */
  updateCursor: (position: CursorPosition) => void;
  /** Update selected assets */
  updateSelection: (assetIds: string[]) => void;
  /** Record a collaborative action */
  recordAction: (
    actionType: CollaborativeActionType | string,
    payload: Record<string, unknown>
  ) => Promise<{ success: boolean; newVersion: number; conflict?: EditConflict }>;
  /** Acquire a lock on a resource */
  acquireLock: (
    resourceType: 'gallery' | 'sub_gallery' | 'asset' | 'settings',
    resourceId: string,
    reason?: string
  ) => Promise<{ success: boolean; lock?: ResourceLock; error?: string }>;
  /** Release a lock */
  releaseLock: (lockId: string) => Promise<boolean>;
  /** Resolve a conflict */
  resolveConflict: (conflictId: string, optionId: string) => Promise<boolean>;
}

interface CollaborationContextValue extends CollaborationState, CollaborationActions {}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CollaborationContext = createContext<CollaborationContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface CollaborationProviderProps {
  children: React.ReactNode;
  workspaceId: string;
}

export const CollaborationProvider: React.FC<CollaborationProviderProps> = ({
  children,
  workspaceId,
}) => {
  // State
  const [session, setSession] = useState<EditSession | null>(null);
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [myColor, setMyColor] = useState<string>('#4ECDC4');
  const [version, setVersion] = useState<number>(1);
  const [locks, setLocks] = useState<ResourceLock[]>([]);
  const [conflicts, setConflicts] = useState<EditConflict[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'connecting' | 'connected'
  >('disconnected');
  const [error, setError] = useState<string | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const cursorThrottleRef = useRef<number | null>(null);

  // Derived state
  const isInSession = session !== null;
  const isConnecting = connectionStatus === 'connecting';

  // -------------------------------------------------------------------------
  // WebSocket Connection
  // -------------------------------------------------------------------------

  const connectWebSocket = useCallback(
    async (sessionId: string, token: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        return;
      }

      setConnectionStatus('connecting');

      // Build WebSocket URL
      const apiUrl =
        import.meta.env.VITE_API_URL !== undefined
          ? import.meta.env.VITE_API_URL
          : 'http://localhost:8000';
      const wsUrl = apiUrl.replace(/^http/, 'ws');
      const url = `${wsUrl}/api/v1/collaboration/ws/${sessionId}?token=${encodeURIComponent(token)}`;

      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnectionStatus('connected');
          setError(null);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        ws.onerror = () => {
          setError('WebSocket connection error');
          setConnectionStatus('disconnected');
        };

        ws.onclose = () => {
          setConnectionStatus('disconnected');
          // Attempt reconnect after delay
          if (tokenRef.current && session) {
            reconnectTimeoutRef.current = window.setTimeout(() => {
              connectWebSocket(session.session_id, tokenRef.current!);
            }, 3000);
          }
        };
      } catch (err) {
        setError('Failed to connect to collaboration server');
        setConnectionStatus('disconnected');
      }
    },
    [session]
  );

  const handleWebSocketMessage = useCallback((data: Record<string, unknown>) => {
    const type = data.type as string;

    switch (type) {
      case 'collab:connected':
        // Connection confirmed
        break;

      case 'collab:presence': {
        const event = data.event as string;
        const userId = data.user_id as string;

        if (event === 'joined') {
          // Add new collaborator
          setCollaborators((prev) => {
            if (prev.find((c) => c.user_id === userId)) return prev;
            return [
              ...prev,
              {
                user_id: userId,
                display_name: (data.display_name as string) || 'Unknown',
                color: (data.color as string) || '#888888',
                status: 'active' as const,
                selected_assets: [],
                last_activity: new Date().toISOString(),
                joined_at: new Date().toISOString(),
              },
            ];
          });
        } else if (event === 'left') {
          setCollaborators((prev) => prev.filter((c) => c.user_id !== userId));
        } else if (event === 'updated') {
          setCollaborators((prev) =>
            prev.map((c) => {
              if (c.user_id !== userId) return c;
              return {
                ...c,
                cursor: (data.cursor as CursorPosition) || c.cursor,
                selected_assets:
                  (data.selected_assets as string[]) || c.selected_assets,
                last_activity: new Date().toISOString(),
              };
            })
          );
        }
        break;
      }

      case 'collab:cursor': {
        const userId = data.user_id as string;
        const cursor = data.cursor as CursorPosition;
        setCollaborators((prev) =>
          prev.map((c) => {
            if (c.user_id !== userId) return c;
            return {
              ...c,
              cursor,
              last_activity: new Date().toISOString(),
            };
          })
        );
        break;
      }

      case 'collab:selection': {
        const userId = data.user_id as string;
        const selectedAssets = data.selected_assets as string[];
        setCollaborators((prev) =>
          prev.map((c) => {
            if (c.user_id !== userId) return c;
            return {
              ...c,
              selected_assets: selectedAssets,
              last_activity: new Date().toISOString(),
            };
          })
        );
        break;
      }

      case 'collab:action': {
        const action = data.action as CollaborativeAction;
        const newVersion = data.new_version as number;
        setVersion(newVersion);

        // Dispatch custom event for action handlers
        window.dispatchEvent(
          new CustomEvent('collab:action', { detail: { action, newVersion } })
        );
        break;
      }

      case 'collab:lock_acquired': {
        const lockData = data as unknown as ResourceLock;
        setLocks((prev) => [...prev, lockData]);
        break;
      }

      case 'collab:lock_released': {
        const resourceType = data.resource_type as string;
        const resourceId = data.resource_id as string;
        setLocks((prev) =>
          prev.filter(
            (l) => !(l.resource_type === resourceType && l.resource_id === resourceId)
          )
        );
        break;
      }

      case 'collab:notification': {
        // Dispatch notification event for UI
        window.dispatchEvent(
          new CustomEvent('collab:notification', { detail: data })
        );
        break;
      }

      case 'collab:typing': {
        // Dispatch typing indicator event
        window.dispatchEvent(new CustomEvent('collab:typing', { detail: data }));
        break;
      }

      default:
        console.log('Unknown collaboration message type:', type);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Session Management
  // -------------------------------------------------------------------------

  const joinSession = useCallback(
    async (galleryId: string) => {
      setConnectionStatus('connecting');
      setError(null);

      try {
        // Get auth token
        const { getStoredTokens } = await import('../services/tokenStorage');
        const tokens = getStoredTokens();

        if (!tokens?.accessToken) {
          throw new Error('Not authenticated');
        }

        // Create or join session
        const apiUrl =
          import.meta.env.VITE_API_URL !== undefined
            ? import.meta.env.VITE_API_URL
            : 'http://localhost:8000';

        const response = await fetch(`${apiUrl}/api/v1/collaboration/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokens.accessToken}`,
          },
          body: JSON.stringify({ gallery_id: galleryId }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to join session');
        }

        const data = await response.json();

        // Store session info
        setSession({
          session_id: data.session_id,
          gallery_id: data.gallery_id,
          workspace_id: data.workspace_id,
          collaborators: data.collaborators,
          created_at: new Date().toISOString(),
          last_activity: new Date().toISOString(),
          version: data.version,
        });
        setCollaborators(data.collaborators);
        setMyColor(data.your_color);
        setVersion(data.version);
        tokenRef.current = data.token;

        // Connect WebSocket
        await connectWebSocket(data.session_id, data.token);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to join session';
        setError(message);
        setConnectionStatus('disconnected');
        throw err;
      }
    },
    [connectWebSocket]
  );

  const leaveSession = useCallback(async () => {
    if (!session) return;

    try {
      // Get auth token
      const { getStoredTokens } = await import('../services/tokenStorage');
      const tokens = getStoredTokens();

      if (tokens?.accessToken) {
        const apiUrl =
          import.meta.env.VITE_API_URL !== undefined
            ? import.meta.env.VITE_API_URL
            : 'http://localhost:8000';

        await fetch(
          `${apiUrl}/api/v1/collaboration/sessions/${session.session_id}/leave`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
            },
          }
        );
      }
    } catch (err) {
      console.error('Error leaving session:', err);
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Reset state
    setSession(null);
    setCollaborators([]);
    setLocks([]);
    setConflicts([]);
    setConnectionStatus('disconnected');
    tokenRef.current = null;
  }, [session]);

  // -------------------------------------------------------------------------
  // Presence Updates
  // -------------------------------------------------------------------------

  const updateCursor = useCallback((position: CursorPosition) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Throttle cursor updates to 60fps
    if (cursorThrottleRef.current) return;

    cursorThrottleRef.current = window.setTimeout(() => {
      cursorThrottleRef.current = null;
    }, 16);

    wsRef.current.send(
      JSON.stringify({
        type: 'cursor',
        cursor: position,
      })
    );
  }, []);

  const updateSelection = useCallback((assetIds: string[]) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: 'selection',
        selected_assets: assetIds,
      })
    );
  }, []);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const recordAction = useCallback(
    async (
      actionType: CollaborativeActionType | string,
      payload: Record<string, unknown>
    ): Promise<{
      success: boolean;
      newVersion: number;
      conflict?: EditConflict;
    }> => {
      if (!session) {
        return { success: false, newVersion: version };
      }

      try {
        const { getStoredTokens } = await import('../services/tokenStorage');
        const tokens = getStoredTokens();

        if (!tokens?.accessToken) {
          throw new Error('Not authenticated');
        }

        const apiUrl =
          import.meta.env.VITE_API_URL !== undefined
            ? import.meta.env.VITE_API_URL
            : 'http://localhost:8000';

        const response = await fetch(
          `${apiUrl}/api/v1/collaboration/sessions/${session.session_id}/actions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tokens.accessToken}`,
            },
            body: JSON.stringify({
              action_type: actionType,
              payload,
              base_version: version,
            }),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to record action');
        }

        const data = await response.json();
        setVersion(data.new_version);

        if (data.conflict) {
          setConflicts((prev) => [...prev, data.conflict]);
        }

        return {
          success: data.success,
          newVersion: data.new_version,
          conflict: data.conflict,
        };
      } catch (err) {
        console.error('Error recording action:', err);
        return { success: false, newVersion: version };
      }
    },
    [session, version]
  );

  // -------------------------------------------------------------------------
  // Locking
  // -------------------------------------------------------------------------

  const acquireLock = useCallback(
    async (
      resourceType: 'gallery' | 'sub_gallery' | 'asset' | 'settings',
      resourceId: string,
      reason?: string
    ): Promise<{
      success: boolean;
      lock?: ResourceLock;
      error?: string;
    }> => {
      if (!session) {
        return { success: false, error: 'Not in a session' };
      }

      try {
        const { getStoredTokens } = await import('../services/tokenStorage');
        const tokens = getStoredTokens();

        if (!tokens?.accessToken) {
          throw new Error('Not authenticated');
        }

        const apiUrl =
          import.meta.env.VITE_API_URL !== undefined
            ? import.meta.env.VITE_API_URL
            : 'http://localhost:8000';

        const response = await fetch(
          `${apiUrl}/api/v1/collaboration/sessions/${session.session_id}/locks`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tokens.accessToken}`,
            },
            body: JSON.stringify({
              resource_type: resourceType,
              resource_id: resourceId,
              lock_type: 'exclusive',
              reason,
            }),
          }
        );

        const data = await response.json();

        if (data.success && data.lock) {
          setLocks((prev) => [...prev, data.lock]);
        }

        return data;
      } catch (err) {
        console.error('Error acquiring lock:', err);
        return { success: false, error: 'Failed to acquire lock' };
      }
    },
    [session]
  );

  const releaseLock = useCallback(
    async (lockId: string): Promise<boolean> => {
      try {
        const { getStoredTokens } = await import('../services/tokenStorage');
        const tokens = getStoredTokens();

        if (!tokens?.accessToken) {
          throw new Error('Not authenticated');
        }

        const apiUrl =
          import.meta.env.VITE_API_URL !== undefined
            ? import.meta.env.VITE_API_URL
            : 'http://localhost:8000';

        const response = await fetch(
          `${apiUrl}/api/v1/collaboration/locks/${lockId}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
            },
          }
        );

        if (response.ok) {
          setLocks((prev) => prev.filter((l) => l.lock_id !== lockId));
          return true;
        }

        return false;
      } catch (err) {
        console.error('Error releasing lock:', err);
        return false;
      }
    },
    []
  );

  // -------------------------------------------------------------------------
  // Conflict Resolution
  // -------------------------------------------------------------------------

  const resolveConflict = useCallback(
    async (conflictId: string, optionId: string): Promise<boolean> => {
      // TODO: Implement conflict resolution API call
      setConflicts((prev) => prev.filter((c) => c.conflict_id !== conflictId));
      return true;
    },
    []
  );

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (cursorThrottleRef.current) {
        clearTimeout(cursorThrottleRef.current);
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // Context Value
  // -------------------------------------------------------------------------

  const value: CollaborationContextValue = {
    // State
    session,
    isInSession,
    isConnecting,
    collaborators,
    myColor,
    version,
    locks,
    conflicts,
    connectionStatus,
    error,
    // Actions
    joinSession,
    leaveSession,
    updateCursor,
    updateSelection,
    recordAction,
    acquireLock,
    releaseLock,
    resolveConflict,
  };

  return (
    <CollaborationContext.Provider value={value}>
      {children}
    </CollaborationContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCollaboration(): CollaborationContextValue {
  const context = useContext(CollaborationContext);
  if (!context) {
    throw new Error('useCollaboration must be used within a CollaborationProvider');
  }
  return context;
}

// ---------------------------------------------------------------------------
// Utility Hook for Action Listeners
// ---------------------------------------------------------------------------

export function useCollaborationAction(
  onAction: (action: CollaborativeAction, newVersion: number) => void
): void {
  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{
        action: CollaborativeAction;
        newVersion: number;
      }>;
      onAction(customEvent.detail.action, customEvent.detail.newVersion);
    };

    window.addEventListener('collab:action', handler);
    return () => window.removeEventListener('collab:action', handler);
  }, [onAction]);
}

// ---------------------------------------------------------------------------
// Utility Hook for Notifications
// ---------------------------------------------------------------------------

interface CollaborationNotification {
  user_id: string;
  user_name: string;
  action_type: string;
  summary: string;
  affected_items: string[];
  timestamp: string;
}

export function useCollaborationNotifications(
  onNotification: (notification: CollaborationNotification) => void
): void {
  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<CollaborationNotification>;
      onNotification(customEvent.detail);
    };

    window.addEventListener('collab:notification', handler);
    return () => window.removeEventListener('collab:notification', handler);
  }, [onNotification]);
}

export default CollaborationContext;
