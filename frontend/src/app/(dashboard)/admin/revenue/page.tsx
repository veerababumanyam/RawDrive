"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredAccessToken } from "@/lib/auth";
import { getRevenueDashboard, getRevenueTimeSeries, type RevenueData, type RevenueTimeSeries } from "@/lib/api/admin";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";

// Backend fields can come back null/undefined when there is no data for a
// given period (e.g. no paid subscriptions yet, empty state buckets). Guard
// against non-finite math so the UI renders "₹0" instead of "₹NaN".
function formatINR(paisa: number | null | undefined): string {
  const n = typeof paisa === "number" && Number.isFinite(paisa) ? paisa : 0;
  return (n / 100).toLocaleString("en-IN");
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-surface-container-low/40 backdrop-blur-md border border-white/[0.03] p-6 rounded-2xl">
      <p className="text-[10px] uppercase tracking-[0.1em] text-text-secondary font-label">{label}</p>
      <p className={`text-3xl font-bold font-headline mt-2 ${accent ? "text-primary" : "text-on-surface"}`}>{value}</p>
    </div>
  );
}

// ─── Row types cast-compatible with DataTable's Record<string, unknown> constraint ──

type StateBreakdownRow = { state_name: string; revenue_paisa: number; subscriber_count: number } & Record<string, unknown>;
type TimeSeriesRow = RevenueTimeSeries & Record<string, unknown>;

// ─── Column definitions (stable refs via module scope) ──

const stateBreakdownColumns: ColumnDef<StateBreakdownRow>[] = [
  { key: "state_name", label: "State", sortable: true },
  {
    key: "revenue_paisa",
    label: "Revenue",
    sortable: true,
    render: (_v, row) => <span className="text-primary font-medium">₹{formatINR(row.revenue_paisa)}</span>,
  },
  { key: "subscriber_count", label: "Subscribers", sortable: true },
];

const stateBreakdownCompareFns = {
  revenue_paisa: (a: StateBreakdownRow, b: StateBreakdownRow) =>
    (a.revenue_paisa ?? 0) - (b.revenue_paisa ?? 0),
};

const timeSeriesColumns: ColumnDef<TimeSeriesRow>[] = [
  {
    key: "period",
    label: "Period",
    sortable: true,
    render: (v) => <>{(v as string) ?? "—"}</>,
  },
  {
    key: "revenue_paisa",
    label: "Revenue",
    sortable: true,
    render: (_v, row) => <span className="text-primary font-medium">₹{formatINR(row.revenue_paisa)}</span>,
  },
  {
    key: "subscribers",
    label: "Subscribers",
    sortable: true,
  },
];

const timeSeriesCompareFns = {
  revenue_paisa: (a: TimeSeriesRow, b: TimeSeriesRow) =>
    (a.revenue_paisa ?? 0) - (b.revenue_paisa ?? 0),
};

export default function AdminRevenuePage() {
  const router = useRouter();
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [timeSeries, setTimeSeries] = useState<RevenueTimeSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    const token = getStoredAccessToken();
    Promise.all([getRevenueDashboard(token), getRevenueTimeSeries(token, { period: "monthly" })])
      .then(([rev, ts]) => {
        // Backend returns null for empty state_breakdown and null for
        // empty time-series arrays. Coerce to empty arrays so the
        // page's .map() calls don't throw on undefined. Same pattern
        // we've been applying across every list page touched during
        // UAT on 2026-04-12.
        const safeRev = rev ? {
          ...rev,
          state_breakdown: Array.isArray(rev.state_breakdown) ? rev.state_breakdown : [],
        } : rev;
        setRevenue(safeRev);
        setTimeSeries(Array.isArray(ts) ? ts : []);
        setError(null);
      })
      .catch(() => setError("Failed to load revenue data"))
      .finally(() => setLoading(false));
  }, []);

  const handleRefresh = useCallback(() => {
    router.refresh();
    loadData();
  }, [router, loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Memoize data arrays so DataTable doesn't re-render on every parent render
  const stateBreakdownData = useMemo<StateBreakdownRow[]>(
    () => (revenue?.state_breakdown ?? []) as StateBreakdownRow[],
    [revenue],
  );
  const timeSeriesData = useMemo<TimeSeriesRow[]>(
    () => timeSeries as TimeSeriesRow[],
    [timeSeries],
  );

  if (loading) return <div className="max-w-7xl mx-auto space-y-8 p-8"><p className="text-text-secondary">Loading revenue data...</p></div>;
  if (error || !revenue) return (
    <div className="max-w-7xl mx-auto space-y-8 p-8">
      <p className="text-feedback-error">{error || "No data"}</p>
      <button
        type="button"
        onClick={handleRefresh}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-surface-container-high px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-container-highest"
      >
        Retry
      </button>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">Revenue Dashboard</h2>
          <p className="text-text-secondary mt-2 font-body text-sm">MRR, ARR, churn, and state-wise revenue breakdown.</p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-surface-container-high px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-container-highest"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="MRR" value={`₹${formatINR(revenue.mrr_paisa)}`} accent />
        <MetricCard label="ARR" value={`₹${formatINR(revenue.arr_paisa)}`} accent />
        <MetricCard label="Churn Rate" value={`${(revenue.churn_rate ?? 0).toFixed(1)}%`} />
        <MetricCard label="Subscribers" value={String(revenue.total_subscribers ?? 0)} />
      </div>

      <div>
        <h3 className="font-headline text-xl font-bold text-on-surface mb-4">State Breakdown</h3>
        <DataTable<StateBreakdownRow>
          columns={stateBreakdownColumns}
          data={stateBreakdownData}
          rowKey={(row) => row.state_name}
          searchable
          searchKeys={["state_name"]}
          searchPlaceholder="Search states..."
          compareFns={stateBreakdownCompareFns}
          pageSize={50}
          emptyStateMessage="No state breakdown data available."
        />
      </div>

      {timeSeriesData.length > 0 && (
        <div>
          <h3 className="font-headline text-xl font-bold text-on-surface mb-4">Monthly Trend</h3>
          <DataTable<TimeSeriesRow>
            columns={timeSeriesColumns}
            data={timeSeriesData}
            rowKey={(row) => row.period || `${row.revenue_paisa}-${row.subscribers}`}
            compareFns={timeSeriesCompareFns}
            pageSize={50}
            emptyStateMessage="No trend data available."
          />
        </div>
      )}
    </div>
  );
}
