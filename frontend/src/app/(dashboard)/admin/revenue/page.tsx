"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredAccessToken } from "@/lib/auth";
import {
  downloadRevenueRecordsPDF,
  emailRevenueRecordsToDealer,
  exportRevenue,
  getRevenueDashboard,
  getRevenueTimeSeries,
  searchRevenueRecords,
  type RevenueData,
  type RevenueRecord,
  type RevenueRecordFilter,
  type RevenueRecordsResponse,
  type RevenueTimeSeries,
} from "@/lib/api/admin";
import { getStates, type StateRef } from "@/lib/api/dealer";
import { getDistrictsForState } from "@/lib/data/india-districts";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";

// Backend fields can come back null/undefined when there is no data for a
// given period (e.g. no paid subscriptions yet, empty state buckets). Guard
// against non-finite math so the UI renders "₹0" instead of "₹NaN".
function formatINR(paisa: number | null | undefined): string {
  const n = typeof paisa === "number" && Number.isFinite(paisa) ? paisa : 0;
  return (n / 100).toLocaleString("en-IN");
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-surface-container-low/40 glass-blur-medium border border-text-media/5 p-6 rounded-2xl">
      <p className="text-[10px] uppercase tracking-[0.1em] text-text-secondary font-label">
        {label}
      </p>
      <p
        className={`text-3xl font-bold font-headline mt-2 ${accent ? "text-primary" : "text-on-surface"}`}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Row types cast-compatible with DataTable's Record<string, unknown> constraint ──

type StateBreakdownRow = {
  state_name: string;
  revenue_paisa: number;
  subscriber_count: number;
} & Record<string, unknown>;
type TimeSeriesRow = RevenueTimeSeries & Record<string, unknown>;
type RevenueRecordRow = RevenueRecord & Record<string, unknown>;

// ─── Column definitions (stable refs via module scope) ──

const stateBreakdownColumns: ColumnDef<StateBreakdownRow>[] = [
  { key: "state_name", label: "State", sortable: true },
  {
    key: "revenue_paisa",
    label: "Revenue",
    sortable: true,
    render: (_v, row) => (
      <span className="text-primary font-medium">
        ₹{formatINR(row.revenue_paisa)}
      </span>
    ),
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
    render: (_v, row) => (
      <span className="text-primary font-medium">
        ₹{formatINR(row.revenue_paisa)}
      </span>
    ),
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

const revenueRecordColumns: ColumnDef<RevenueRecordRow>[] = [
  { key: "district", label: "District", sortable: true },
  {
    key: "revenue_paisa",
    label: "Revenue",
    sortable: true,
    render: (_v, row) => (
      <span className="text-primary font-medium">
        ₹{formatINR(row.revenue_paisa)}
      </span>
    ),
  },
  { key: "subscriber_count", label: "Subscribers", sortable: true },
  {
    key: "dealer_share_paisa",
    label: "Dealer Share",
    sortable: true,
    render: (_v, row) => (
      <span className="text-primary font-medium">
        ₹{formatINR(row.dealer_share_paisa)}
      </span>
    ),
  },
];

const revenueRecordCompareFns = {
  revenue_paisa: (a: RevenueRecordRow, b: RevenueRecordRow) =>
    (a.revenue_paisa ?? 0) - (b.revenue_paisa ?? 0),
  dealer_share_paisa: (a: RevenueRecordRow, b: RevenueRecordRow) =>
    (a.dealer_share_paisa ?? 0) - (b.dealer_share_paisa ?? 0),
};

function reportFilenamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminRevenuePage() {
  const router = useRouter();
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [timeSeries, setTimeSeries] = useState<RevenueTimeSeries[]>([]);
  const [states, setStates] = useState<StateRef[]>([]);
  const [selectedStateId, setSelectedStateId] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [report, setReport] = useState<RevenueRecordsResponse | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState<"csv" | "pdf" | null>(
    null,
  );
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportNotice, setReportNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    const token = getStoredAccessToken();
    Promise.all([
      getRevenueDashboard(token),
      getRevenueTimeSeries(token, { period: "monthly" }),
    ])
      .then(([rev, ts]) => {
        // Backend returns null for empty state_breakdown and null for
        // empty time-series arrays. Coerce to empty arrays so the
        // page's .map() calls don't throw on undefined. Same pattern
        // we've been applying across every list page touched during
        // UAT on 2026-04-12.
        const safeRev = rev
          ? {
              ...rev,
              state_breakdown: Array.isArray(rev.state_breakdown)
                ? rev.state_breakdown
                : [],
            }
          : rev;
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

  const handleExportRevenue = useCallback(async (format: "csv" | "pdf") => {
    const token = getStoredAccessToken();
    setExportLoading(format);
    setExportError(null);
    try {
      const blob = await exportRevenue(token, {
        granularity: "month",
        format,
      });
      downloadBlob(blob, `revenue-export.${format}`);
    } catch {
      setExportError(`Failed to export revenue ${format.toUpperCase()}`);
    } finally {
      setExportLoading(null);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;
    getStates()
      .then((items) => {
        if (!cancelled) setStates(items);
      })
      .catch(() => {
        if (!cancelled) setReportError("Failed to load state list");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Memoize data arrays so DataTable doesn't re-render on every parent render
  const stateBreakdownData = useMemo<StateBreakdownRow[]>(
    () => (revenue?.state_breakdown ?? []) as StateBreakdownRow[],
    [revenue],
  );
  const timeSeriesData = useMemo<TimeSeriesRow[]>(
    () => timeSeries as TimeSeriesRow[],
    [timeSeries],
  );
  const selectedState = useMemo(
    () => states.find((state) => String(state.id) === selectedStateId) ?? null,
    [states, selectedStateId],
  );
  const districtOptions = useMemo(
    () => getDistrictsForState(selectedState?.name ?? ""),
    [selectedState],
  );
  const reportRows = useMemo<RevenueRecordRow[]>(
    () => (report?.records ?? []) as RevenueRecordRow[],
    [report],
  );

  const getReportFilter = useCallback((): RevenueRecordFilter | null => {
    const stateId = Number(selectedStateId);
    if (!Number.isInteger(stateId) || stateId <= 0) {
      setReportError("Select a state before searching revenue records");
      return null;
    }
    return {
      state_id: stateId,
      district: selectedDistrict || undefined,
    };
  }, [selectedDistrict, selectedStateId]);

  const handleSearchRecords = useCallback(async () => {
    const params = getReportFilter();
    if (!params) return;
    const token = getStoredAccessToken();
    setReportLoading(true);
    setReportError(null);
    setReportNotice(null);
    try {
      const result = await searchRevenueRecords(token, params);
      setReport({
        ...result,
        records: Array.isArray(result.records) ? result.records : [],
      });
    } catch {
      setReportError("Failed to search revenue records");
    } finally {
      setReportLoading(false);
    }
  }, [getReportFilter]);

  const handleDownloadPDF = useCallback(async () => {
    const params = getReportFilter();
    if (!params) return;
    const token = getStoredAccessToken();
    setPdfLoading(true);
    setReportError(null);
    setReportNotice(null);
    try {
      const blob = await downloadRevenueRecordsPDF(token, params);
      const statePart = reportFilenamePart(selectedState?.name ?? "state");
      const districtPart = selectedDistrict
        ? `-${reportFilenamePart(selectedDistrict)}`
        : "";
      downloadBlob(blob, `revenue-report-${statePart}${districtPart}.pdf`);
    } catch {
      setReportError("Failed to download revenue PDF");
    } finally {
      setPdfLoading(false);
    }
  }, [getReportFilter, selectedDistrict, selectedState]);

  const handleEmailDealer = useCallback(async () => {
    const params = getReportFilter();
    if (!params) return;
    const token = getStoredAccessToken();
    setEmailLoading(true);
    setReportError(null);
    setReportNotice(null);
    try {
      const result = await emailRevenueRecordsToDealer(token, params);
      setReportNotice(`Report emailed to ${result.sent_to}.`);
    } catch {
      setReportError("Failed to email dealer report");
    } finally {
      setEmailLoading(false);
    }
  }, [getReportFilter]);

  if (loading)
    return (
      <div className="max-w-7xl mx-auto space-y-8 p-8">
        <p className="text-text-secondary">Loading revenue data...</p>
      </div>
    );
  if (error || !revenue)
    return (
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
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">
            Revenue Dashboard
          </h2>
          <p className="text-text-secondary mt-2 font-body text-sm">
            MRR, ARR, churn, and state-wise revenue breakdown.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleExportRevenue("csv")}
            disabled={exportLoading !== null}
            className="touch-min inline-flex items-center rounded-xl bg-surface-container-high px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exportLoading === "csv" ? "Exporting..." : "Export CSV"}
          </button>
          <button
            type="button"
            onClick={() => void handleExportRevenue("pdf")}
            disabled={exportLoading !== null}
            className="touch-min inline-flex items-center rounded-xl bg-surface-container-high px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exportLoading === "pdf" ? "Exporting..." : "Export PDF"}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            className="touch-min inline-flex items-center rounded-xl bg-surface-container-high px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-container-highest"
          >
            Refresh
          </button>
        </div>
      </div>
      {exportError && (
        <p className="text-sm text-feedback-error">{exportError}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="MRR"
          value={`₹${formatINR(revenue.mrr_paisa)}`}
          accent
        />
        <MetricCard
          label="ARR"
          value={`₹${formatINR(revenue.arr_paisa)}`}
          accent
        />
        <MetricCard
          label="Churn Rate"
          value={`${(revenue.churn_rate ?? 0).toFixed(1)}%`}
        />
        <MetricCard
          label="Subscribers"
          value={String(revenue.total_subscribers ?? 0)}
        />
      </div>

      <div className="table-toolbar-panel p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <label
              htmlFor="revenue-report-state"
              className="mb-1 block text-sm font-medium text-text-secondary"
            >
              State
            </label>
            <select
              id="revenue-report-state"
              value={selectedStateId}
              onChange={(event) => {
                setSelectedStateId(event.target.value);
                setSelectedDistrict("");
                setReport(null);
                setReportError(null);
                setReportNotice(null);
              }}
              className="input-base min-h-11 w-full cursor-pointer"
            >
              <option value="">Select state</option>
              {states.map((state) => (
                <option key={state.id} value={state.id}>
                  {state.name}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-52 flex-1">
            <label
              htmlFor="revenue-report-district"
              className="mb-1 block text-sm font-medium text-text-secondary"
            >
              District
            </label>
            <select
              id="revenue-report-district"
              value={selectedDistrict}
              onChange={(event) => {
                setSelectedDistrict(event.target.value);
                setReport(null);
                setReportError(null);
                setReportNotice(null);
              }}
              disabled={!selectedStateId}
              className="input-base min-h-11 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">All districts</option>
              {districtOptions.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleSearchRecords}
            disabled={!selectedStateId || reportLoading}
            className="touch-min inline-flex items-center rounded-xl bg-surface-container-high px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reportLoading ? "Searching..." : "Search revenue"}
          </button>
          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={!selectedStateId || pdfLoading}
            className="touch-min inline-flex items-center rounded-xl bg-surface-container-high px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pdfLoading ? "Preparing..." : "Download PDF"}
          </button>
          <button
            type="button"
            onClick={handleEmailDealer}
            disabled={!selectedStateId || emailLoading}
            className="touch-min inline-flex items-center rounded-xl bg-surface-container-high px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-50"
          >
            {emailLoading ? "Sending..." : "Email dealer"}
          </button>
        </div>

        {reportError && (
          <p className="text-sm text-feedback-error">{reportError}</p>
        )}
        {reportNotice && (
          <p className="text-sm text-feedback-success">{reportNotice}</p>
        )}

        {report && (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-label uppercase text-text-secondary">
                  Report Revenue
                </dt>
                <dd className="mt-1 text-2xl font-bold text-primary">
                  ₹{formatINR(report.total_revenue_paisa)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-label uppercase text-text-secondary">
                  Dealer Share
                </dt>
                <dd className="mt-1 text-2xl font-bold text-primary">
                  ₹{formatINR(report.total_dealer_share_paisa)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-label uppercase text-text-secondary">
                  Subscribers
                </dt>
                <dd className="mt-1 text-2xl font-bold text-on-surface">
                  {report.total_subscribers}
                </dd>
              </div>
            </dl>
            {report.dealer && (
              <p className="text-sm text-text-secondary">
                Dealer:{" "}
                <span className="font-medium text-text-primary">
                  {report.dealer.business_name}
                </span>{" "}
                ({report.dealer.commission_rate_pct.toFixed(2)}%)
              </p>
            )}
            <DataTable<RevenueRecordRow>
              columns={revenueRecordColumns}
              data={reportRows}
              rowKey={(row) => `${row.state_id}-${row.district}`}
              compareFns={revenueRecordCompareFns}
              pageSize={25}
              emptyStateMessage="No revenue records found for this filter."
            />
          </div>
        )}
      </div>

      <div>
        <h3 className="font-headline text-xl font-bold text-on-surface mb-4">
          State Breakdown
        </h3>
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
          <h3 className="font-headline text-xl font-bold text-on-surface mb-4">
            Monthly Trend
          </h3>
          <DataTable<TimeSeriesRow>
            columns={timeSeriesColumns}
            data={timeSeriesData}
            rowKey={(row) =>
              row.period || `${row.revenue_paisa}-${row.subscribers}`
            }
            compareFns={timeSeriesCompareFns}
            pageSize={50}
            emptyStateMessage="No trend data available."
          />
        </div>
      )}
    </div>
  );
}
