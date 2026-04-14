"use client";

/**
 * useChatStream — SSE chat + moderation + depletion feed.
 * TODO: real-time — wire EventSource to /api/v1/streaming/streams/{id}/chat with
 * Last-Event-ID reconnection. For this shell wave we return empty state so the
 * ChatModeratorPanel renders without a live connection.
 */

import { useState } from "react";
import type { ChatMessage, ModerationAction } from "@/components/streams/live/ChatModeratorPanel";

export function useChatStream(_streamId: string) {
  const [messages] = useState<ChatMessage[]>([]);
  const [slowModeSeconds] = useState<number>(0);
  const connectionState: "connecting" | "open" | "reconnecting" | "closed" = "closed";

  async function moderate(_id: string, _action: ModerationAction, _durationSec?: number) {
    // TODO: POST /streams/{id}/chat/{msgId}/moderate
  }
  async function setSlowMode(_seconds: number) {
    // TODO: POST /streams/{id}/chat/slow-mode
  }

  return { messages, slowModeSeconds, moderate, setSlowMode, connectionState };
}
