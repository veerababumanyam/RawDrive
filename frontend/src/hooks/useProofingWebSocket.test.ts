/**
 * Tests for useProofingWebSocket hook.
 *
 * Verifies:
 * - WebSocket connection with correct URL
 * - Event callback registration and invocation
 * - Own-event filtering (no echo)
 * - Reconnect with exponential backoff
 * - Cleanup on unmount
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProofingWebSocket } from './useProofingWebSocket';
import type { ProofingWebSocketEvent } from './useProofingWebSocket';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState: number = WebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  close = vi.fn(() => {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  });
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = WebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: ProofingWebSocketEvent) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }

  simulateClose() {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }

  simulateError() {
    this.onerror?.(new Event('error'));
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useProofingWebSocket', () => {
  const defaultProps = {
    galleryId: 'gallery-123',
    visitorToken: 'visitor-abc',
    galleryServiceUrl: 'http://localhost:8004',
  };

  it('connects to the correct WebSocket URL', () => {
    renderHook(() => useProofingWebSocket(defaultProps));

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe(
      'ws://localhost:8004/api/v1/ws/gallery-123?visitor_token=visitor-abc'
    );
  });

  it('converts https URL to wss', () => {
    renderHook(() =>
      useProofingWebSocket({
        ...defaultProps,
        galleryServiceUrl: 'https://gallery.rawdrive.io',
      })
    );

    expect(MockWebSocket.instances[0].url).toContain('wss://gallery.rawdrive.io');
  });

  it('does not connect when enabled=false', () => {
    renderHook(() =>
      useProofingWebSocket({ ...defaultProps, enabled: false })
    );

    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('reports isConnected after open', () => {
    const { result } = renderHook(() => useProofingWebSocket(defaultProps));

    expect(result.current.isConnected).toBe(false);

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('invokes onFavoriteToggle callback for favorite events', () => {
    const onFavoriteToggle = vi.fn();
    renderHook(() =>
      useProofingWebSocket({ ...defaultProps, onFavoriteToggle })
    );

    act(() => MockWebSocket.instances[0].simulateOpen());

    const event: ProofingWebSocketEvent = {
      type: 'proofing_update',
      gallery_id: 'gallery-123',
      asset_id: 'asset-1',
      action: 'favorite',
      value: true,
      visitor_id: 'other-visitor',
      timestamp: new Date().toISOString(),
    };

    act(() => MockWebSocket.instances[0].simulateMessage(event));

    expect(onFavoriteToggle).toHaveBeenCalledWith(event);
  });

  it('invokes onSelectionToggle callback for selection events', () => {
    const onSelectionToggle = vi.fn();
    renderHook(() =>
      useProofingWebSocket({ ...defaultProps, onSelectionToggle })
    );

    act(() => MockWebSocket.instances[0].simulateOpen());

    const event: ProofingWebSocketEvent = {
      type: 'proofing_update',
      gallery_id: 'gallery-123',
      asset_id: 'asset-2',
      action: 'select',
      value: true,
      visitor_id: 'other-visitor',
      timestamp: new Date().toISOString(),
    };

    act(() => MockWebSocket.instances[0].simulateMessage(event));

    expect(onSelectionToggle).toHaveBeenCalledWith(event);
  });

  it('invokes onCommentAdded callback for comment events', () => {
    const onCommentAdded = vi.fn();
    renderHook(() =>
      useProofingWebSocket({ ...defaultProps, onCommentAdded })
    );

    act(() => MockWebSocket.instances[0].simulateOpen());

    const event: ProofingWebSocketEvent = {
      type: 'proofing_update',
      gallery_id: 'gallery-123',
      asset_id: 'asset-3',
      action: 'comment',
      value: null,
      visitor_id: 'other-visitor',
      data: { comment_id: 'c1', comment: 'Nice!', visitor_name: 'Jane' },
      timestamp: new Date().toISOString(),
    };

    act(() => MockWebSocket.instances[0].simulateMessage(event));

    expect(onCommentAdded).toHaveBeenCalledWith(event);
  });

  it('filters out events from own visitor (no echo)', () => {
    const onFavoriteToggle = vi.fn();
    renderHook(() =>
      useProofingWebSocket({
        ...defaultProps,
        visitorToken: 'my-visitor',
        onFavoriteToggle,
      })
    );

    act(() => MockWebSocket.instances[0].simulateOpen());

    // Event from OWN visitor
    const ownEvent: ProofingWebSocketEvent = {
      type: 'proofing_update',
      gallery_id: 'gallery-123',
      asset_id: 'asset-1',
      action: 'favorite',
      value: true,
      visitor_id: 'my-visitor',
      timestamp: new Date().toISOString(),
    };

    act(() => MockWebSocket.instances[0].simulateMessage(ownEvent));

    expect(onFavoriteToggle).not.toHaveBeenCalled();
  });

  it('reconnects with exponential backoff on close', () => {
    renderHook(() => useProofingWebSocket(defaultProps));

    const initialCount = MockWebSocket.instances.length;
    expect(initialCount).toBeGreaterThanOrEqual(1);

    const ws1 = MockWebSocket.instances[initialCount - 1];

    // Simulate open then close
    act(() => ws1.simulateOpen());
    const countAfterOpen = MockWebSocket.instances.length;

    act(() => ws1.simulateClose());

    // No reconnect yet (backoff = 1s)
    expect(MockWebSocket.instances.length).toBe(countAfterOpen);

    // Advance 1s (first backoff) - should create a new WS
    act(() => vi.advanceTimersByTime(1000));
    const countAfterFirst = MockWebSocket.instances.length;
    expect(countAfterFirst).toBe(countAfterOpen + 1);

    // Second close - backoff should now be 2s
    const ws2 = MockWebSocket.instances[countAfterFirst - 1];
    act(() => ws2.simulateOpen());
    act(() => ws2.simulateClose());

    // Advance 1s - should NOT reconnect yet (backoff = 2s)
    act(() => vi.advanceTimersByTime(1000));
    const countAfter1s = MockWebSocket.instances.length;

    // Advance another 1s (total 2s) - NOW should reconnect
    act(() => vi.advanceTimersByTime(1000));
    expect(MockWebSocket.instances.length).toBe(countAfter1s + 1);
  });

  it('caps backoff at 8 seconds', () => {
    renderHook(() => useProofingWebSocket(defaultProps));

    // Close and reconnect 4 times to reach cap (1s, 2s, 4s, 8s)
    for (let i = 0; i < 4; i++) {
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      act(() => ws.simulateOpen());
      act(() => ws.simulateClose());
      act(() => vi.advanceTimersByTime(8000));
    }

    // 5th disconnect: backoff should still be 8s (capped), not 16s
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => ws.simulateOpen());
    act(() => ws.simulateClose());

    const countBefore = MockWebSocket.instances.length;
    act(() => vi.advanceTimersByTime(8000));
    expect(MockWebSocket.instances.length).toBe(countBefore + 1);
  });

  it('cleans up WebSocket on unmount', () => {
    const { unmount } = renderHook(() => useProofingWebSocket(defaultProps));

    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());

    unmount();

    expect(ws.close).toHaveBeenCalled();
  });

  it('does not invoke callbacks for non-proofing messages', () => {
    const onFavoriteToggle = vi.fn();
    renderHook(() =>
      useProofingWebSocket({ ...defaultProps, onFavoriteToggle })
    );

    act(() => MockWebSocket.instances[0].simulateOpen());

    // Non-proofing message (viewer_count, heartbeat, etc.)
    const nonProofing = { type: 'viewer_count', gallery_id: 'gallery-123', count: 5 };
    act(() => {
      MockWebSocket.instances[0].onmessage?.(
        new MessageEvent('message', { data: JSON.stringify(nonProofing) })
      );
    });

    expect(onFavoriteToggle).not.toHaveBeenCalled();
  });
});
