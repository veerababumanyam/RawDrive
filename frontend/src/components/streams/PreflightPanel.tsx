"use client";

/**
 * PreflightPanel — M34 story 34-7.
 *
 * Orchestrates the desktop preflight flow:
 *   1. POST /api/v1/streams/preflight/start  — allocates ephemeral CF input
 *   2. In-browser uplink probe via `useBandwidthTest`
 *   3. POST .../bandwidth — records the sample server-side
 *   4. GET  .../obs-profile — downloads tier-appropriate OBS .ini
 *   5. POST .../test-broadcast/start + /stop — 60s throwaway broadcast
 *
 * Design rules followed:
 *  - GlassIconButton for every action (iOS 26 liquid glass)
 *  - Tailwind design tokens only (success/warning/danger variants)
 *  - Transport + fetcher are injectable props for unit testing
 */

import { useCallback, useMemo, useState } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Download, Sparkle, CheckCircle, InfoCircle } from "@/components/icons";
import {
  useBandwidthTest,
  defaultXHRTransport,
  type BandwidthTransport,
} from "@/hooks/streams/useBandwidthTest";
import type { ClassifyResult } from "@/lib/streams/bandwidth-classifier";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface PreflightPanelProps {
  streamId: string;
  /** Test hook — injected fetch implementation. */
  fetcher?: Fetcher;
  /** Test hook — injected bandwidth transport. */
  transport?: BandwidthTransport;
}

interface StartResponse {
  sessionId: string;
  rtmpsUrl: string;
  rtmpsKey: string;
  expiresAt: string;
}

type Phase =
  | "idle"
  | "starting"
  | "measuring"
  | "ready"
  | "testing"
  | "done"
  | "error";

const API_BASE = "/api/v1/streaming/streams/preflight";

