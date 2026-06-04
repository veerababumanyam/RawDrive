"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  listAuditLogs,
  exportAuditLogs,
  getAuditLogDetail,
  type AuditLogEntry,
} from "@/lib/api/admin";
import { Calendar, Clock, Download, Filter, X } from "@/components/icons";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { useInfiniteFetch } from "@/hooks/use-infinite-render";

/* ------------------------------------------------------------------ */
/*  Severity badge                                                     */
/* ------------------------------------------------------------------ */

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, { bg: string; text: string; dot: string }> = {
    info: {
      bg: "bg-feedback-success/10",
      text: "text-feedback-success",
      dot: "bg-feedback-success",
    },
    low: {
      bg: "bg-feedback-success/10",
      text: "text-feedback-success",
      dot: "bg-feedback-success",
    },
    medium: {
      bg: "bg-feedback-warning/10",
      text: "text-feedback-warning",
      dot: "bg-feedback-warning",
    },
    high: {
      bg: "bg-feedback-error/10",
      text: "text-feedback-error",
      dot: "bg-feedback-error",
    },
    critical: {
      bg: "bg-feedback-error/20",
      text: "text-feedback-error",
      dot: "bg-feedback-error",
    },
  };
  const c = colors[severity] || colors.low;
  return (
    <span className={`micro-badge ${c.bg} ${c.text}`}>
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
  if (
    !data ||
    (typeof data === "object" && Object.keys(data as object).length === 0)
  )
    return null;
  return (
    <div>
      <p className="text-caption mb-1 font-label uppercase">{label}</p>
      <pre className="max-h-48 overflow-x-auto overflow-y-auto rounded-xl border border-border-subtle bg-surface-container-low p-3 font-mono text-xs text-text-secondary">
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
        className="modal-backdrop fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Audit log detail"
        className="surface-panel fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto border-l border-border-subtle shadow-2xl animate-in slide-in-from-right duration-200"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-subtle bg-surface px-6 py-4">
          <h3 className="font-headline text-lg font-bold text-text-primary">
            Audit Log Detail
          </h3>
          <GlassIconButton
            type="button"
            onClick={onClose}
            label="Close detail panel"
            size="sm"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </GlassIconButton>
        </div>

        <div className="p-6 space-y-5">
          {/* Timestamp + Severity */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">
              {formatTimestamp(entry.inserted_at)}
            </span>
            <SeverityBadge severity={entry.severity} />
          </div>

          {/* Key fields */}
          {/* QA #53: Actor and User Agent hold emails / UUIDs / long UA
              strings that were being truncated at the ellipsis, hiding
              the very data an admin is auditing. Use the mono (break-all)
              variant so the full value wraps within the cell. */}
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Actor"
              value={entry.actor_email || entry.actor_id}
              mono
            />
            <Field label="Actor Type" value={entry.actor_type || "—"} />
            <Field label="Action" value={entry.action} mono />
            <Field label="Resource Type" value={entry.resource_type || "—"} />
            <Field label="Resource ID" value={entry.resource_id || "—"} mono />
            <Field
              label="Workspace ID"
              value={entry.workspace_id || "—"}
              mono
            />
            <Field label="IP Address" value={entry.ip_address || "—"} mono />
            <Field
              label="User Agent"
              value={entry.user_agent || "—"}
              mono
              className="col-span-2"
            />
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
      <p className="text-caption mb-0.5 font-label uppercase">{label}</p>
      <p
        className={`text-sm text-text-primary ${mono ? "font-mono break-all" : "truncate"}`}
        title={value}
      >
        {value}
      </p>
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

const emptyFilters: FilterState = {
  dateFrom: "",
  dateTo: "",
  actorId: "",
  ipAddress: "",
  severity: "",
};

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
    <div className="table-toolbar-panel p-4">
      <div className="flex items-center gap-2 mb-3">
        <Filter className="h-4 w-4 text-text-tertiary" />
        <span className="text-caption font-label uppercase">
          Advanced Filters
        </span>
        {hasFilters && (
          <GlassButton
            type="button"
            onClick={onClear}
            className="ml-auto"
            variant="quiet"
            size="sm"
            icon={<X className="h-3 w-3" />}
          >
            Clear all
          </GlassButton>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {/* QA T-093 (RawDrive_Testing.xlsx Super Admin sheet): the
            audit-log filters used `type="date"` which truncated the
            query window to whole days. Investigators following a
            sub-hour incident need minute-precision filtering — the
            backend already accepts RFC3339 timestamps, only the input
            type was missing. `datetime-local` keeps the same string
            format the existing onChange + queryString plumbing uses. */}
        <FilterInput
          label="Date from"
          type="datetime-local"
          value={filters.dateFrom}
          onChange={(v) => onChange({ ...filters, dateFrom: v })}
          icon={<Calendar className="h-3.5 w-3.5" />}
        />
        <FilterInput
          label="Date to"
          type="datetime-local"
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
          <label className="text-caption mb-1 block font-label uppercase">
            Severity
          </label>
          <select
            value={filters.severity}
            onChange={(e) => onChange({ ...filters, severity: e.target.value })}
            className="input-base min-w-32 cursor-pointer appearance-none px-3 py-2 text-sm"
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
      <label className="text-caption mb-1 block font-label uppercase">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none">
            {icon}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`input-base min-w-36 ${icon ? "pl-8" : "pl-3"} pr-3 py-2 text-sm placeholder:text-text-tertiary/70`}
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
      <span className="font-mono text-sm text-accent">{value as string}</span>
    ),
  },
  {
    key: "actor_type",
    label: "Actor Type",
    sortable: true,
    render: (value) => (
      <span className="text-sm text-text-tertiary capitalize">
        {(value as string) || "—"}
      </span>
    ),
  },
  {
    key: "resource_type",
    label: "Resource Type",
    sortable: true,
    render: (value) => (
      <span className="text-sm text-text-tertiary">
        {(value as string) || "—"}
      </span>
    ),
  },
  {
    key: "workspace_id",
    label: "Workspace",
    sortable: true,
    render: (value) => (
      <span
        className="text-xs font-mono text-text-tertiary"
        title={value as string}
      >
        {(value as string)?.slice(0, 8) || "—"}
      </span>
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

const AUDIT_PAGE_SIZE = 100;

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
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

  const fetchLogs = useCallback(
    async (f: FilterState, cursor?: string, append = false) => {
      let token = getStoredAccessToken();
      if (!token) {
        const { refreshAuthSession } = await import("@/lib/auth");
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
        token = await refreshAuthSession(API_BASE);
      }
      if (!token) {
        setError("Session expired. Please log in again.");
        setLoading(false);
        return;
      }
      if (append) setLoadingMore(true);
      else setLoading(true);
      const params: Record<string, string> = { limit: String(AUDIT_PAGE_SIZE) };
      if (cursor) params.cursor = cursor;
      if (f.dateFrom) params.date_from = f.dateFrom;
      if (f.dateTo) params.date_to = f.dateTo;
      if (f.actorId) params.actor_id = f.actorId;
      if (f.ipAddress) params.ip_address = f.ipAddress;
      if (f.severity) params.severity = f.severity;
      // QA #59: one-shot retry on transient failure. The admin audit log
      // endpoint occasionally 5xx's under load (Valkey rate-limit false
      // positive, pgxpool saturation). Single 500ms-delayed retry catches
      // most of those without compounding load; persistent failures fall
      // through to the existing error banner.
      const fetchOnce = () => listAuditLogs(token!, params);
      try {
        let res;
        try {
          res = await fetchOnce();
        } catch (firstErr) {
          await new Promise((r) => setTimeout(r, 500));
          try {
            res = await fetchOnce();
          } catch {
            throw firstErr;
          }
        }
        setLogs((prev) =>
          append
            ? [...prev, ...(res.items as AuditLogRow[])]
            : (res.items as AuditLogRow[]),
        );
        setTotal(res.total_count);
        setNextCursor(res.next_cursor);
        setError(null);
      } catch {
        setError("Failed to load audit logs. Try refreshing the page.");
        if (!append) setLogs([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  // Initial fetch — defined inline so the compiler sees a locally-scoped
  // async function rather than an external setState-containing callback.
  useEffect(() => {
    async function initialFetch() {
      await fetchLogs(emptyFilters);
    }
    void initialFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when filters change (debounced for text inputs)
  const handleFilterChange = useCallback(
    (f: FilterState) => {
      setFilters(f);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchLogs(f), 400);
    },
    [fetchLogs],
  );

  const handleClearFilters = useCallback(() => {
    setFilters(emptyFilters);
    fetchLogs(emptyFilters);
  }, [fetchLogs]);

  const handleLoadMore = useCallback(() => {
    if (nextCursor && !loadingMore) fetchLogs(filters, nextCursor, true);
  }, [fetchLogs, filters, nextCursor, loadingMore]);

  // Continuous scrolling: auto-fetch the next cursor page as the operator
  // nears the bottom of the table. handleLoadMore self-guards on
  // loadingMore, so repeated intersections cannot double-fetch. The button
  // below remains as a fallback.
  const auditSentinelRef = useInfiniteFetch(
    Boolean(nextCursor) && !loadingMore,
    handleLoadMore,
  );

  // Row click → open detail
  const handleRowClick = useCallback(async (row: AuditLogRow) => {
    setDetailLoading(true);
    // Show list-level data immediately so panel isn't blank
    setDetailEntry({ ...row, metadata: row.metadata || null } as AuditLogEntry);
    try {
      const token = getStoredAccessToken();
      if (!token) {
        // Token expired — try refreshing
        const { refreshAuthSession } = await import("@/lib/auth");
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
        const newToken = await refreshAuthSession(API_BASE);
        if (newToken) {
          const detail = await getAuditLogDetail(newToken, row.id);
          setDetailEntry(detail);
        }
      } else {
        const detail = await getAuditLogDetail(token, row.id);
        setDetailEntry(detail);
      }
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
          <h2 className="font-headline flex items-center gap-4 text-4xl font-extrabold text-text-primary">
            Audit Logs
            <span className="micro-badge border border-border-subtle bg-surface-container-high text-accent">
              {total} entries
            </span>
          </h2>
          <p className="text-text-secondary mt-2 font-body text-sm">
            Immutable record of every administrative action.
            <span className="micro-badge ml-3 border border-border-subtle bg-surface-container-high text-text-tertiary">
              <Clock className="h-3 w-3" />
              90-day retention
            </span>
          </p>
        </div>
        <GlassButton
          type="button"
          onClick={() => setShowFilters((p) => !p)}
          variant={showFilters ? "primary" : "surface"}
          size="md"
          icon={<Filter className="h-4 w-4" />}
        >
          {showFilters ? "Hide Filters" : "Advanced Filters"}
        </GlassButton>
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
            new Date(a.inserted_at).getTime() -
            new Date(b.inserted_at).getTime(),
        }}
        pageSize={25}
        loading={loading}
        emptyStateMessage="No audit logs found."
        emptyMessage="No audit logs match your filters."
        onRowClick={handleRowClick}
        toolbarActions={
          <GlassButton
            type="button"
            onClick={handleExport}
            disabled={exporting || logs.length === 0}
            variant="surface"
            size="md"
            icon={<Download className="h-4 w-4" />}
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </GlassButton>
        }
      />

      {/* Load more — cursor pagination, auto-triggered on scroll */}
      {(nextCursor || loadingMore) && (
        <div className="flex items-center justify-center gap-3 pt-1">
          <div
            ref={auditSentinelRef}
            data-testid="audit-load-more-sentinel"
            aria-hidden="true"
            className="h-px w-px"
          />
          <GlassButton
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            variant="surface"
            size="md"
          >
            {loadingMore ? "Loading…" : `Load next ${AUDIT_PAGE_SIZE} entries`}
          </GlassButton>
          <span className="text-xs text-text-tertiary">
            {logs.length.toLocaleString()} of {total.toLocaleString()} loaded
          </span>
        </div>
      )}

      {/* Detail slide-over */}
      <DetailPanel entry={detailEntry} onClose={() => setDetailEntry(null)} />

      {/* Detail loading overlay */}
      {detailLoading && detailEntry && (
        <div className="fixed right-0 top-0 z-50 h-full w-full max-w-lg flex items-center justify-center">
          <div className="animate-pulse text-text-tertiary text-sm">
            Loading details...
          </div>
        </div>
      )}
    </div>
  );
}
