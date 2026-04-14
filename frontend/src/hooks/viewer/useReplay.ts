"use client";

/**
 * useReplay — fetches the public replay endpoint once on mount and
 * surfaces the discriminated union the server returned. The hook does
 * not compute expiry locally; expiry is server-authoritative (410).
 */

import { useEffect, useState } from "react";
import {
  fetchReplay,
  type ReplayResponse,
  ViewerApiError,
} from "@/lib/viewer/viewerApi";

export type UseReplayResult = {
  data: ReplayResponse | null;
  loading: boolean;
  error: { status: number; message: string } | null;
};

export function useReplay(shortlink: string, token: string): UseReplayResult {
  const [data, setData] = useState<ReplayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UseReplayResult["error"]>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const body = await fetchReplay(shortlink, token);
        if (cancelled) return;
        setData(body);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ViewerApiError) {
          setError({ status: e.status, message: e.message });
        } else {
          setError({ status: 0, message: "network_error" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shortlink, token]);

  return { data, loading, error };
}
