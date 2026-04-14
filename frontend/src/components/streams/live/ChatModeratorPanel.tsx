"use client";

/**
 * ChatModeratorPanel — owner-side chat feed + moderation controls.
 * Shell widget: takes messages/handlers via props; wiring SSE is a later wave.
 * TODO: real-time — swap to useChatStream for SSE feed + Last-Event-ID replay.
 */

import { useState } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { XCircle } from "@/components/icons";

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
  onModerate: (msgId: string, action: ModerationAction, durationSec?: number) => void;
  onSetSlowMode: (seconds: number) => void;
}

// Inline icons for moderation actions. TODO: upstream ClockArrow / NoSymbol
// into @/components/icons registry per 34-6 spec.
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function NoSymbolIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </svg>
  );
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
      className="rounded-2xl border border-white/10 bg-white/5 p-5"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-medium text-white/90">Chat</h3>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = parseInt(slowInput, 10);
            if (!Number.isNaN(n) && n >= 0) onSetSlowMode(n);
          }}
        >
          <label className="text-xs text-white/60" htmlFor="slow-mode-input">
            Slow-mode (s)
          </label>
          <input
            id="slow-mode-input"
            data-testid="slow-mode-input"
            type="number"
            min={0}
            value={slowInput}
            onChange={(e) => setSlowInput(e.target.value)}
            className="w-16 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-sm text-white/90"
          />
          <button
            type="submit"
            data-testid="slow-mode-apply"
            className="rounded-md bg-white/15 px-3 py-1 text-xs text-white/90 hover:bg-white/25"
          >
            Apply
          </button>
        </form>
      </header>

      <ul className="space-y-2 max-h-72 overflow-y-auto">
        {messages.length === 0 && (
          <li className="text-sm text-white/50">No messages yet.</li>
        )}
        {messages.map((m) => (
          <li
            key={m.id}
            data-testid={`chat-message-${m.id}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs text-white/60">{m.viewer_name}</div>
              <div className="truncate text-sm text-white/90">{m.body}</div>
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
                <ClockIcon />
              </GlassIconButton>
              <GlassIconButton
                size="sm"
                variant="danger"
                label={`Ban ${m.viewer_name}`}
                onClick={() => onModerate(m.id, "ban", undefined)}
              >
                <NoSymbolIcon />
              </GlassIconButton>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
