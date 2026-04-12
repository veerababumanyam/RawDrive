"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  listAuditLogs,
  exportAuditLogs,
  getAuditLogDetail,
  type AuditLogEntry,
} from "@/lib/api/admin";
import { Calendar, Clock, Download, Filter, X } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";

/* ------------------------------------------------------------------ */
/*  Severity badge                                                     */
/* ------------------------------------------------------------------ */

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, { bg: string; text: string; dot: string }> = {
    info: { bg: "bg-feedback-success/10", text: "text-feedback-success", dot: "bg-feedback-success" },
    low: { bg: "bg-feedback-success/10", text: "text-feedback-success", dot: "bg-feedback-success" },
    medium: { bg: "bg-feedback-warning/10", text: "text-feedback-warning", dot: "bg-feedback-warning" },
    high: { bg: "bg-feedback-error/10", text: "text-feedback-error", dot: "bg-feedback-error" },
    critical: { bg: "bg-feedback-error/20", text: "text-feedback-error/70", dot: "bg-feedback-error/50" },
  };
  const c = colors[severity] || colors.low;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${c.bg} ${c.text} text-[10px] font-bold uppercase`}>
      <span className={`w-1 h-1 rounded-full ${c.dot}`} />
      {severity}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Audit log detail slide-over panel                                  */
/* ------------------------------------------------------------------ */

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, { timeZoneName: "short" });
}

function JsonBlock({ data, label }: { data: unknown; label: string }) {
  if (!data || (typeof data === "object" && Object.keys(data as object).length === 0)) return null;
  return (
    <div>
      <p className="text-[10px] font-label uppercase tracking-[0.1em] text-text-tertiary mb-1">{label}</p>
      <pre className="bg-surface-container-lowest rounded-xl p-3 text-xs font-mono text-text-secondary overflow-x-auto max-h-48 overflow-y-auto border border-white/[0.04]">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function DetailPanel({
  entry,
  onClose,
}: {
  entry: AuditLogEntry | null;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!entry) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [entry, onClose]);

  if (!entry) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Audit log detail"
        className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto surface-panel shadow-2xl border-l border-white/[0.06] animate-in slide-in-from-right duration-200"
      >
        <div className="sticky top-0 z-10 glass-surface flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h3 className="font-headline text-lg font-bold text-on-surface">Audit Log Detail</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail panel"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-surface-container-high hover:text-on-surface transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Timestamp + Severity */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">{formatTimestamp(entry.inserted_at)}</span>
            <SeverityBadge severity={entry.severity} />
          </div>

          {/* Key fields */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Actor" value={entry.actor_email || entry.actor_id} />
            <Field label="Actor Type" value={entry.actor_type || "—"} />
            <Field label="Action" value={entry.action} mono />
            <Field label="Resource Type" value={entry.resource_type || "—"} />
            <Field label="Resource ID" value={entry.resource_id || "—"} mono />
            <Field label="Workspace ID" value={entry.workspace_id || "—"} mono />
            <Field label="IP Address" value={entry.ip_address || "—"} mono />
            <Field label="User Agent" value={entry.user_agent || "—"} className="col-span-2" />
          </div>

          {/* Metadata */}
          <JsonBlock data={entry.metadata} label="Metadata" />

          {/* Before / After state diff */}
          {(entry.before || entry.after) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <JsonBlock data={entry.before} label="Before State" />
              <JsonBlock data={entry.after} label="After State" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] font-label uppercase tracking-[0.1em] text-text-tertiary mb-0.5">{label}</p>
      <p className={`text-sm text-text-primary truncate ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Advanced filters bar                                               */
/* ------------------------------------------------------------------ */

interface FilterState {
  dateFrom: string;
  dateTo: string;
  actorId: string;
  ipAddress: string;
  severity: string;
}

const emptyFilters: FilterState = { dateFrom: "", dateTo: "", actorId: "", ipAddress: "", severity: "" };

