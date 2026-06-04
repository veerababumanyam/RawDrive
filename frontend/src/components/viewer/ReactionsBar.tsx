"use client";

/**
 * ReactionsBar — story 35-3 R4.
 *
 * 5 emoji reactions surfaced as GlassIconButton controls. Presses are
 * debounced 200ms and accumulated client-side, then flushed as a single
 * batched POST to /public/streams/{id}/reactions. The client debounce is a
 * UX/perf affordance only — the server holds the authoritative
 * 10-batches-per-second-per-session rate limit.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { loadViewerSession } from "@/lib/viewer/session";

export type ReactionKind =
  | "thumbs_up"
  | "heart"
  | "celebrate"
  | "laugh"
  | "wow";

const REACTIONS: { kind: ReactionKind; label: string; glyph: string }[] = [
  { kind: "heart", label: "Heart reaction", glyph: "❤" },
  { kind: "thumbs_up", label: "Thumbs up reaction", glyph: "👍" },
  { kind: "celebrate", label: "Celebrate reaction", glyph: "🎉" },
  { kind: "laugh", label: "Laugh reaction", glyph: "😂" },
  { kind: "wow", label: "Wow reaction", glyph: "😮" },
];

export interface ReactionsBarProps {
  streamId: string;
  disabled?: boolean;
  debounceMs?: number;
}

export function ReactionsBar({
  streamId,
  disabled,
  debounceMs = 200,
}: ReactionsBarProps) {
  const pendingRef = useRef<Record<string, number>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flushing, setFlushing] = useState(false);

  const flush = useCallback(async () => {
    const snapshot = pendingRef.current;
    pendingRef.current = {};
    timerRef.current = null;
    const entries = Object.entries(snapshot)
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => ({
        kind: kind as ReactionKind,
        count,
        client_ts: new Date().toISOString(),
      }));
    if (entries.length === 0) return;
    setFlushing(true);
    try {
      const token = loadViewerSession(streamId)?.access_token;
      await fetch(
        `/api/v1/public/streams/${encodeURIComponent(streamId)}/reactions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ entries }),
        },
      );
    } catch {
      // Reactions are fire-and-forget: a network blip drops the burst.
    } finally {
      setFlushing(false);
    }
  }, [streamId]);

  const press = useCallback(
    (kind: ReactionKind) => {
      if (disabled) return;
      pendingRef.current[kind] = (pendingRef.current[kind] ?? 0) + 1;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush();
      }, debounceMs);
    },
    [disabled, debounceMs, flush],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      data-testid="reactions-bar"
      role="group"
      aria-label="Reactions"
      className="flex items-center gap-2 rounded-full border border-text-media/10 bg-surface-overlay/5 px-2 py-1.5 glass-blur-soft"
    >
      {REACTIONS.map((r) => (
        <GlassIconButton
          key={r.kind}
          size="sm"
          variant="glass"
          label={r.label}
          data-testid={`reaction-btn-${r.kind}`}
          disabled={disabled}
          onClick={() => press(r.kind)}
        >
          <span aria-hidden className="text-base leading-none">
            {r.glyph}
          </span>
        </GlassIconButton>
      ))}
      {flushing && <span className="sr-only">Sending reactions…</span>}
    </div>
  );
}
