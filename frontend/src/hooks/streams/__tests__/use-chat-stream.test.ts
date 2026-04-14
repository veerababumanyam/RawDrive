/**
 * useChatStream tests — story 35-3 R4.
 *
 * Verifies the SSE client wiring: connects to the public state stream with the
 * viewer JWT, parses chat events, exposes a `lastEventId` for resume-on-reconnect,
 * tears down on unmount, and reconnects with exponential backoff.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useChatStream } from "../useChatStream";

type Listener = (ev: MessageEvent) => void;

class MockEventSource {
  static last: MockEventSource | null = null;
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials = false;
  readyState = 0;
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  listeners = new Map<string, Set<Listener>>();
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.last = this;
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }
  removeEventListener(type: string, cb: Listener) {
    this.listeners.get(type)?.delete(cb);
  }
  emit(type: string, data: unknown, lastEventId = "") {
    const ev = new MessageEvent(type, { data: JSON.stringify(data), lastEventId });
    this.listeners.get(type)?.forEach((cb) => cb(ev));
  }
  fireError() {
    this.onerror?.(new Event("error"));
  }
  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
}

describe("useChatStream", () => {
  beforeEach(() => {
    MockEventSource.last = null;
    MockEventSource.instances = [];
    sessionStorage.clear();
    sessionStorage.setItem(
      "rd:viewer:s1",
      JSON.stringify({
        access_token: "tok-abc",
        refresh_token: "r",
        expires_in: 900,
        token_type: "Bearer",
        saved_at: Date.now(),
      }),
    );
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("connects to the public state stream with the viewer JWT in the query", () => {
    renderHook(() => useChatStream("s1"));
    expect(MockEventSource.last).not.toBeNull();
    expect(MockEventSource.last!.url).toMatch(
      /\/api\/v1\/public\/streams\/s1\/state\?access_token=tok-abc/,
    );
  });

  it("filters and appends chat_new events into messages, ignoring non-chat", async () => {
    const { result } = renderHook(() => useChatStream("s1"));
    const es = MockEventSource.last!;
    act(() => {
      es.open();
      es.emit(
        "chat_new",
        { id: "m1", body: "hello", viewer_id: "v1", viewer_name: "Aki", created_at: "2026-04-14T10:00:00Z" },
        "evt-1",
      );
      es.emit("viewer_count", { current: 5 }, "evt-2");
      es.emit(
        "chat_new",
        { id: "m2", body: "hi back", viewer_id: "v2", viewer_name: "Bo", created_at: "2026-04-14T10:00:01Z" },
        "evt-3",
      );
    });
    await waitFor(() => expect(result.current.messages.length).toBe(2));
    expect(result.current.messages[0].id).toBe("m1");
    expect(result.current.messages[1].body).toBe("hi back");
    expect(result.current.connectionState).toBe("open");
    expect(result.current.lastEventId).toBe("evt-3");
  });

  it("removes a message when chat_moderation delete event arrives", async () => {
    const { result } = renderHook(() => useChatStream("s1"));
    const es = MockEventSource.last!;
    act(() => {
      es.open();
      es.emit("chat_new", { id: "m1", body: "spam", viewer_id: "v1", viewer_name: "X", created_at: "x" }, "1");
    });
    await waitFor(() => expect(result.current.messages.length).toBe(1));
    act(() => {
      es.emit("chat_moderation", { msg_id: "m1", action: "delete" }, "2");
    });
    await waitFor(() => expect(result.current.messages.length).toBe(0));
  });

  it("reconnects on error with backoff and reuses the last event id", async () => {
    vi.useFakeTimers();
    renderHook(() => useChatStream("s1"));
    const first = MockEventSource.last!;
    act(() => {
      first.open();
      first.emit("chat_new", { id: "m1", body: "a", viewer_id: "v", viewer_name: "n", created_at: "x" }, "evt-99");
      first.fireError();
    });
    expect(first.closed).toBe(true);
    // Backoff timer (>=500ms) before reconnect.
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(MockEventSource.instances.length).toBeGreaterThanOrEqual(2);
    const second = MockEventSource.last!;
    // Second connection should carry Last-Event-ID hint either via header (not
    // possible with EventSource) or via query param fallback.
    expect(second.url).toMatch(/last_event_id=evt-99/);
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = renderHook(() => useChatStream("s1"));
    const es = MockEventSource.last!;
    unmount();
    expect(es.closed).toBe(true);
  });
});
