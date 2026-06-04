"use client";

/**
 * ChatModeratorPanel — owner-side chat feed + moderation controls.
 * Shell widget: takes messages/handlers via props; wiring SSE is a later wave.
 * TODO: real-time — swap to useChatStream for SSE feed + Last-Event-ID replay.
 */

import { useState } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { ClockArrow, NoSymbol, XCircle } from "@/components/icons";

export type ModerationAction = "delete" | "timeout" | "ban";

export interface ChatMessage {
  id: string;
  viewer_id: string;
  viewer_name: string;
  body: string;
  created_at: string;
  deleted_at?: string | null;
}

export interface ChatModeratorPanelProps {
  messages: ChatMessage[];
  slowModeSeconds: number;
  onModerate: (
    msgId: string,
    action: ModerationAction,
    durationSec?: number,
  ) => void;
  onSetSlowMode: (seconds: number) => void;
}

export function ChatModeratorPanel({
  messages,
  slowModeSeconds,
  onModerate,
  onSetSlowMode,
}: ChatModeratorPanelProps) {
  const [slowInput, setSlowInput] = useState<string>(String(slowModeSeconds));

  return (
    <section
      data-testid="chat-moderator-panel"
      aria-label="Chat moderator"
      className="stream-panel p-5"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-medium text-text-media">Chat</h3>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = parseInt(slowInput, 10);
            if (!Number.isNaN(n) && n >= 0) onSetSlowMode(n);
          }}
        >
          <label
            className="text-xs text-text-media/60"
            htmlFor="slow-mode-input"
          >
            Slow-mode (s)
          </label>
          <input
            id="slow-mode-input"
            data-testid="slow-mode-input"
            type="number"
            min={0}
            value={slowInput}
            onChange={(e) => setSlowInput(e.target.value)}
            className="stream-input w-16 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            data-testid="slow-mode-apply"
            className="glass-button glass-button--quiet glass-button--sm px-3 py-1 text-xs"
          >
            Apply
          </button>
        </form>
      </header>

      <ul className="space-y-2 max-h-72 overflow-y-auto">
        {messages.length === 0 && (
          <li className="text-sm text-text-media/50">No messages yet.</li>
        )}
        {messages.map((m) => (
          <li
            key={m.id}
            data-testid={`chat-message-${m.id}`}
            className="stream-panel flex items-center justify-between gap-3 rounded-lg px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs text-text-media/60">{m.viewer_name}</div>
              <div className="truncate text-sm text-text-media">{m.body}</div>
            </div>
            <div className="flex items-center gap-1">
              <GlassIconButton
                size="sm"
                variant="danger"
                label={`Delete message from ${m.viewer_name}`}
                onClick={() => onModerate(m.id, "delete", undefined)}
              >
                <XCircle />
              </GlassIconButton>
              <GlassIconButton
                size="sm"
                variant="accent"
                label={`Timeout ${m.viewer_name}`}
                onClick={() => onModerate(m.id, "timeout", 300)}
              >
                <ClockArrow />
              </GlassIconButton>
              <GlassIconButton
                size="sm"
                variant="danger"
                label={`Ban ${m.viewer_name}`}
                onClick={() => onModerate(m.id, "ban", undefined)}
              >
                <NoSymbol />
              </GlassIconButton>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
