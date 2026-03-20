/**
 * useProofingWebSocket Hook
 *
 * Specialized WebSocket hook for real-time proofing sync.
 * Connects to the gallery-service WebSocket endpoint and dispatches
 * proofing events (favorites, selections, comments) to registered callbacks.
 *
 * Features:
 * - Filters out own visitor's events (no echo)
 * - Exponential backoff reconnection (1s, 2s, 4s, 8s max)
 * - Auto-connects when enabled (default: true)
 * - Cleans up on unmount
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProofingWebSocketEvent {
  type: 'proofing_update';
  gallery_id: string;
  asset_id: string;
  action: 'favorite' | 'select' | 'comment';
  value: boolean | null;
  visitor_id: string | null;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface UseProofingWebSocketOptions {
  /** Gallery ID to subscribe to */
  galleryId: string;
  /** Current visitor token for echo filtering */
  visitorToken: string | null;
  /** Gallery service base URL (http/https) */
  galleryServiceUrl?: string;
  /** Whether to connect (default: true) */
  enabled?: boolean;
  /** Callback when a favorite toggle event arrives from another visitor */
  onFavoriteToggle?: (event: ProofingWebSocketEvent) => void;
  /** Callback when a selection toggle event arrives from another visitor */
  onSelectionToggle?: (event: ProofingWebSocketEvent) => void;
  /** Callback when a comment is added by another visitor */
  onCommentAdded?: (event: ProofingWebSocketEvent) => void;
}

export interface UseProofingWebSocketReturn {
  /** Whether the WebSocket is currently connected */
  isConnected: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProofingWebSocket(
  options: UseProofingWebSocketOptions,
): UseProofingWebSocketReturn {
  const {
    galleryId,
    visitorToken,
    galleryServiceUrl,
    enabled = true,
    onFavoriteToggle,
    onSelectionToggle,
    onCommentAdded,
  } = options;

  const [isConnected, setIsConnected] = useState(false);

  // Refs to keep callbacks stable without re-triggering effect
  const callbacksRef = useRef({ onFavoriteToggle, onSelectionToggle, onCommentAdded });
  callbacksRef.current = { onFavoriteToggle, onSelectionToggle, onCommentAdded };

  const visitorTokenRef = useRef(visitorToken);
  visitorTokenRef.current = visitorToken;

  const galleryServiceUrlRef = useRef(galleryServiceUrl);
  galleryServiceUrlRef.current = galleryServiceUrl;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    backoffRef.current = INITIAL_BACKOFF_MS;

    if (!enabled || !galleryId) {
      return;
    }

    const buildWsUrl = () => {
      const base = galleryServiceUrlRef.current || (typeof window !== 'undefined' ? window.location.origin : '');
      const wsBase = base.replace(/^http/, 'ws');
      const vt = visitorTokenRef.current;
      const params = vt ? `?visitor_token=${encodeURIComponent(vt)}` : '';
      return `${wsBase}/api/v1/ws/${galleryId}${params}`;
    };

    const connect = () => {
      if (!mountedRef.current) return;

      const url = buildWsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setIsConnected(true);
        // Note: backoff is NOT reset here — it resets only when the effect
        // re-runs (galleryId change) to preserve exponential backoff across
        // rapid disconnect/reconnect cycles.
      };

      ws.onmessage = (ev: MessageEvent) => {
        if (!mountedRef.current) return;

        try {
          const data = JSON.parse(ev.data);

          // Only handle proofing_update events
          if (data.type !== 'proofing_update') return;

          // Filter out own events (no echo)
          if (data.visitor_id && data.visitor_id === visitorTokenRef.current) return;

          const event = data as ProofingWebSocketEvent;
          const cbs = callbacksRef.current;

          switch (event.action) {
            case 'favorite':
              cbs.onFavoriteToggle?.(event);
              break;
            case 'select':
              cbs.onSelectionToggle?.(event);
              break;
            case 'comment':
              cbs.onCommentAdded?.(event);
              break;
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);

        // Schedule reconnect with exponential backoff
        const delay = backoffRef.current;
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);

        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connect();
          }
        }, delay);
      };

      ws.onerror = () => {
        // onerror is always followed by onclose, so reconnect logic is in onclose
      };
    };

    connect();

    return () => {
      mountedRef.current = false;

      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, galleryId]);

  return { isConnected };
}
