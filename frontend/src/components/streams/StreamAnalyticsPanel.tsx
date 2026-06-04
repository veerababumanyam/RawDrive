"use client";

/**
 * StreamAnalyticsPanel — M35 story 35-6.
 * Per-stream analytics panel mountable inside the console Audit tab.
 * Renders StatTiles + BarList for conversion bySrc + Sparkline (viewer trend stub).
 */

import { useEffect, useState } from "react";
import {
  fetchStreamAnalytics,
  AnalyticsAccessError,
  type StreamMetricsDTO,
  type AnalyticsFetcher,
} from "@/lib/api/streamingAnalytics";
import { StatTile, BarList, Sparkline } from "@/components/streaming/charts";

export interface StreamAnalyticsPanelProps {
  streamId: string;
  token?: string;
  fetcher?: AnalyticsFetcher;
  className?: string;
}

function formatDuration(sec: number): string {
  if (!sec || sec < 0) return "0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function StreamAnalyticsPanel({
  streamId,
  token,
  fetcher,
  className,
}: StreamAnalyticsPanelProps) {
  const [state, setState] = useState<{
    data: StreamMetricsDTO | null;
    error: "forbidden" | "error" | null;
    loading: boolean;
  }>({ data: null, error: null, loading: true });
  const { data, error, loading } = state;

  useEffect(() => {
    let alive = true;
    fetchStreamAnalytics(streamId, { token, fetcher })
      .then((dto) => {
        if (!alive) return;
        setState({ data: dto, error: null, loading: false });
      })
      .catch((e) => {
        if (!alive) return;
        const isForbidden =
          e instanceof AnalyticsAccessError &&
          (e.status === 403 || e.status === 404);
        setState({
          data: null,
          error: isForbidden ? "forbidden" : "error",
          loading: false,
        });
      });
    return () => {
      alive = false;
    };
  }, [streamId, token, fetcher]);

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading analytics"
        className={[
          "grid grid-cols-2 gap-3 sm:grid-cols-3",
          className ?? "",
        ].join(" ")}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border border-border-subtle bg-surface-muted"
          />
        ))}
      </div>
    );
  }

  if (error === "forbidden") {
    return (
      <div
        className={[
          "rounded-2xl border border-border-subtle bg-surface-elevated p-6 text-sm text-text-secondary",
          className ?? "",
        ].join(" ")}
      >
        You don&apos;t have access to this stream.
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 text-sm text-text-secondary">
        Analytics are unavailable right now.
      </div>
    );
  }

  const conversionItems = [
    { label: "QR", value: data.conversionBySrc.qr },
    { label: "WhatsApp", value: data.conversionBySrc.wa },
    { label: "Email", value: data.conversionBySrc.email },
    { label: "Invite", value: data.conversionBySrc.invite },
    { label: "Direct", value: data.conversionBySrc.direct },
  ];

  // Stub viewer-trend sparkline: derive a small 5-point series from peak/unique
  // until 35-6/35-8 wires real per-minute timeseries.
  const trendPoints = [
    { x: 0, y: Math.max(0, data.uniqueViewers - data.peakViewers) },
    { x: 1, y: Math.floor(data.peakViewers / 2) },
    { x: 2, y: data.peakViewers },
    { x: 3, y: Math.floor(data.peakViewers * 0.75) },
    { x: 4, y: Math.floor(data.uniqueViewers / 2) },
  ];

  return (
    <section
      aria-label="Stream analytics"
      className={["flex flex-col gap-4", className ?? ""].join(" ")}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Peak Viewers" value={formatNumber(data.peakViewers)} />
        <StatTile
          label="Unique Viewers"
          value={formatNumber(data.uniqueViewers)}
        />
        <StatTile
          label="Avg Watch Time"
          value={formatDuration(data.avgWatchTimeSec)}
          sublabel={`Total ${formatDuration(data.watchTimeSec)}`}
        />
        <StatTile
          label="Chat"
          value={`${data.chatMsgsPerMin.toFixed(1)}/min`}
          sublabel={`${formatNumber(data.chatMessages)} msgs`}
        />
        <StatTile label="Reactions" value={formatNumber(data.reactions)} />
        <StatTile label="Replay Views" value={formatNumber(data.replayViews)} />
      </div>

      <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-4">
        <div className="mb-3 text-sm font-medium text-text-primary">
          Viewer trend
        </div>
        <Sparkline
          points={trendPoints}
          ariaLabel="viewer trend over the live window"
          strokeToken="accent"
          width={320}
          height={64}
          className="w-full"
        />
      </div>

      <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-4">
        <div className="mb-3 text-sm font-medium text-text-primary">
          Conversion by source
        </div>
        <BarList items={conversionItems} ariaLabel="conversion by source" />
      </div>
    </section>
  );
}
