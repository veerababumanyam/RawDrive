/**
 * useChatStream tests — story 35-3 R4.
 *
 * Verifies the SSE client wiring: connects to the public state stream with the
 * viewer JWT in the Authorization header, parses chat events, exposes a
 * `lastEventId` for resume-on-reconnect, tears down on unmount, and reconnects
 * with exponential backoff.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useChatStream } from "../useChatStream";

type StreamRequest = {
  url: string;
  init: RequestInit;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

const encoder = new TextEncoder();
let requests: StreamRequest[] = [];

async function flushMicrotasks(turns = 3) {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve();
  }
}

function headersFor(init: RequestInit): Headers {
  return new Headers(init.headers);
}

function installStreamFetch() {
  const fetchMock = vi.fn(
    (url: string | URL | Request, init: RequestInit = {}) => {
      let controllerRef: ReadableStreamDefaultController<Uint8Array> | null =
        null;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controllerRef = controller;
        },
      });
      if (!controllerRef)
        throw new Error("stream controller was not initialized");
      requests.push({
        url: String(url),
        init,
        controller: controllerRef,
      });
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function emit(
  req: StreamRequest,
  type: string,
  data: unknown,
  lastEventId = "",
) {
  const idLine = lastEventId ? `id: ${lastEventId}\n` : "";
  req.controller.enqueue(
    encoder.encode(
      `${idLine}event: ${type}\ndata: ${JSON.stringify(data)}\n\n`,
    ),
  );
}

describe("useChatStream", () => {
  beforeEach(() => {
    requests = [];
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
    installStreamFetch();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("connects to the public state stream with the viewer JWT in Authorization, not the URL", async () => {
    const { result } = renderHook(() => useChatStream("s1"));

    await waitFor(() => expect(requests.length).toBe(1));
    const req = requests[0];
    expect(req.url).toBe("/api/v1/public/streams/s1/state");
    expect(req.url).not.toContain("access_token=");
    expect(headersFor(req.init).get("Authorization")).toBe("Bearer tok-abc");
    await waitFor(() => expect(result.current.connectionState).toBe("open"));
  });

  it("filters and appends chat_new events into messages, ignoring non-chat", async () => {
    const { result } = renderHook(() => useChatStream("s1"));
    await waitFor(() => expect(requests.length).toBe(1));

    act(() => {
      emit(
        requests[0],
        "chat_new",
        {
          id: "m1",
          body: "hello",
          viewer_id: "v1",
          viewer_name: "Aki",
          created_at: "2026-04-14T10:00:00Z",
        },
        "evt-1",
      );
      emit(requests[0], "viewer_count", { current: 5 }, "evt-2");
      emit(
        requests[0],
        "chat_new",
        {
          id: "m2",
          body: "hi back",
          viewer_id: "v2",
          viewer_name: "Bo",
          created_at: "2026-04-14T10:00:01Z",
        },
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
    await waitFor(() => expect(requests.length).toBe(1));

    act(() => {
      emit(
        requests[0],
        "chat_new",
        {
          id: "m1",
          body: "spam",
          viewer_id: "v1",
          viewer_name: "X",
          created_at: "x",
        },
        "1",
      );
    });
    await waitFor(() => expect(result.current.messages.length).toBe(1));

    act(() => {
      emit(
        requests[0],
        "chat_moderation",
        { msg_id: "m1", action: "delete" },
        "2",
      );
    });
    await waitFor(() => expect(result.current.messages.length).toBe(0));
  });

  it("reconnects on error with backoff and reuses the last event id header", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { result } = renderHook(() => useChatStream("s1"));
    await act(async () => {
      await flushMicrotasks();
    });
    expect(requests.length).toBe(1);

    act(() => {
      emit(
        requests[0],
        "chat_new",
        {
          id: "m1",
          body: "a",
          viewer_id: "v",
          viewer_name: "n",
          created_at: "x",
        },
        "evt-99",
      );
    });
    await act(async () => {
      await flushMicrotasks();
    });
    expect(result.current.lastEventId).toBe("evt-99");

    act(() => {
      requests[0].controller.error(new Error("drop"));
    });
    await act(async () => {
      await flushMicrotasks();
    });
    expect(result.current.connectionState).toBe("reconnecting");

    await act(async () => {
      vi.advanceTimersByTime(500);
      await flushMicrotasks();
    });

    expect(requests.length).toBeGreaterThanOrEqual(2);
    expect(headersFor(requests[1].init).get("Last-Event-ID")).toBe("evt-99");
    expect(requests[1].url).not.toContain("access_token=");
  });

  it("aborts the stream on unmount", async () => {
    const { unmount } = renderHook(() => useChatStream("s1"));
    await waitFor(() => expect(requests.length).toBe(1));
    const signal = requests[0].init.signal as AbortSignal;

    unmount();

    expect(signal.aborted).toBe(true);
  });
});
