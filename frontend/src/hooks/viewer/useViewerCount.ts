"use client";

/**
 * useViewerCount — visibility-aware 5s poll of the public viewer-count
 * endpoint. Pauses while document.visibilityState === "hidden" to avoid
 * background battery drain and immediately refreshes on tab focus.
 *
 * Server-authoritative: the hook never derives counts locally; it only
 * mirrors the cached server response.
 */

import { useEffect, useRef, useState } from "react";
import { fetchViewerCount, ViewerApiError } from "@/lib/viewer/viewerApi";

export type UseViewerCountResult = {
  current: number | null;
  asOf: string | null;
  loading: boolean;
  error: { status: number; message: string } | null;
};

export type UseViewerCountOptions = {
  shortlink: string;
  token: string;
  pollMs?: number;
};

export function useViewerCount(opts: UseViewerCountOptions): UseViewerCountResult {
  const { shortlink, token, pollMs = 5_000 } = opts;
  const [current, setCurrent] = useState<number | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<UseViewerCountResult["error"]>(null);

  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const isHidden = () =>
      typeof document !== "undefined" && document.visibilityState === "hidden";

    const tick = async () => {
      if (cancelledRef.current) return;
      if (isHidden()) {
        // Skip this tick; visibilitychange handler will resume.
        return;
      }
      try {
        const body = await fetchViewerCount(shortlink, token);
        if (cancelledRef.current) return;
        setCurrent(body.current);
        setAsOf(body.as_of);
        setError(null);
      } catch (e) {
        if (cancelledRef.current) return;
        if (e instanceof ViewerApiError) {
          setError({ status: e.status, message: e.message });
        } else {
          setError({ status: 0, message: "network_error" });
        }
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        await tick();
        if (!cancelledRef.current) schedule();
      }, pollMs);
    };

    const onVisibility = () => {
      if (!isHidden()) {
        // Resume immediately on visible.
        void tick();
      }
    };

    void tick();
    schedule();

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelledRef.current = true;
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [shortlink, token, pollMs]);

  return { current, asOf, loading, error };
}
