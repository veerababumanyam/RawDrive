/**
 * useAlbumCollaboration Hook
 *
 * Manages real-time collaborative album editing via WebSocket.
 * Handles CRDT operations, presence tracking, and conflict resolution.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Album,
  AlbumSpread,
  AlbumSpreadElement,
  AlbumCollaborationSession,
  AlbumCollaboratorPresence,
  AlbumCursorPosition,
  AlbumOperation,
  AlbumOperationType,
  VectorClock,
} from '@rawdrive/shared-types';
import { useAuth } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseAlbumCollaborationOptions {
  /** Album ID */
  albumId: string;
  /** Workspace ID */
  workspaceId: string;
  /** Enable collaboration on mount */
  autoConnect?: boolean;
  /** Debounce time for cursor updates in ms */
  cursorDebounceMs?: number;
}

interface UseAlbumCollaborationReturn {
  /** Whether collaboration is active */
  isCollaborative: boolean;
  /** Connection status */
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  /** Current session */
  session: AlbumCollaborationSession | null;
  /** Active collaborators */
  collaborators: AlbumCollaboratorPresence[];
  /** Current user's assigned color */
  myColor: string;
  /** Current Lamport timestamp */
  lamportClock: number;
  /** Vector clock */
  vectorClock: VectorClock;
  /** Start collaboration */
  startCollaboration: () => Promise<void>;
  /** Stop collaboration */
  stopCollaboration: () => void;
  /** Apply a local operation */
  applyOperation: (
    operationType: AlbumOperationType,
    targetId: string,
    targetType: 'album' | 'spread' | 'element',
    data: Record<string, unknown>
  ) => Promise<void>;
  /** Update cursor position */
  updateCursor: (position: AlbumCursorPosition) => void;
  /** Update selection */
  updateSelection: (elementIds: string[]) => void;
  /** Undo stack */
  undoStack: AlbumOperation[];
  /** Redo stack */
  redoStack: AlbumOperation[];
  /** Undo last operation */
  undo: () => void;
  /** Redo last undone operation */
  redo: () => void;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLLABORATOR_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAlbumCollaboration({
  albumId,
  workspaceId,
  autoConnect = false,
  cursorDebounceMs = 50,
}: UseAlbumCollaborationOptions): UseAlbumCollaborationReturn {
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // State
  const [isCollaborative, setIsCollaborative] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [session, setSession] = useState<AlbumCollaborationSession | null>(null);
  const [collaborators, setCollaborators] = useState<AlbumCollaboratorPresence[]>([]);
  const [myColor, setMyColor] = useState(COLLABORATOR_COLORS[0]);
  const [lamportClock, setLamportClock] = useState(0);
  const [vectorClock, setVectorClock] = useState<VectorClock>({});
  const [undoStack, setUndoStack] = useState<AlbumOperation[]>([]);
  const [redoStack, setRedoStack] = useState<AlbumOperation[]>([]);

  // Increment Lamport clock
  const incrementLamportClock = useCallback(() => {
    setLamportClock((prev) => prev + 1);
    return lamportClock + 1;
  }, [lamportClock]);

  // Update vector clock
  const updateVectorClock = useCallback((userId: string) => {
    setVectorClock((prev) => ({
      ...prev,
      [userId]: (prev[userId] || 0) + 1,
    }));
  }, []);

  // Merge vector clocks
  const mergeVectorClock = useCallback((remoteClock: VectorClock) => {
    setVectorClock((prev) => {
      const merged = { ...prev };
      for (const [userId, timestamp] of Object.entries(remoteClock)) {
        merged[userId] = Math.max(merged[userId] || 0, timestamp);
      }
      return merged;
    });
  }, []);

  // Connect WebSocket
  const connectWebSocket = useCallback(async () => {
    if (!user?.id || wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus('connecting');

    try {
      // Get collaboration session and token
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/albums/${albumId}/collaboration/session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create collaboration session');
      }

      const { session: newSession, websocket_url, token } = await response.json();

      // Connect to WebSocket
      const ws = new WebSocket(`${websocket_url}?token=${token}`);

      ws.onopen = () => {
        setConnectionStatus('connected');
        setSession(newSession);
        setIsCollaborative(true);

        // Send join message
        ws.send(JSON.stringify({
          type: 'album:join',
          session_id: newSession.id,
          album_id: albumId,
          user_id: user.id,
          timestamp: new Date().toISOString(),
        }));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        wsRef.current = null;

        // Attempt reconnect after 3 seconds
        if (isCollaborative) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('disconnected');
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to connect:', error);
      setConnectionStatus('disconnected');
    }
  }, [albumId, workspaceId, user?.id, isCollaborative]);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((message: Record<string, unknown>) => {
    const type = message.type as string;

    switch (type) {
      case 'album:session_joined': {
        const assignedColor = message.your_color as string;
        setMyColor(assignedColor);
        setCollaborators(message.session?.participants as AlbumCollaboratorPresence[] || []);
        break;
      }

      case 'album:presence': {
        const collaborator = message.collaborator as AlbumCollaboratorPresence;
        const event = message.event as string;

        if (event === 'joined') {
          setCollaborators((prev) => [...prev.filter((c) => c.user_id !== collaborator.user_id), collaborator]);
        } else if (event === 'left') {
          setCollaborators((prev) => prev.filter((c) => c.user_id !== collaborator.user_id));
        } else if (event === 'updated') {
          setCollaborators((prev) =>
            prev.map((c) => (c.user_id === collaborator.user_id ? collaborator : c))
          );
        }
        break;
      }

      case 'album:cursor': {
        const userId = message.user_id as string;
        const cursor = message.cursor as AlbumCursorPosition;

        setCollaborators((prev) =>
          prev.map((c) =>
            c.user_id === userId ? { ...c, cursor } : c
          )
        );
        break;
      }

      case 'album:operation': {
        const operation = message.operation as AlbumOperation;
        const remoteLamport = operation.lamport_timestamp;
        const remoteClock = operation.vector_clock;

        // Update clocks
        setLamportClock((prev) => Math.max(prev, remoteLamport) + 1);
        mergeVectorClock(remoteClock);

        // Apply operation (this would update the album state in the parent component)
        // The parent component should listen to an event or callback to apply changes
        window.dispatchEvent(new CustomEvent('album:operation', { detail: operation }));
        break;
      }

      case 'album:operation_ack': {
        const success = message.success as boolean;
        const newLamport = message.new_lamport_timestamp as number;

        if (success) {
          setLamportClock(newLamport);
        }
        break;
      }

      case 'album:version_created':
      case 'album:version_restored': {
        // Notify parent of version change
        window.dispatchEvent(new CustomEvent('album:version', { detail: message }));
        break;
      }

      case 'album:comment_added':
      case 'album:comment_resolved':
      case 'album:comment_mention': {
        // Notify parent of comment events
        window.dispatchEvent(new CustomEvent('album:comment', { detail: message }));
        break;
      }
    }
  }, [mergeVectorClock]);

  // Start collaboration
  const startCollaboration = useCallback(async () => {
    setIsCollaborative(true);
    await connectWebSocket();
  }, [connectWebSocket]);

  // Stop collaboration
  const stopCollaboration = useCallback(() => {
    setIsCollaborative(false);

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (wsRef.current) {
      // Send leave message
      if (wsRef.current.readyState === WebSocket.OPEN && session) {
        wsRef.current.send(JSON.stringify({
          type: 'album:leave',
          session_id: session.id,
          album_id: albumId,
          user_id: user?.id,
          timestamp: new Date().toISOString(),
        }));
      }

      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionStatus('disconnected');
    setSession(null);
    setCollaborators([]);
  }, [albumId, session, user?.id]);

  // Apply a local operation
  const applyOperation = useCallback(async (
    operationType: AlbumOperationType,
    targetId: string,
    targetType: 'album' | 'spread' | 'element',
    data: Record<string, unknown>
  ) => {
    const newLamport = incrementLamportClock();
    if (user?.id) {
      updateVectorClock(user.id);
    }

    const operation: Partial<AlbumOperation> = {
      operation_type: operationType,
      target_id: targetId,
      target_type: targetType,
      data,
      lamport_timestamp: newLamport,
      vector_clock: vectorClock,
      user_id: user?.id,
      is_undo: false,
    };

    // Add to undo stack
    setUndoStack((prev) => [...prev, operation as AlbumOperation]);
    setRedoStack([]);

    // Send via WebSocket if connected
    if (wsRef.current?.readyState === WebSocket.OPEN && session) {
      wsRef.current.send(JSON.stringify({
        type: 'album:operation',
        session_id: session.id,
        album_id: albumId,
        operation,
        timestamp: new Date().toISOString(),
      }));
    }
  }, [albumId, incrementLamportClock, session, updateVectorClock, user?.id, vectorClock]);

  // Update cursor position (debounced)
  const updateCursor = useCallback((position: AlbumCursorPosition) => {
    if (cursorDebounceRef.current) {
      clearTimeout(cursorDebounceRef.current);
    }

    cursorDebounceRef.current = setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN && session) {
        wsRef.current.send(JSON.stringify({
          type: 'album:cursor',
          session_id: session.id,
          album_id: albumId,
          user_id: user?.id,
          cursor: position,
          timestamp: new Date().toISOString(),
        }));
      }
    }, cursorDebounceMs);
  }, [albumId, cursorDebounceMs, session, user?.id]);

