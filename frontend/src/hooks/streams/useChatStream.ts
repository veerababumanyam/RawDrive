"use client";

/**
 * useChatStream — story 35-3 R4.
 *
 * SSE consumer for the public viewer state stream. Connects with fetch so the
 * viewer JWT stays in the Authorization header instead of the URL, then
 * surfaces the chat-channel slice (chat_new + chat_moderation events) as a
 * locally-buffered list. The viewer JWT is read from sessionStorage via the
 * 35-1 helper. Reconnects on error with exponential backoff and replays from
 * the last seen event id via Last-Event-ID.
 */

import { useEffect, useRef, useState } from "react";
import type {
  ChatMessage,
  ModerationAction,
} from "@/components/streams/live/ChatModeratorPanel";
import { loadViewerSession } from "@/lib/viewer/session";

type ConnState = "connecting" | "open" | "reconnecting" | "closed";

type ParsedSSEEvent = {
  event: string;
  data: string;
  id: string;
};

async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ParsedSSEEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventType = "message";
  let eventId = "";
  let dataLines: string[] = [];

  const dispatch = () => {
    if (dataLines.length === 0) {
      eventType = "message";
      eventId = "";
      return;
    }
    onEvent({
      event: eventType || "message",
      data: dataLines.join("\n"),
      id: eventId,
    });
    eventType = "message";
    eventId = "";
    dataLines = [];
  };

  const processLine = (line: string) => {
    if (line === "") {
      dispatch();
      return;
    }
    if (line.startsWith(":")) return;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    switch (field) {
      case "event":
        eventType = value;
        break;
      case "data":
        dataLines.push(value);
        break;
      case "id":
        eventId = value;
        break;
      default:
        break;
    }
  };

  const drain = (flush = false) => {
    for (;;) {
      const match = buffer.match(/\r\n|\r|\n/);
      if (!match || match.index === undefined) break;
      const line = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      processLine(line);
    }
    if (flush && buffer) {
      processLine(buffer);
      buffer = "";
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    drain();
  }
  buffer += decoder.decode();
  drain(true);
}

export function useChatStream(streamId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [slowModeSeconds, setSlowModeSeconds] = useState<number>(0);
  const [connectionState, setConnectionState] =
    useState<ConnState>("connecting");
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  const lastEventIdRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    if (!streamId) return;
    unmountedRef.current = false;

    function buildUrl(): string {
      return `/api/v1/public/streams/${encodeURIComponent(streamId)}/state`;
    }

    const trackEventId = (id: string) => {
      if (id) {
        lastEventIdRef.current = id;
        setLastEventId(id);
      }
    };

    const handleStreamEvent = (ev: ParsedSSEEvent) => {
      trackEventId(ev.id);
      switch (ev.event) {
        case "chat_new":
          try {
            const msg = JSON.parse(ev.data) as ChatMessage;
            setMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
            );
          } catch {
            /* malformed payload — drop */
          }
          break;
        case "chat_moderation":
          try {
            const { msg_id, action } = JSON.parse(ev.data) as {
              msg_id: string;
              action: string;
            };
            if (action === "delete") {
              setMessages((prev) => prev.filter((m) => m.id !== msg_id));
            }
          } catch {
            /* malformed — drop */
          }
          break;
        case "slow_mode":
          try {
            const { seconds } = JSON.parse(ev.data) as { seconds: number };
            if (Number.isFinite(seconds) && seconds >= 0)
              setSlowModeSeconds(seconds);
          } catch {
            /* malformed — drop */
          }
          break;
        default:
          break;
      }
    };

    function scheduleReconnect() {
      if (unmountedRef.current) return;
      reconnectAttemptsRef.current += 1;
      setReconnectCount(reconnectAttemptsRef.current);
      setConnectionState("reconnecting");
      const base = Math.min(
        30_000,
        500 * 2 ** Math.min(reconnectAttemptsRef.current - 1, 6),
      );
      const wait = base + Math.floor(Math.random() * 250);
      timerRef.current = setTimeout(connect, wait);
    }

    async function connect() {
      if (unmountedRef.current) return;
      setConnectionState((s) =>
        s === "closed"
          ? s
          : reconnectAttemptsRef.current > 0
            ? "reconnecting"
            : "connecting",
      );

      const token = loadViewerSession(streamId)?.access_token;
      if (!token) {
        setConnectionState("closed");
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
        Authorization: `Bearer ${token}`,
      };
      if (lastEventIdRef.current) {
        headers["Last-Event-ID"] = lastEventIdRef.current;
      }

      try {
        const response = await fetch(buildUrl(), {
          headers,
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok || !response.body) {
          throw new Error(`state stream failed: ${response.status}`);
        }
        if (unmountedRef.current || controller.signal.aborted) return;
        reconnectAttemptsRef.current = 0;
        setConnectionState("open");
        await readSSEStream(response.body, handleStreamEvent);
        if (!unmountedRef.current && !controller.signal.aborted) {
          scheduleReconnect();
        }
      } catch {
        if (!unmountedRef.current && !controller.signal.aborted) {
          scheduleReconnect();
        }
      }
    }

    void connect();

    return () => {
      unmountedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
      abortRef.current = null;
      setConnectionState("closed");
    };
  }, [streamId]);

  // Owner-side moderation/slow-mode hooks remain shells until 35-3:T5 backend
  // dashboard endpoints are wired in this round 4 frontend pass.
  async function moderate(
    msgId: string,
    action: ModerationAction,
    _durationSec?: number,
  ) {
    void _durationSec;
    if (action !== "delete") return;
    const token = loadViewerSession(streamId)?.access_token;
    await fetch(
      `/api/v1/streaming/streams/${streamId}/chat/${msgId}/moderate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: "delete" }),
      },
    );
  }
  async function setSlowMode(_seconds: number) {
    void _seconds;
    // Wired by owner console (35-2 console_handler) — left as no-op for the
    // viewer hook which only consumes server-pushed slow-mode values.
  }

  return {
    messages,
    slowModeSeconds,
    moderate,
    setSlowMode,
    connectionState,
    lastEventId,
    reconnectCount,
  };
}
