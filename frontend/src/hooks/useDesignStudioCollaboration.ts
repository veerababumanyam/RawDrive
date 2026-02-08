/**
 * useDesignStudioCollaboration Hook
 *
 * Manages real-time multi-user collaborative editing in the Gallery Design Studio.
 * Provides presence indicators, live cursor tracking, section locking, and conflict resolution.
 *
 * Features:
 * - Real-time presence tracking for all collaborators
 * - Live cursor positions with throttling
 * - Section-based locking to prevent concurrent edits
 * - Automatic conflict detection and resolution UI
 * - Activity feed for collaboration history
 * - Typing indicators for text fields
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '@rawdrive/shared-constants';
import type { GalleryDesignConfig } from '../types/gallery-design';
import type {
  DesignSection,
  DesignSectionLock,
  DesignCursorPosition,
  DesignStudioCollaborator,
  DesignConflict,
  DesignConflictResolution,
  DesignActivityItem,
  UseDesignStudioCollaborationReturn,
  DesignCollaborationMessage,
} from '../types/design-studio-collaboration';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURSOR_THROTTLE_MS = 50; // 20fps for cursor updates
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;
const ACTIVITY_FEED_MAX_ITEMS = 50;

// ---------------------------------------------------------------------------
// Hook Options
// ---------------------------------------------------------------------------

export interface UseDesignStudioCollaborationOptions {
  /** Gallery ID to collaborate on */
  galleryId: string;
  /** Workspace ID */
  workspaceId: string;
  /** Enable collaboration features */
  enabled?: boolean;
  /** Callback when remote design update received */
  onRemoteUpdate?: (config: Partial<GalleryDesignConfig>, userId: string, section?: DesignSection) => void;
  /** Callback when conflict detected */
  onConflict?: (conflict: DesignConflict) => void;
  /** Callback when section is locked by another user */
  onSectionLocked?: (section: DesignSection, userName: string) => void;
  /** Callback when section is unlocked */
  onSectionUnlocked?: (section: DesignSection) => void;
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

