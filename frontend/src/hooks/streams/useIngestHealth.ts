"use client";

/**
 * useIngestHealth — polls /api/v1/streaming/streams/{id}/health every 5s.
 * TODO: real-time — replace / augment with SSE health.degraded channel.
 */

import { useEffect, useState } from "react";
import type { IngestHealthData } from "@/components/streams/live/IngestHealthCard";

export function useIngestHealth(streamId: string) {
  const [data, setData] = useState<IngestHealthData | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!streamId) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/v1/streaming/streams/${streamId}/health`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`health ${res.status}`);
        const json = (await res.json()) as IngestHealthData;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      }
    }

    void tick();
    const interval = setInterval(tick, 5_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [streamId]);

  return { data, status: data?.status ?? "idle", error };
}
