"use client";

/**
 * useViewerMetrics — polls /api/v1/streaming/streams/{id}/viewers every 5s.
 * TODO: real-time — swap to SSE viewer.count events.
 */

import { useEffect, useState } from "react";
import type { ViewerMetricsData } from "@/components/streams/live/ViewerMetricsCard";

export function useViewerMetrics(streamId: string) {
  const [data, setData] = useState<ViewerMetricsData | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    if (!streamId) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/v1/streaming/streams/${streamId}/viewers`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const json = (await res.json()) as ViewerMetricsData;
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch {
        // ignore network blips; next tick will retry
      }
    }

    void tick();
    const interval = setInterval(tick, 5_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [streamId]);

  return {
    current: data?.current ?? 0,
    peak: data?.peak ?? 0,
    unique: data?.unique ?? 0,
    isLoading,
  };
}
