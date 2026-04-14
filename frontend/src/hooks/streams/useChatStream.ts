"use client";

/**
 * useChatStream — story 35-3 R4.
 *
 * SSE consumer for the public viewer state stream. Connects to
 *   GET /api/v1/public/streams/{id}/state?access_token=<jwt>
 * and surfaces the chat-channel slice (chat_new + chat_moderation events) as a
 * locally-buffered list. The viewer JWT is read from sessionStorage via the
 * 35-1 helper. Reconnects on error with exponential backoff and replays from
 * the last seen event id via `last_event_id` query param (EventSource API
 * does not allow custom Last-Event-ID headers in browsers).
 */

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ModerationAction } from "@/components/streams/live/ChatModeratorPanel";
import { loadViewerSession } from "@/lib/viewer/session";

type ConnState = "connecting" | "open" | "reconnecting" | "closed";

export function useChatStream(streamId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [slowModeSeconds, setSlowModeSeconds] = useState<number>(0);
  const [connectionState, setConnectionState] = useState<ConnState>("connecting");
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  const lastEventIdRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    if (!streamId) return;
    unmountedRef.current = false;

    function buildUrl(): string {
      const token = loadViewerSession(streamId)?.access_token ?? "";
      const params = new URLSearchParams({ access_token: token });
      if (lastEventIdRef.current) params.set("last_event_id", lastEventIdRef.current);
      return `/api/v1/public/streams/${encodeURIComponent(streamId)}/state?${params.toString()}`;
    }

    function connect() {
      if (unmountedRef.current) return;
      setConnectionState((s) => (s === "closed" ? s : reconnectAttemptsRef.current > 0 ? "reconnecting" : "connecting"));
      const es = new EventSource(buildUrl());
      esRef.current = es;

      es.onopen = () => {
        if (unmountedRef.current) return;
        reconnectAttemptsRef.current = 0;
        setConnectionState("open");
      };

      const trackEventId = (ev: MessageEvent) => {
        if (ev.lastEventId) {
          lastEventIdRef.current = ev.lastEventId;
          setLastEventId(ev.lastEventId);
        }
      };

      es.addEventListener("chat_new", (ev: MessageEvent) => {
        trackEventId(ev);
        try {
          const msg = JSON.parse(ev.data) as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        } catch {
          /* malformed payload — drop */
        }
      });

      es.addEventListener("chat_moderation", (ev: MessageEvent) => {
        trackEventId(ev);
        try {
          const { msg_id, action } = JSON.parse(ev.data) as { msg_id: string; action: string };
          if (action === "delete") {
            setMessages((prev) => prev.filter((m) => m.id !== msg_id));
          }
        } catch {
          /* malformed — drop */
        }
      });

      es.addEventListener("slow_mode", (ev: MessageEvent) => {
        trackEventId(ev);
        try {
          const { seconds } = JSON.parse(ev.data) as { seconds: number };
          if (Number.isFinite(seconds) && seconds >= 0) setSlowModeSeconds(seconds);
        } catch {
          /* drop */
        }
      });

      es.onerror = () => {
        if (unmountedRef.current) return;
        es.close();
        esRef.current = null;
        reconnectAttemptsRef.current += 1;
        setReconnectCount(reconnectAttemptsRef.current);
        setConnectionState("reconnecting");
        // Exponential backoff with jitter, capped at 30s.
        const base = Math.min(30_000, 500 * 2 ** Math.min(reconnectAttemptsRef.current - 1, 6));
        const wait = base + Math.floor(Math.random() * 250);
        timerRef.current = setTimeout(connect, wait);
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      esRef.current?.close();
      esRef.current = null;
      setConnectionState("closed");
    };
  }, [streamId]);

  // Owner-side moderation/slow-mode hooks remain shells until 35-3:T5 backend
  // dashboard endpoints are wired in this round 4 frontend pass.
  async function moderate(msgId: string, action: ModerationAction, _durationSec?: number) {
    void _durationSec;
    if (action !== "delete") return;
    const token = loadViewerSession(streamId)?.access_token;
    await fetch(`/api/v1/streaming/streams/${streamId}/chat/${msgId}/moderate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action: "delete" }),
    });
  }
  async function setSlowMode(_seconds: number) {
    void _seconds;
    // Wired by owner console (35-2 console_handler) — left as no-op for the
    // viewer hook which only consumes server-pushed slow-mode values.
  }

  return { messages, slowModeSeconds, moderate, setSlowMode, connectionState, lastEventId, reconnectCount };
}