  // Update selection
  const updateSelection = useCallback((elementIds: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && session) {
      wsRef.current.send(JSON.stringify({
        type: 'album:selection',
        session_id: session.id,
        album_id: albumId,
        user_id: user?.id,
        selection: elementIds,
        timestamp: new Date().toISOString(),
      }));
    }
  }, [albumId, session, user?.id]);

  // Undo
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;

    const lastOperation = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, lastOperation]);

    // Create reverse operation
    const reverseOperation: Partial<AlbumOperation> = {
      ...lastOperation,
      is_undo: true,
      lamport_timestamp: incrementLamportClock(),
    };

    // Send via WebSocket
    if (wsRef.current?.readyState === WebSocket.OPEN && session) {
      wsRef.current.send(JSON.stringify({
        type: 'album:operation',
        session_id: session.id,
        album_id: albumId,
        operation: reverseOperation,
        timestamp: new Date().toISOString(),
      }));
    }

    // Notify parent to apply undo
    window.dispatchEvent(new CustomEvent('album:undo', { detail: lastOperation }));
  }, [albumId, incrementLamportClock, session, undoStack]);

  // Redo
  const redo = useCallback(() => {
    if (redoStack.length === 0) return;

    const lastOperation = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, lastOperation]);

    // Reapply operation
    const reOperation: Partial<AlbumOperation> = {
      ...lastOperation,
      lamport_timestamp: incrementLamportClock(),
    };

    // Send via WebSocket
    if (wsRef.current?.readyState === WebSocket.OPEN && session) {
      wsRef.current.send(JSON.stringify({
        type: 'album:operation',
        session_id: session.id,
        album_id: albumId,
        operation: reOperation,
        timestamp: new Date().toISOString(),
      }));
    }

    // Notify parent to apply redo
    window.dispatchEvent(new CustomEvent('album:redo', { detail: lastOperation }));
  }, [albumId, incrementLamportClock, redoStack, session]);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect) {
      startCollaboration();
    }

    return () => {
      stopCollaboration();
    };
  }, [autoConnect]); // Intentionally not including startCollaboration/stopCollaboration to avoid re-triggering

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cursorDebounceRef.current) {
        clearTimeout(cursorDebounceRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return {
    isCollaborative,
    connectionStatus,
    session,
    collaborators,
    myColor,
    lamportClock,
    vectorClock,
    startCollaboration,
    stopCollaboration,
    applyOperation,
    updateCursor,
    updateSelection,
    undoStack,
    redoStack,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
}

export default useAlbumCollaboration;