export function useDesignStudioCollaboration(
  options: UseDesignStudioCollaborationOptions
): UseDesignStudioCollaborationReturn {
  const {
    galleryId,
    workspaceId,
    enabled = true,
    onRemoteUpdate,
    onConflict,
    onSectionLocked,
    onSectionUnlocked,
  } = options;

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const [isCollaborating, setIsCollaborating] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>('disconnected');
  const [collaborators, setCollaborators] = useState<DesignStudioCollaborator[]>([]);
  const [myColor, setMyColor] = useState('#4ECDC4');
  const [myUserId, setMyUserId] = useState('');
  const [lockedSections, setLockedSections] = useState<Map<DesignSection, DesignSectionLock>>(new Map());
  const [myLockedSections, setMyLockedSections] = useState<Set<DesignSection>>(new Set());
  const [conflicts, setConflicts] = useState<DesignConflict[]>([]);
  const [activityFeed, setActivityFeed] = useState<DesignActivityItem[]>([]);
  const [version, setVersion] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Refs
  // -------------------------------------------------------------------------

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const cursorThrottleRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const myLocksRef = useRef<Map<DesignSection, string>>(new Map()); // section -> lockId

  // -------------------------------------------------------------------------
  // Token & User ID
  // -------------------------------------------------------------------------

  useEffect(() => {
    const initUser = async () => {
      try {
        const { getStoredTokens } = await import('../services/tokenStorage');
        const tokens = getStoredTokens();
        if (tokens?.accessToken) {
          const parts = tokens.accessToken.split('.');
          if (parts.length === 3) {
            const decoded = JSON.parse(atob(parts[1]));
            setMyUserId(decoded.sub || decoded.user_id || '');
          }
        }
      } catch (e) {
        console.warn('Failed to decode user ID:', e);
      }
    };
    initUser();
  }, []);

  // -------------------------------------------------------------------------
  // Activity Feed Helper
  // -------------------------------------------------------------------------

  const addActivity = useCallback((activity: Omit<DesignActivityItem, 'id' | 'timestamp'>) => {
    const newActivity: DesignActivityItem = {
      ...activity,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };
    setActivityFeed(prev => [newActivity, ...prev].slice(0, ACTIVITY_FEED_MAX_ITEMS));
  }, []);

  // -------------------------------------------------------------------------
  // WebSocket Message Handler
  // -------------------------------------------------------------------------

  const handleMessage = useCallback((data: DesignCollaborationMessage) => {
    switch (data.type) {
      case 'design:presence': {
        const { event, collaborator } = data;
        if (event === 'joined' && collaborator.user_id !== myUserId) {
          setCollaborators(prev => {
            if (prev.find(c => c.user_id === collaborator.user_id)) return prev;
            return [...prev, collaborator];
          });
          addActivity({
            userId: collaborator.user_id,
            userName: collaborator.display_name,
            userColor: collaborator.color,
            action: 'joined',
            description: `${collaborator.display_name} joined the design session`,
          });
        } else if (event === 'left') {
          setCollaborators(prev => prev.filter(c => c.user_id !== collaborator.user_id));
          addActivity({
            userId: collaborator.user_id,
            userName: collaborator.display_name,
            userColor: collaborator.color,
            action: 'left',
            description: `${collaborator.display_name} left the session`,
          });
        } else if (event === 'updated') {
          setCollaborators(prev => prev.map(c =>
            c.user_id === collaborator.user_id ? { ...c, ...collaborator } : c
          ));
        }
        break;
      }

      case 'design:cursor': {
        const { userId, cursor } = data;
        if (userId !== myUserId) {
          setCollaborators(prev => prev.map(c =>
            c.user_id === userId ? { ...c, designCursor: cursor } : c
          ));
        }
        break;
      }

      case 'design:typing': {
        const { userId, userName, isTyping, field, section } = data;
        if (userId !== myUserId) {
          setCollaborators(prev => prev.map(c =>
            c.user_id === userId ? { ...c, isTyping, typingField: field, activeSection: section } : c
          ));
        }
        break;
      }

      case 'design:focus': {
        const { userId, userName, userColor, section } = data;
        if (userId !== myUserId) {
          setCollaborators(prev => prev.map(c =>
            c.user_id === userId ? { ...c, activeSection: section || undefined } : c
          ));
          if (section) {
            addActivity({
              userId,
              userName,
              userColor,
              action: 'focus',
              section,
              description: `${userName} started editing ${section}`,
            });
          }
        }
        break;
      }

      case 'design:update': {
        const { userId, userName, userColor, config, section } = data;
        if (userId !== myUserId) {
          onRemoteUpdate?.(config, userId, section);
          addActivity({
            userId,
            userName,
            userColor,
            action: 'update',
            section,
            description: section
              ? `${userName} updated ${section}`
              : `${userName} made changes`,
          });
        }
        break;
      }

      case 'design:lock': {
        const { event, section, userId, userName, userColor, lockId } = data;
        if (event === 'acquired' && userId !== myUserId) {
          setLockedSections(prev => {
            const updated = new Map(prev);
            updated.set(section, {
              section,
              lockedByUserId: userId,
              lockedByUserName: userName,
              lockedByColor: userColor,
              lockedAt: new Date().toISOString(),
              lockId: lockId || '',
            });
            return updated;
          });
          onSectionLocked?.(section, userName);
          addActivity({
            userId,
            userName,
            userColor,
            action: 'lock',
            section,
            description: `${userName} is editing ${section}`,
          });
        } else if (event === 'released') {
          setLockedSections(prev => {
            const updated = new Map(prev);
            updated.delete(section);
            return updated;
          });
          if (userId !== myUserId) {
            onSectionUnlocked?.(section);
          }
        }
        break;
      }

      case 'design:conflict': {
        const { conflict } = data;
        setConflicts(prev => [...prev, conflict]);
        onConflict?.(conflict);
        break;
      }
    }
  }, [myUserId, onRemoteUpdate, onConflict, onSectionLocked, onSectionUnlocked, addActivity]);

  // -------------------------------------------------------------------------
  // WebSocket Connection
  // -------------------------------------------------------------------------

  const connectWebSocket = useCallback(async (sessionId: string, token: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const wsUrl = apiUrl.replace(/^http/, 'ws');
    const url = `${wsUrl}/api/v1/collaboration/ws/${sessionId}?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        setIsCollaborating(true);
        setError(null);
        reconnectAttemptRef.current = 0;

        // Start heartbeat
        heartbeatIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, HEARTBEAT_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        if (event.data === 'pong') return;
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onerror = () => {
        setError('Connection error');
        setConnectionStatus('disconnected');
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }

        // Attempt reconnection
        if (tokenRef.current && sessionIdRef.current && reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptRef.current += 1;
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connectWebSocket(sessionIdRef.current!, tokenRef.current!);
          }, RECONNECT_DELAY_MS * reconnectAttemptRef.current);
        }
      };
    } catch (e) {
      setError('Failed to connect');
      setConnectionStatus('disconnected');
    }
  }, [handleMessage]);

  // -------------------------------------------------------------------------
  // Session Management
  // -------------------------------------------------------------------------

  const joinSession = useCallback(async () => {
    if (!enabled) return;

    setConnectionStatus('connecting');
    setError(null);

    try {
      const { getStoredTokens } = await import('../services/tokenStorage');
      const tokens = getStoredTokens();

      if (!tokens?.accessToken) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${API_BASE}/collaboration/sessions`, {
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

      sessionIdRef.current = data.session_id;
      tokenRef.current = data.token;
      setMyColor(data.your_color);
      setCollaborators(data.collaborators.filter((c: any) => c.user_id !== myUserId));
      setVersion(data.version);

      await connectWebSocket(data.session_id, data.token);

      addActivity({
        userId: myUserId,
        userName: 'You',
        userColor: data.your_color,
        action: 'joined',
        description: 'You joined the design session',
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to join session';
      setError(message);
      setConnectionStatus('disconnected');
    }
  }, [enabled, galleryId, myUserId, connectWebSocket, addActivity]);

  const leaveSession = useCallback(async () => {
    // Release all my locks
    for (const section of myLockedSections) {
      await unlockSectionInternal(section);
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clear timers
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    // Reset state
    setIsCollaborating(false);
    setConnectionStatus('disconnected');
    setCollaborators([]);
    setLockedSections(new Map());
    setMyLockedSections(new Set());
    sessionIdRef.current = null;
    tokenRef.current = null;
  }, [myLockedSections]);

  // -------------------------------------------------------------------------
  // Cursor Updates
  // -------------------------------------------------------------------------

  const updateCursor = useCallback((cursor: DesignCursorPosition) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Throttle cursor updates
    if (cursorThrottleRef.current) return;
    cursorThrottleRef.current = window.setTimeout(() => {
      cursorThrottleRef.current = null;
    }, CURSOR_THROTTLE_MS);

    wsRef.current.send(JSON.stringify({
      type: 'cursor',
      cursor,
    }));
  }, []);

  // -------------------------------------------------------------------------
  // Section Locking
  // -------------------------------------------------------------------------

  const lockSection = useCallback(async (section: DesignSection): Promise<{ success: boolean; error?: string }> => {
    if (!sessionIdRef.current) {
      return { success: false, error: 'Not in a session' };
    }

    // Check if already locked by someone else
    const existingLock = lockedSections.get(section);
    if (existingLock && existingLock.lockedByUserId !== myUserId) {
      return { success: false, error: `Section is being edited by ${existingLock.lockedByUserName}` };
    }

    try {
      const { getStoredTokens } = await import('../services/tokenStorage');
      const tokens = getStoredTokens();

      const response = await fetch(
        `${API_BASE}/collaboration/sessions/${sessionIdRef.current}/design/lock-control`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokens?.accessToken}`,
          },
          body: JSON.stringify({
            section,
            duration_seconds: 300,
          }),
        }
      );

      const data = await response.json();

      if (data.success && data.lock) {
        myLocksRef.current.set(section, data.lock.lock_id);
        setMyLockedSections(prev => new Set([...prev, section]));

        // Also add to locked sections for UI
        setLockedSections(prev => {
          const updated = new Map(prev);
          updated.set(section, {
            section,
            lockedByUserId: myUserId,
            lockedByUserName: 'You',
            lockedByColor: myColor,
            lockedAt: new Date().toISOString(),
            lockId: data.lock.lock_id,
          });
          return updated;
        });

        return { success: true };
      }

      return { success: false, error: data.error || 'Failed to acquire lock' };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to lock section';
      return { success: false, error: message };
    }
  }, [lockedSections, myUserId, myColor]);

  const unlockSectionInternal = async (section: DesignSection): Promise<boolean> => {
    const lockId = myLocksRef.current.get(section);
    if (!lockId) return false;

    try {
      const { getStoredTokens } = await import('../services/tokenStorage');
      const tokens = getStoredTokens();

      const response = await fetch(
        `${API_BASE}/collaboration/locks/${lockId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${tokens?.accessToken}`,
          },
        }
      );

      if (response.ok) {
        myLocksRef.current.delete(section);
        setMyLockedSections(prev => {
          const updated = new Set(prev);
          updated.delete(section);
          return updated;
        });
        setLockedSections(prev => {
          const updated = new Map(prev);
          updated.delete(section);
          return updated;
        });
        return true;
      }
      return false;
    } catch (e) {
      console.error('Failed to unlock section:', e);
      return false;
    }
  };

  const unlockSection = useCallback(async (section: DesignSection): Promise<boolean> => {
    return unlockSectionInternal(section);
  }, []);

  // -------------------------------------------------------------------------
  // Design Updates
  // -------------------------------------------------------------------------

  const broadcastUpdate = useCallback((config: Partial<GalleryDesignConfig>, section?: DesignSection) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: 'design_update',
      config,
      section,
    }));

    // Also send via REST for persistence
    const sendUpdate = async () => {
      try {
        const { getStoredTokens } = await import('../services/tokenStorage');
        const tokens = getStoredTokens();

        await fetch(
          `${API_BASE}/collaboration/sessions/${sessionIdRef.current}/design/update`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tokens?.accessToken}`,
            },
            body: JSON.stringify({ design_config: config, section }),
          }
        );
      } catch (e) {
        console.error('Failed to broadcast update:', e);
      }
    };
    sendUpdate();
  }, []);

  // -------------------------------------------------------------------------
  // Typing Indicator
  // -------------------------------------------------------------------------

  const setTyping = useCallback((isTyping: boolean, field?: string, section?: DesignSection) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: 'typing',
      is_typing: isTyping,
      field,
      section,
    }));
  }, []);

  // -------------------------------------------------------------------------
  // Focus Indicator
  // -------------------------------------------------------------------------

  const setFocusedSection = useCallback((section: DesignSection | null) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: 'focus',
      section,
    }));
  }, []);

  // -------------------------------------------------------------------------
  // Conflict Resolution
  // -------------------------------------------------------------------------

  const resolveConflict = useCallback(async (resolution: DesignConflictResolution): Promise<void> => {
    // Remove conflict from state
    setConflicts(prev => prev.filter(c => c.conflict_id !== resolution.conflictId));

    // If using merged config, broadcast it
    if (resolution.resolution === 'merge' && resolution.mergedConfig) {
      broadcastUpdate(resolution.mergedConfig);
    }
  }, [broadcastUpdate]);

  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  const isSectionLockedByOther = useCallback((section: DesignSection): boolean => {
    const lock = lockedSections.get(section);
    return lock !== undefined && lock.lockedByUserId !== myUserId;
  }, [lockedSections, myUserId]);

  const getSectionLocker = useCallback((section: DesignSection): DesignSectionLock | undefined => {
    return lockedSections.get(section);
  }, [lockedSections]);

  // -------------------------------------------------------------------------
  // Auto-join session when enabled
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (enabled && galleryId && workspaceId && myUserId && !isCollaborating) {
      joinSession();
    }

    return () => {
      if (isCollaborating) {
        leaveSession();
      }
    };
  }, [enabled, galleryId, workspaceId, myUserId]);

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
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
  // Return
  // -------------------------------------------------------------------------

  return {
    // State
    isCollaborating,
    connectionStatus,
    collaborators,
    myColor,
    myUserId,
    lockedSections,
    myLockedSections,
    conflicts,
    activityFeed,
    version,
    error,

    // Actions
    joinSession,
    leaveSession,
    updateCursor,
    lockSection,
    unlockSection,
    broadcastUpdate,
    setTyping,
    setFocusedSection,
    resolveConflict,

    // Helpers
    isSectionLockedByOther,
    getSectionLocker,
  };
}

export default useDesignStudioCollaboration;
