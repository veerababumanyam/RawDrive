"use client";

/**
 * ChatBox — story 35-3 R4.
 *
 * Public viewer chat composer + message list. The hook (useChatStream) is the
 * source of truth for the SSE-streamed messages list; this component takes the
 * messages by prop so the parent (StreamViewerShell) can co-locate the SSE
 * connection with other viewer panels. Submission POSTs to the public chat
 * endpoint; server is authoritative for slow-mode and ban gates. Retry-After
 * countdown is driven from the server response, not a client-side guess.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { ChevronRight } from "@/components/icons";
import { loadViewerSession } from "@/lib/viewer/session";
import type { ChatMessage } from "@/components/streams/live/ChatModeratorPanel";

const MAX_BODY = 500;

export type ChatConnectionState =
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed";

export interface ChatBoxProps {
  streamId: string;
  messages: ChatMessage[];
  disabled?: boolean;
  /**
   * SSE connection state from `useChatStream`. When `"reconnecting"` we surface
   * a small warning banner so viewers know the live feed is temporarily paused.
   */
  connectionState?: ChatConnectionState;
}

export function ChatBox({
  streamId,
  messages,
  disabled,
  connectionState,
}: ChatBoxProps) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const [banned, setBanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Server-driven Retry-After countdown.
  useEffect(() => {
    if (retryAfter <= 0) return;
    tickRef.current = setInterval(() => {
      setRetryAfter((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [retryAfter]);

  const overLimit = text.length > MAX_BODY;
  const canPost =
    !banned &&
    !disabled &&
    !posting &&
    retryAfter === 0 &&
    text.trim().length > 0 &&
    !overLimit;

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canPost) return;
    setPosting(true);
    setError(null);
    try {
      const token = loadViewerSession(streamId)?.access_token;
      const res = await fetch(
        `/api/v1/public/streams/${encodeURIComponent(streamId)}/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ body: text.trim() }),
        },
      );
      if (res.status === 429) {
        const headerRA = parseInt(res.headers.get("Retry-After") ?? "0", 10);
        let bodyRA = 0;
        try {
          const body = (await res.json()) as { retry_after?: number };
          bodyRA = typeof body.retry_after === "number" ? body.retry_after : 0;
        } catch {
          /* ignore */
        }
        setRetryAfter(Math.max(headerRA, bodyRA, 1));
        setError("slow_mode");
        return;
      }
      if (res.status === 403) {
        setBanned(true);
        setError("viewer_banned");
        return;
      }
      if (res.status === 410) {
        setError("stream_ended");
        return;
      }
      if (!res.ok) {
        setError(`http_${res.status}`);
        return;
      }
      setText("");
    } catch {
      setError("network");
    } finally {
      setPosting(false);
    }
  }

  const composerDisabled = banned || disabled;
  const charCountClass = useMemo(
    () =>
      overLimit
        ? "text-feedback-error"
        : text.length > MAX_BODY * 0.9
          ? "text-feedback-warning"
          : "text-text-media/50",
    [text.length, overLimit],
  );

  return (
    <section
      data-testid="chat-box"
      aria-label="Live chat"
      className="flex h-full flex-col gap-3 rounded-2xl border border-text-media/10 bg-surface-overlay/5 p-4"
    >
      <ul
        data-testid="chat-messages"
        className="flex-1 space-y-2 overflow-y-auto pr-1"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <li className="text-sm text-text-media/50">No messages yet — say hi.</li>
        )}
        {messages.map((m) => (
          <li
            key={m.id}
            data-testid={`chat-msg-${m.id}`}
            className="rounded-lg border border-text-media/5 bg-surface-overlay/5 px-3 py-2"
          >
            <div className="text-xs text-text-media/60">{m.viewer_name}</div>
            <div className="break-words text-sm text-text-media/90">{m.body}</div>
          </li>
        ))}
      </ul>

      {connectionState === "reconnecting" && !banned && (
        <div
          data-testid="chat-reconnecting"
          role="status"
          aria-live="polite"
          className="rounded-md border border-feedback-warning/30 bg-feedback-warning/10 px-3 py-2 text-xs text-feedback-warning"
        >
          Reconnecting…
        </div>
      )}

      {banned && (
        <div
          data-testid="chat-banned"
          role="alert"
          className="rounded-md border border-feedback-error/30 bg-feedback-error/10 px-3 py-2 text-xs text-feedback-error"
        >
          You have been blocked from chatting in this stream by a moderator.
        </div>
      )}

      {retryAfter > 0 && !banned && (
        <div
          data-testid="chat-slowmode"
          role="status"
          className="rounded-md border border-feedback-warning/30 bg-feedback-warning/10 px-3 py-2 text-xs text-feedback-warning"
        >
          Slow mode — try again in {retryAfter}s.
        </div>
      )}

      {error && error !== "slow_mode" && error !== "viewer_banned" && (
        <div
          role="alert"
          data-testid="chat-error"
          className="text-xs text-feedback-error"
        >
          {error === "stream_ended"
            ? "Chat is closed — the stream has ended."
            : "Could not send your message."}
        </div>
      )}

      <form onSubmit={submit} className="flex items-end gap-2">
        <div className="flex-1">
          <textarea
            data-testid="chat-input"
            aria-label="Chat message"
            disabled={composerDisabled}
            value={text}
            maxLength={
              MAX_BODY *
              2 /* allow paste-overflow detection rather than truncating silently */
            }
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="Say something nice…"
            rows={2}
            className="w-full resize-none rounded-lg border border-text-media/15 bg-surface-overlay/5 px-3 py-2 text-sm text-text-media/90 placeholder:text-text-media/40 focus:border-text-media/30 focus:outline-none disabled:opacity-50"
          />
          <div className="mt-1 flex justify-between text-[11px]">
            <span data-testid="chat-charcount" className={charCountClass}>
              {text.length} / {MAX_BODY}
            </span>
          </div>
        </div>
        <GlassIconButton
          type="submit"
          size="md"
          variant="accent"
          label="Send chat message"
          data-testid="chat-submit"
          disabled={!canPost}
        >
          <ChevronRight />
        </GlassIconButton>
      </form>
    </section>
  );
}