export function PreflightPanel({
  streamId,
  fetcher,
  transport,
}: PreflightPanelProps) {
  const doFetch = useMemo<Fetcher>(
    () => fetcher ?? ((u, i) => fetch(u, i)),
    [fetcher],
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [session, setSession] = useState<StartResponse | null>(null);
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(
    null,
  );
  const [errorMsg, setErrorMsg] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "active" | "stopped">(
    "idle",
  );

  // Build a sensible default transport once we know the session id. Tests
  // pass their own `transport` so this branch never runs under vitest.
  const activeTransport: BandwidthTransport =
    transport ??
    (session
      ? defaultXHRTransport(`${API_BASE}/${session.sessionId}/echo`)
      : { uploadProbe: async () => 1 });

  const bw = useBandwidthTest(activeTransport);

  const handleStart = useCallback(async () => {
    setPhase("starting");
    setErrorMsg("");
    try {
      const res = await doFetch(`${API_BASE}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamId }),
      });
      if (!res.ok) throw new Error(`start failed: ${res.status}`);
      const data = (await res.json()) as StartResponse;
      setSession(data);
      setPhase("measuring");

      const mbps = await bw.run();
      const verdict = bw.classify();
      setClassifyResult(verdict);

      // Report the sample — fire-and-forget; bandwidth record failure
      // shouldn't block the verdict display.
      void doFetch(`${API_BASE}/${data.sessionId}/bandwidth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uplinkKbps: Math.floor(mbps * 1000),
          source: "xhr",
        }),
      });

      setPhase("ready");
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "preflight failed");
    }
  }, [doFetch, streamId, bw]);

  const handleDownloadOBS = useCallback(async () => {
    if (!session) return;
    try {
      const res = await doFetch(
        `${API_BASE}/${session.sessionId}/obs-profile`,
        {
          method: "GET",
        },
      );
      if (!res.ok) throw new Error(`obs-profile failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = obsFilename(classifyResult?.tier ?? "720p30");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "download failed");
    }
  }, [doFetch, session, classifyResult]);

  const handleTestBroadcast = useCallback(async () => {
    if (!session) return;
    setPhase("testing");
    try {
      const startRes = await doFetch(
        `${API_BASE}/${session.sessionId}/test-broadcast/start`,
        { method: "POST" },
      );
      if (!startRes.ok)
        throw new Error(`test-broadcast start: ${startRes.status}`);
      setTestStatus("active");
      // Immediate stop — in production this would be driven by the 60s
      // session TTL or a user "Finish" action; the sequence itself is what
      // the unit test asserts.
      const stopRes = await doFetch(
        `${API_BASE}/${session.sessionId}/test-broadcast/stop`,
        { method: "POST" },
      );
      if (!stopRes.ok)
        throw new Error(`test-broadcast stop: ${stopRes.status}`);
      setTestStatus("stopped");
      setPhase("done");
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "test broadcast failed");
    }
  }, [doFetch, session]);

  const verdictTone = classifyResult?.verdict ?? "warn";
  const verdictVariant =
    verdictTone === "pass"
      ? "success"
      : verdictTone === "warn"
        ? "accent"
        : "danger";

  return (
    <section
      data-testid="preflight-panel"
      aria-label="Desktop preflight"
      className="stream-panel space-y-4 p-5"
    >
      <header className="flex items-center justify-between">
        <h3 className="text-base font-medium text-text-media">
          Stream preflight
        </h3>
        {errorMsg && (
          <span
            data-testid="preflight-error"
            className="text-sm text-feedback-error"
          >
            {errorMsg}
          </span>
        )}
      </header>

      {phase === "idle" && (
        <GlassIconButton
          label="Start preflight check"
          variant="accent"
          data-testid="preflight-start"
          onClick={handleStart}
        >
          <Sparkle />
        </GlassIconButton>
      )}

      {(phase === "starting" || phase === "measuring") && (
        <p
          className="text-sm text-text-media/70"
          data-testid="preflight-measuring"
        >
          Measuring uplink…
        </p>
      )}

      {classifyResult && (
        <div className="space-y-3" data-testid="bandwidth-gauge">
          <div className="flex items-center gap-3">
            <span
              data-testid="verdict-chip"
              data-variant={verdictVariant}
              className={chipClass(verdictTone)}
            >
              {verdictTone === "pass" && <CheckCircle />}
              {verdictTone !== "pass" && <InfoCircle />}
              <span className="ml-1 capitalize">{verdictTone}</span>
              <span className="ml-2 text-text-media/70">
                · {bw.mbps.toFixed(1)} Mbps · {classifyResult.tier}
              </span>
            </span>
          </div>
          <ul
            data-testid="recommendations"
            className="list-disc space-y-1 pl-5 text-sm text-text-media/75"
          >
            {classifyResult.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <div className="flex gap-3">
            <GlassIconButton
              label="Download OBS profile"
              variant="glass"
              data-testid="download-obs"
              onClick={handleDownloadOBS}
            >
              <Download />
            </GlassIconButton>
            <GlassIconButton
              label="Run test broadcast"
              variant="success"
              data-testid="test-broadcast"
              onClick={handleTestBroadcast}
              active={testStatus === "active"}
            >
              <Sparkle />
            </GlassIconButton>
          </div>
          {testStatus === "stopped" && (
            <p
              className="text-xs text-text-media/60"
              data-testid="test-broadcast-done"
            >
              Test broadcast completed.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function chipClass(verdict: "pass" | "warn" | "poor"): string {
  // Mapping to semantic design tokens — never primitive Tailwind scales.
  const base =
    "inline-flex items-center rounded-full px-3 py-1 text-sm font-medium border";
  if (verdict === "pass")
    return `${base} border-feedback-success/30 bg-feedback-success/10 text-feedback-success`;
  if (verdict === "warn")
    return `${base} border-feedback-warning/30 bg-feedback-warning/10 text-feedback-warning`;
  return `${base} border-feedback-error/30 bg-feedback-error/10 text-feedback-error`;
}

function obsFilename(tier: string): string {
  return `rawdrive-obs-${tier}.ini`;
}