function AdvancedFilters({
  filters,
  onChange,
  onClear,
}: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onClear: () => void;
}) {
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="bg-surface-container-low/40 backdrop-blur-md border border-white/[0.03] p-4 rounded-2xl shadow-xl">
      <div className="flex items-center gap-2 mb-3">
        <Filter className="h-4 w-4 text-text-tertiary" />
        <span className="text-xs font-label uppercase tracking-[0.1em] text-text-tertiary">Advanced Filters</span>
        {hasFilters && (
          <button
            onClick={onClear}
            className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-text-secondary hover:text-on-surface hover:bg-white/[0.06] transition-colors"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <FilterInput
          label="Date from"
          type="date"
          value={filters.dateFrom}
          onChange={(v) => onChange({ ...filters, dateFrom: v })}
          icon={<Calendar className="h-3.5 w-3.5" />}
        />
        <FilterInput
          label="Date to"
          type="date"
          value={filters.dateTo}
          onChange={(v) => onChange({ ...filters, dateTo: v })}
          icon={<Calendar className="h-3.5 w-3.5" />}
        />
        <FilterInput
          label="Actor (UUID)"
          type="text"
          value={filters.actorId}
          onChange={(v) => onChange({ ...filters, actorId: v })}
          placeholder="e.g. 3c4fb9e0-..."
        />
        <FilterInput
          label="IP Address"
          type="text"
          value={filters.ipAddress}
          onChange={(v) => onChange({ ...filters, ipAddress: v })}
          placeholder="e.g. 192.168"
        />
        <div>
          <label className="block text-[10px] font-label uppercase tracking-[0.1em] text-text-tertiary mb-1">Severity</label>
          <select
            value={filters.severity}
            onChange={(e) => onChange({ ...filters, severity: e.target.value })}
            className="appearance-none bg-surface-container-lowest border border-white/[0.06] rounded-xl px-3 py-2 text-sm text-on-surface focus:ring-2 focus:ring-secondary/50 outline-none cursor-pointer min-w-[120px]"
          >
            <option value="">All</option>
            <option value="info">Info</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function FilterInput({
  label,
  type,
  value,
  onChange,
  placeholder,
  icon,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] font-label uppercase tracking-[0.1em] text-text-tertiary mb-1">{label}</label>
      <div className="relative">
        {icon && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none">{icon}</span>}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`bg-surface-container-lowest border border-white/[0.06] rounded-xl ${icon ? "pl-8" : "pl-3"} pr-3 py-2 text-sm text-on-surface focus:ring-2 focus:ring-secondary/50 outline-none placeholder:text-text-tertiary/50 min-w-[140px]`}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Columns                                                            */
/* ------------------------------------------------------------------ */

type AuditLogRow = AuditLogEntry & Record<string, unknown>;

const columns: ColumnDef<AuditLogRow>[] = [
  {
    key: "inserted_at",
    label: "Timestamp",
    sortable: true,
    render: (value) => (
      <span className="text-xs text-text-secondary font-label">
        {formatTimestamp(value as string)}
      </span>
    ),
  },
  {
    key: "actor_email",
    label: "Actor",
    sortable: true,
    accessor: (row) => row.actor_email || row.actor_id,
    render: (value) => (
      <span className="text-sm text-text-tertiary">{value as string}</span>
    ),
  },
  {
    key: "action",
    label: "Action",
    sortable: true,
    render: (value) => (
      <span className="text-sm font-mono text-secondary">{value as string}</span>
    ),
  },
  {
    key: "resource_type",
    label: "Resource",
    sortable: true,
    render: (value) => (
      <span className="text-sm text-text-tertiary">{value as string}</span>
    ),
  },
  {
    key: "severity",
    label: "Severity",
    sortable: true,
    render: (value) => <SeverityBadge severity={value as string} />,
  },
  {
    key: "ip_address",
    label: "IP",
    sortable: true,
    render: (value) => (
      <span className="text-xs text-text-secondary font-mono">
        {(value as string) || "\u2014"}
      </span>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Advanced filters — server-side
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);

  // Detail panel
  const [detailEntry, setDetailEntry] = useState<AuditLogEntry | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Debounce timer for text filters
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchLogs = useCallback(async (f: FilterState) => {
    const token = getStoredAccessToken();
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "1000" };
      if (f.dateFrom) params.date_from = f.dateFrom;
      if (f.dateTo) params.date_to = f.dateTo;
      if (f.actorId) params.actor_id = f.actorId;
      if (f.ipAddress) params.ip_address = f.ipAddress;
      if (f.severity) params.severity = f.severity;
      const res = await listAuditLogs(token, params);
      setLogs(res.items as AuditLogRow[]);
      setTotal(res.total_count);
      setError(null);
    } catch {
      setError("Failed to load audit logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchLogs(emptyFilters);
  }, [fetchLogs]);

  // Re-fetch when filters change (debounced for text inputs)
  const handleFilterChange = useCallback((f: FilterState) => {
    setFilters(f);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchLogs(f), 400);
  }, [fetchLogs]);

  const handleClearFilters = useCallback(() => {
    setFilters(emptyFilters);
    fetchLogs(emptyFilters);
  }, [fetchLogs]);

  // Row click → open detail
  const handleRowClick = useCallback(async (row: AuditLogRow) => {
    setDetailLoading(true);
    setDetailEntry(row as AuditLogEntry);
    try {
      const token = getStoredAccessToken();
      const detail = await getAuditLogDetail(token, row.id);
      setDetailEntry(detail);
    } catch {
      // Keep the list-level data if detail fetch fails
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleExport = async () => {
    const token = getStoredAccessToken();
    setExporting(true);
    try {
      const blob = await exportAuditLogs(token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail — user can retry
    } finally {
      setExporting(false);
    }
  };

  if (error && logs.length === 0) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 p-8">
        <p className="text-feedback-error">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface flex items-center gap-4">
            Audit Logs
            <span className="text-xs font-label uppercase tracking-[0.15em] bg-surface-container-high px-3 py-1 rounded-full text-primary border border-white/5">
              {total} entries
            </span>
          </h2>
          <p className="text-text-secondary mt-2 font-body text-sm">
            Immutable record of every administrative action.
            <span className="ml-3 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-high text-[10px] font-label uppercase tracking-[0.1em] text-text-tertiary border border-white/5">
              <Clock className="h-3 w-3" />
              90-day retention
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((p) => !p)}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
            showFilters
              ? "bg-primary/10 text-primary"
              : "bg-surface-container-lowest text-text-secondary hover:bg-surface-container-high hover:text-on-surface"
          }`}
        >
          <Filter className="h-4 w-4" />
          {showFilters ? "Hide Filters" : "Advanced Filters"}
        </button>
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <AdvancedFilters
          filters={filters}
          onChange={handleFilterChange}
          onClear={handleClearFilters}
        />
      )}

      {loading && (
        <p className="text-sm text-text-tertiary" aria-live="polite">
          Loading audit logs...
        </p>
      )}

      {/* Data table */}
      <DataTable<AuditLogRow>
        columns={columns}
        data={logs}
        rowKey={(row) => row.id}
        searchable
        searchKeys={["action", "actor_email", "resource_type"]}
        searchPlaceholder="Search audit logs..."
        initialSort={{ key: "inserted_at", direction: "desc" }}
        compareFns={{
          inserted_at: (a, b) =>
            new Date(a.inserted_at).getTime() - new Date(b.inserted_at).getTime(),
        }}
        pageSize={25}
        loading={loading}
        emptyStateMessage="No audit logs found."
        emptyMessage="No audit logs match your filters."
        onRowClick={handleRowClick}
        toolbarActions={
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || logs.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-surface-container-lowest px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:opacity-40 disabled:pointer-events-none"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        }
      />

      {/* Detail slide-over */}
      <DetailPanel
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
      />

      {/* Detail loading overlay */}
      {detailLoading && detailEntry && (
        <div className="fixed right-0 top-0 z-50 h-full w-full max-w-lg flex items-center justify-center">
          <div className="animate-pulse text-text-tertiary text-sm">Loading details...</div>
        </div>
      )}
    </div>
  );
}
