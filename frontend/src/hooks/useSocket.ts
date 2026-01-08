/**
 * useSocket Hook
 * Manages WebSocket connection for real-time updates
 * Auto-reconnects on disconnect
 * Handles event subscriptions
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export interface WebSocketEvent {
  type: 'asset:created' | 'asset:processed' | 'asset:deleted' | 'activity:created' | 'connected';
  workspace_id: string;
  gallery_id?: string;
  asset_id?: string;
  status?: string;
  activity?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

export interface UseSocketOptions {
  /** Whether to auto-connect on mount */
  autoConnect?: boolean;
  /** Reconnect delay in milliseconds (exponential backoff) */
  reconnectDelay?: number;
  /** Max reconnect delay in milliseconds */
  maxReconnectDelay?: number;
  /** Event handlers */
  onEvent?: (event: WebSocketEvent) => void;
  /** Connection state change handler */
  onConnectionChange?: (connected: boolean) => void;
}

export interface UseSocketReturn {
  /** WebSocket connection state */
  isConnected: boolean;
  /** Whether connection is connecting */
  isConnecting: boolean;
  /** Last error */
  error: Error | null;
  /** Manually connect */
  connect: () => void;
  /** Manually disconnect */
  disconnect: () => void;
  /** Send message to server */
  send: (data: string | object) => void;
}

/**
 * Hook for managing WebSocket connection
 */
export function useSocket(options: UseSocketOptions = {}): UseSocketReturn {
  const {
    autoConnect = true,
    reconnectDelay = 1000,
    maxReconnectDelay = 30000,
    onEvent,
    onConnectionChange,
  } = options;

  const { workspace } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const currentReconnectDelayRef = useRef(reconnectDelay);
  const shouldReconnectRef = useRef(true);

  // Get WebSocket URL
  const getWebSocketUrl = useCallback(async (): Promise<string | null> => {
    if (!workspace?.workspace_id) {
      return null;
    }

    try {
      // Get access token from storage
      const { getStoredTokens } = await import('../services/tokenStorage');
      const tokens = getStoredTokens();
      const token = tokens?.accessToken;

      if (!token) {
        return null;
      }

      // Use VITE_API_URL if set (even if empty string for relative URLs), otherwise default to localhost for dev
      const apiUrl = import.meta.env.VITE_API_URL !== undefined
        ? import.meta.env.VITE_API_URL
        : window.location.origin; // Use current origin to go through Traefik
      // Convert http/https to ws/wss
      let wsUrl = apiUrl.replace(/^http/, 'ws');
      // If using localhost:8000, keep it for direct connection
      // Otherwise use relative URL or current origin
      if (apiUrl === 'http://localhost:8000') {
        wsUrl = 'ws://localhost:8000';
      } else if (!apiUrl || apiUrl.trim() === '') {
        // Empty string means relative URL - use current origin
        wsUrl = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl += '//' + window.location.host;
      }
      return `${wsUrl}/api/v1/ws?token=${encodeURIComponent(token)}`;
    } catch (err) {
      console.error('Failed to get access token:', err);
      return null;
    }
  }, [workspace?.workspace_id]);

  // Handle WebSocket messages
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as WebSocketEvent;
        onEvent?.(data);

        // Handle connection confirmation
        if (data.type === 'connected') {
          setIsConnected(true);
          setIsConnecting(false);
          setError(null);
          currentReconnectDelayRef.current = reconnectDelay; // Reset reconnect delay
          onConnectionChange?.(true);
        }

        // Dispatch custom events for specific event types
        // This allows components to subscribe via window.addEventListener
        if (data.type === 'activity:created' && data.activity) {
          window.dispatchEvent(
            new CustomEvent('ws:activity:created', {
              detail: { activity: data.activity },
            })
          );
        }

        if (data.type === 'asset:created' && data.asset_id) {
          window.dispatchEvent(
            new CustomEvent('ws:asset:created', {
              detail: { asset_id: data.asset_id, gallery_id: data.gallery_id },
            })
          );
        }

        if (data.type === 'asset:processed' && data.asset_id) {
          window.dispatchEvent(
            new CustomEvent('ws:asset:processed', {
              detail: {
                asset_id: data.asset_id,
                gallery_id: data.gallery_id,
                status: data.status,
              },
            })
          );
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    },
    [onEvent, onConnectionChange, reconnectDelay]
  );

  // Handle WebSocket errors
  const handleError = useCallback(
    (event: Event) => {
      console.error('WebSocket error:', event);
      setError(new Error('WebSocket connection error'));
      setIsConnected(false);
      setIsConnecting(false);
      onConnectionChange?.(false);
    },
    [onConnectionChange]
  );

  // Handle WebSocket close
  const handleClose = useCallback(() => {
    setIsConnected(false);
    setIsConnecting(false);
    onConnectionChange?.(false);

    // Attempt to reconnect if should reconnect
    if (shouldReconnectRef.current && workspace?.workspace_id) {
      const delay = currentReconnectDelayRef.current;
      reconnectTimeoutRef.current = window.setTimeout(() => {
        currentReconnectDelayRef.current = Math.min(
          currentReconnectDelayRef.current * 2,
          maxReconnectDelay
        );
        connect();
      }, delay);
    }
  }, [onConnectionChange, maxReconnectDelay, workspace?.workspace_id]);

  // Connect to WebSocket
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      return; // Already connecting
    }

    const url = await getWebSocketUrl();
    if (!url) {
      setError(new Error('Failed to get WebSocket URL'));
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        // Connection opened, wait for 'connected' message
        setIsConnecting(true);
      };

      ws.onmessage = handleMessage;
      ws.onerror = handleError;
      ws.onclose = handleClose;
    } catch (err) {
      setIsConnecting(false);
      setError(err instanceof Error ? err : new Error('Failed to connect'));
      onConnectionChange?.(false);
    }
  }, [getWebSocketUrl, handleMessage, handleError, handleClose, onConnectionChange]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;

    if (reconnectTimeoutRef.current !== null) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    onConnectionChange?.(false);
  }, [onConnectionChange]);

  // Send message
  const send = useCallback(
    (data: string | object) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        wsRef.current.send(message);
      } else {
        console.warn('WebSocket is not connected');
      }
    },
    []
  );

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && workspace?.workspace_id) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, workspace?.workspace_id]); // Only reconnect if workspace changes

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    send,
  };
}

