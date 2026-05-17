import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useAssetReadySubscription } from "../use-asset-ready-subscription";

// ─────────────────────── EventSource test double ──────────────────────
// jsdom doesn't ship an EventSource implementation. We provide a minimal
// fake that records URL + listeners, and exposes test helpers to fire
// "asset" events with a JSON payload. Closing semantics mirror the real
// browser EventSource so we can assert teardown.

interface FakeEventSourceMethods {
  url: string;
  listeners: Map<string, ((evt: MessageEvent) => void)[]>;
  closed: boolean;
  addEventListener: (type: string, fn: (evt: MessageEvent) => void) => void;
  removeEventListener: (type: string, fn: (evt: MessageEvent) => void) => void;
  close: () => void;
  onerror: ((this: EventSource, ev: Event) => unknown) | null;
}

let lastEventSource: FakeEventSourceMethods | null = null;
let openCount = 0;

class FakeEventSource {
  url: string;
  listeners = new Map<string, ((evt: MessageEvent) => void)[]>();
  closed = false;
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;

  constructor(url: string) {
    this.url = url;
    openCount += 1;
    lastEventSource = this as unknown as FakeEventSourceMethods;
  }

  addEventListener(type: string, fn: EventListener) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn as unknown as (evt: MessageEvent) => void);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, fn: EventListener) {
    const list = this.listeners.get(type);
    if (!list) return;
    this.listeners.set(
      type,
      list.filter((f) => f !== (fn as unknown as (evt: MessageEvent) => void)),
    );
  }

  close() {
    this.closed = true;
  }
}

function fireAssetReady(payload: unknown) {
  if (!lastEventSource) throw new Error("no EventSource was opened");
  const listeners = lastEventSource.listeners.get("asset") ?? [];
  const evt = { data: JSON.stringify(payload) } as MessageEvent;
  for (const fn of listeners) fn(evt);
}

beforeEach(() => {
  openCount = 0;
  lastEventSource = null;
  // @ts-expect-error — installing the fake on the global for the hook
  globalThis.EventSource = FakeEventSource;
});

afterEach(() => {
  // @ts-expect-error — cleanup
  delete globalThis.EventSource;
  vi.restoreAllMocks();
});

describe("useAssetReadySubscription", () => {
  // ─────────────────── connection lifecycle ───────────────────

  it("opens an SSE connection only when there is at least one pending asset", () => {
    const onReady = vi.fn();
    const { rerender } = renderHook(
      ({ ids }: { ids: string[] }) =>
        useAssetReadySubscription({
          apiBase: "http://localhost:8081",
          token: "jwt-token",
          pendingAssetIds: ids,
          onAssetReady: onReady,
        }),
      { initialProps: { ids: [] as string[] } },
    );

    expect(openCount).toBe(0);
    expect(lastEventSource).toBeNull();

    rerender({ ids: ["asset-1"] });
    expect(openCount).toBe(1);
    expect(lastEventSource?.url).toMatch(/\/api\/v1\/events\/stream\?/);
    expect(lastEventSource?.url).toMatch(/channels=asset.ready/);
    expect(lastEventSource?.url).toMatch(/token=jwt-token/);
  });

  it("does NOT reconnect when the pending set changes (refs hold the snapshot)", () => {
    // Critical anti-flapping invariant. During a batch upload of 50 photos
    // the pending set churns as each worker callback fires. We must NOT
    // tear down and re-establish the EventSource on every churn — that
    // would create reconnection storms and miss events landing in the gap.
    const { rerender } = renderHook(
      ({ ids }: { ids: string[] }) =>
        useAssetReadySubscription({
          apiBase: "http://localhost:8081",
          token: "jwt-token",
          pendingAssetIds: ids,
          onAssetReady: () => {},
        }),
      { initialProps: { ids: ["a", "b", "c"] as string[] } },
    );
    expect(openCount).toBe(1);

    rerender({ ids: ["b", "c"] });
    expect(openCount).toBe(1);
    rerender({ ids: ["c"] });
    expect(openCount).toBe(1);
    expect(lastEventSource?.closed).toBe(false);
  });

  it("closes the connection when the pending set drains to empty", () => {
    const { rerender } = renderHook(
      ({ ids }: { ids: string[] }) =>
        useAssetReadySubscription({
          apiBase: "http://localhost:8081",
          token: "jwt-token",
          pendingAssetIds: ids,
          onAssetReady: () => {},
        }),
      { initialProps: { ids: ["asset-1"] as string[] } },
    );
    expect(lastEventSource?.closed).toBe(false);

    rerender({ ids: [] });
    expect(lastEventSource?.closed).toBe(true);
  });

  it("does not open a connection without a token (skips on unauthed render)", () => {
    renderHook(() =>
      useAssetReadySubscription({
        apiBase: "http://localhost:8081",
        token: null,
        pendingAssetIds: ["asset-1"],
        onAssetReady: () => {},
      }),
    );
    expect(openCount).toBe(0);
  });

  // ─────────────────── event handling ───────────────────

  it("invokes onAssetReady for events whose asset_id is in the pending set", () => {
    const onReady = vi.fn();
    renderHook(() =>
      useAssetReadySubscription({
        apiBase: "http://localhost:8081",
        token: "jwt-token",
        pendingAssetIds: ["asset-1", "asset-2"],
        onAssetReady: onReady,
      }),
    );

    act(() => {
      fireAssetReady({ asset_id: "asset-1", workspace_id: "ws-1" });
    });
    expect(onReady).toHaveBeenCalledExactlyOnceWith("asset-1");
  });

  it("ignores events for assets NOT in the pending set", () => {
    // Other tabs/users uploading in parallel publish asset.ready events
    // on the same global channel. The hook must filter — we only act on
    // assets the current gallery is waiting on.
    const onReady = vi.fn();
    renderHook(() =>
      useAssetReadySubscription({
        apiBase: "http://localhost:8081",
        token: "jwt-token",
        pendingAssetIds: ["asset-1"],
        onAssetReady: onReady,
      }),
    );

    act(() => {
      fireAssetReady({ asset_id: "different-gallery-asset", workspace_id: "ws-1" });
    });
    expect(onReady).not.toHaveBeenCalled();
  });

  it("ignores events with malformed JSON payloads (defensive)", () => {
    const onReady = vi.fn();
    renderHook(() =>
      useAssetReadySubscription({
        apiBase: "http://localhost:8081",
        token: "jwt-token",
        pendingAssetIds: ["asset-1"],
        onAssetReady: onReady,
      }),
    );
    const listeners = lastEventSource?.listeners.get("asset") ?? [];
    act(() => {
      for (const fn of listeners) fn({ data: "{not-json" } as MessageEvent);
    });
    expect(onReady).not.toHaveBeenCalled();
  });

  it("URL-encodes the token (handles tokens containing reserved chars)", () => {
    // JWT body uses base64url, but the signature portion can include +
    // and / in some libs. We must not break SSE auth on those tokens.
    renderHook(() =>
      useAssetReadySubscription({
        apiBase: "http://localhost:8081",
        token: "abc/def+ghi=",
        pendingAssetIds: ["asset-1"],
        onAssetReady: () => {},
      }),
    );
    expect(lastEventSource?.url).toContain("token=abc%2Fdef%2Bghi%3D");
  });
});
