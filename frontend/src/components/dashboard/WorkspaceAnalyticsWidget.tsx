"use client";

/**
 * WorkspaceAnalyticsWidget — M35 story 35-6.
 * Photographer dashboard widget summarising the workspace's monthly streaming
 * activity: streams count, credits consumed, top performers, by-day credits sparkline.
 *
 * Month navigation uses GlassIconButton (label required) per UI invariants.
 */

import { useCallback, useEffect, useState } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import {
  fetchWorkspaceAnalytics,
  type WorkspaceMetricsDTO,
  type AnalyticsFetcher,
} from "@/lib/api/streamingAnalytics";
import { StatTile, BarList, Sparkline } from "@/components/streaming/charts";

export interface WorkspaceAnalyticsWidgetProps {
  defaultMonth?: string; // YYYY-MM
  token?: string;
  fetcher?: AnalyticsFetcher;
  className?: string;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map((s) => parseInt(s, 10));
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function WorkspaceAnalyticsWidget({
  defaultMonth,
  token,
  fetcher,
  className,
}: WorkspaceAnalyticsWidgetProps) {
  const [month, setMonth] = useState<string>(defaultMonth ?? currentMonth());
  const [state, setState] = useState<{
    data: WorkspaceMetricsDTO | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });
  const { data, loading, error } = state;

  useEffect(() => {
    let alive = true;
    fetchWorkspaceAnalytics(month, { token, fetcher })
      .then((dto) => {
        if (!alive) return;
        setState({ data: dto, loading: false, error: null });
      })
      .catch(() => {
        if (!alive) return;
        setState({ data: null, loading: false, error: "Workspace analytics unavailable." });
      });
    return () => {
      alive = false;
    };
  }, [month, token, fetcher]);

  const goPrev = useCallback(() => setMonth((m) => shiftMonth(m, -1)), []);
  const goNext = useCallback(() => setMonth((m) => shiftMonth(m, 1)), []);

  const trendPoints =
    data?.byDayCredits?.map((d, i) => ({ x: i, y: d.credits })) ?? [];

  const topItems =
    data?.topStreams?.map((s) => ({
      label: s.title,
      value: s.peakViewers,
      hint: `${s.chatMessages} chat`,
    })) ?? [];

  return (
    <section
      aria-label="Workspace streaming analytics"
      className={[
        "flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface-elevated p-5",
        className ?? "",
      ].join(" ")}
    >
      <header className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-text-primary">Streaming this month</div>
          <div className="text-xs text-text-tertiary">{month}</div>
        </div>
        <div className="flex items-center gap-2">
          <GlassIconButton size="sm" variant="ghost" label="Previous month" onClick={goPrev}>
            <ChevronLeft />
          </GlassIconButton>
          <GlassIconButton size="sm" variant="ghost" label="Next month" onClick={goNext}>
            <ChevronRight />
          </GlassIconButton>
        </div>
      </header>

      {loading ? (
        <div role="status" aria-label="Loading workspace analytics" className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl border border-border-subtle bg-surface-muted"
            />
          ))}
        </div>
      ) : error || !data ? (
        <div className="text-sm text-text-secondary">{error ?? "No data."}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Streams" value={formatNumber(data.streamsCount)} />
            <StatTile
              label="Credits Consumed"
              value={formatNumber(data.creditsConsumed)}
              sublabel="Matches billing ledger"
            />
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-text-secondary">Daily credits</div>
            <Sparkline
              ariaLabel="daily credits consumed"
              points={trendPoints}
              strokeToken="accent"
              width={320}
              height={56}
              className="w-full"
            />
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-text-secondary">Top performers</div>
            <BarList ariaLabel="top streams" items={topItems} maxItems={5} />
          </div>
        </>
      )}
    </section>
  );
}
