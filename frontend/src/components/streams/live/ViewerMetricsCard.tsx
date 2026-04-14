"use client";

/**
 * ViewerMetricsCard — current / peak / unique viewer counts.
 * Shell widget: reads from useViewerMetrics.
 * TODO: real-time — consider SSE viewer.count events instead of 5s poll.
 */

export interface ViewerMetricsData {
  current: number;
  peak: number;
  unique: number;
  as_of: string;
}

export interface ViewerMetricsCardProps {
  data: ViewerMetricsData | null;
}

export function ViewerMetricsCard({ data }: ViewerMetricsCardProps) {
  const current = data?.current ?? 0;
  const peak = data?.peak ?? 0;
  const unique = data?.unique ?? 0;

  return (
    <section
      data-testid="viewer-metrics-card"
      aria-label="Viewer metrics"
      className="rounded-2xl border border-white/10 bg-white/5 p-5"
    >
      <h3 className="mb-3 text-base font-medium text-white/90">Viewers</h3>
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat testId="viewer-current" label="Current" value={current} />
        <Stat testId="viewer-peak" label="Peak" value={peak} />
        <Stat testId="viewer-unique" label="Unique" value={unique} />
      </div>
    </section>
  );
}

function Stat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-white/50">{label}</div>
      <div data-testid={testId} className="text-2xl font-semibold text-white/90">
        {value}
      </div>
    </div>
  );
}
