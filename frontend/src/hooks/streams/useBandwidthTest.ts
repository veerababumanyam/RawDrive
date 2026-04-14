"use client";

/**
 * useBandwidthTest — injectable uplink probe for the preflight panel.
 *
 * Rules:
 *  - Transport is a prop so the hook is unit-testable without a browser
 *    (no XHR, no fetch, no DOM). The default transport runs a real XHR
 *    upload against `/api/v1/streams/preflight/{sid}/echo` in production.
 *  - Tier thresholds come from `@/lib/streams/bandwidth-classifier` —
 *    which mirrors the Go server-side classifier. Do NOT duplicate the
 *    thresholds here.
 */

import { useCallback, useRef, useState } from "react";
import { classify as classifyMbps } from "@/lib/streams/bandwidth-classifier";
import type { ClassifyResult } from "@/lib/streams/bandwidth-classifier";

export interface BandwidthTransport {
  /**
   * Upload `bytes` to the server and resolve with the elapsed time in ms.
   * Implementations may abort mid-flight via `signal`.
   */
  uploadProbe: (bytes: number, signal?: AbortSignal) => Promise<number>;
}

export type BandwidthStatus = "idle" | "running" | "done" | "error";

export interface UseBandwidthTestResult {
  status: BandwidthStatus;
  mbps: number;
  error?: Error;
  run: () => Promise<number>;
  classify: () => ClassifyResult;
}

const PROBE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Default production transport — XHR upload of a random-byte blob.
 * Kept out of the hook body so tests never accidentally hit it.
 */
export function defaultXHRTransport(sessionEndpoint: string): BandwidthTransport {
  return {
    uploadProbe: (bytes, signal) =>
      new Promise<number>((resolve, reject) => {
        const payload = new Uint8Array(bytes);
        // Fill with pseudo-random bytes — avoids compression on the wire.
        for (let i = 0; i < bytes; i += 4096) {
          payload[i] = Math.floor(Math.random() * 256);
        }
        const xhr = new XMLHttpRequest();
        xhr.open("POST", sessionEndpoint, true);
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        const started = performance.now();
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(performance.now() - started);
          } else {
            reject(new Error(`probe failed: ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error("probe network error"));
        if (signal) {
          signal.addEventListener("abort", () => xhr.abort());
        }
        xhr.send(payload);
      }),
  };
}

export function useBandwidthTest(transport: BandwidthTransport): UseBandwidthTestResult {
  const [status, setStatus] = useState<BandwidthStatus>("idle");
  const [mbps, setMbps] = useState(0);
  const [error, setError] = useState<Error | undefined>();
  const mbpsRef = useRef(0);

  const run = useCallback(async (): Promise<number> => {
    setStatus("running");
    setError(undefined);
    try {
      const elapsedMs = await transport.uploadProbe(PROBE_BYTES);
      // Guard against nonsense responses: clamp elapsed to >= 1ms.
      const safeElapsed = Math.max(1, elapsedMs);
      const kbps = (PROBE_BYTES * 8) / safeElapsed; // bits per ms = kbps
      const computedMbps = kbps / 1000;
      mbpsRef.current = computedMbps;
      setMbps(computedMbps);
      setStatus("done");
      return computedMbps;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setStatus("error");
      throw err;
    }
  }, [transport]);

  const classify = useCallback(() => classifyMbps(mbpsRef.current || mbps), [mbps]);

  return { status, mbps, error, run, classify };
}
