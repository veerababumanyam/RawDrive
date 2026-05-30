// Design source: Stitch MCP Liquid Glass — glass-card list with status badges
"use client";

import { useState, useEffect } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { useDataTable } from "@/hooks/use-data-table";
import { TableToolbar } from "@/components/ui/table-toolbar";

interface Payout {
  id: string;
  period_start: string;
  period_end: string;
  gross_attributed_revenue: number;
  commission_earned: number;
  tds_withheld: number;
  net_payable: number;
  status: string;
  paid_at: string | null;
  [key: string]: unknown;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function formatPaisa(paisa: number): string {
  return `₹${(paisa / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

const statusColors: Record<string, string> = {
  draft: "bg-text-tertiary/10 text-text-tertiary",
  pending: "bg-feedback-warning/10 text-feedback-warning",
  approved: "bg-accent-primary/10 text-accent-primary",
  processing: "bg-accent-secondary/10 text-accent-secondary",
  paid: "bg-feedback-success/10 text-feedback-success",
  failed: "bg-feedback-error/10 text-feedback-error",
};

const SORT_OPTIONS = [
  { key: "period_start", label: "Period Start" },
  { key: "status", label: "Status" },
  { key: "commission_earned", label: "Commission" },
  { key: "net_payable", label: "Net Payable" },
];

const STATUS_FILTER = {
  key: "status",
  label: "Status",
  options: ["draft", "pending", "approved", "processing", "paid", "failed"],
};

export default function PayoutHistory() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredAccessToken();
    fetch(`${API_BASE}/api/v1/dealers/payouts`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPayouts(Array.isArray(d) ? d : []))
      .catch(() => setPayouts([]))
      .finally(() => setLoading(false));
  }, []);

  const table = useDataTable<Payout>({
    data: payouts,
    pageSize: 10,
    searchKeys: ["status"],
    compareFns: {
      period_start: (a, b) =>
        new Date(a.period_start).getTime() - new Date(b.period_start).getTime(),
      commission_earned: (a, b) => a.commission_earned - b.commission_earned,
      net_payable: (a, b) => a.net_payable - b.net_payable,
    },
  });

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card p-6 h-28 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Payout History</h1>

      <TableToolbar
        searchable
        searchPlaceholder="Search by status..."
        searchValue={table.searchQuery}
        onSearchChange={table.setSearchQuery}
        filters={[STATUS_FILTER]}
        getFilterValue={table.getColumnFilterValue}
        onFilterChange={table.setColumnFilter}
        sortOptions={SORT_OPTIONS}
        currentSortKey={table.sort?.key ?? null}
        currentSortDirection={table.sort?.direction ?? null}
        onSortChange={table.toggleSort}
        hasActiveFilters={table.searchQuery !== "" || table.columnFilters.length > 0}
        onClearAll={table.clearAllFilters}
      />

      {table.filteredCount === 0 ? (
        <div className="glass-card p-8 text-center text-text-secondary">No payouts found.</div>
      ) : (
        <div className="space-y-4">
          {table.pageData.map((p) => (
            <div key={p.id} className="glass-card p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-text-secondary">
                  {new Date(p.period_start).toLocaleDateString("en-IN")} –{" "}
                  {new Date(p.period_end).toLocaleDateString("en-IN")}
                </p>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[p.status] || ""}`}>
                  {p.status}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-text-tertiary">Gross Revenue</p>
                  <p className="text-sm font-medium text-text-primary">{formatPaisa(p.gross_attributed_revenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">Commission</p>
                  <p className="text-sm font-medium text-accent-primary">{formatPaisa(p.commission_earned)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">TDS</p>
                  <p className="text-sm font-medium text-feedback-error">{formatPaisa(p.tds_withheld)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">Net Payable</p>
                  <p className="text-sm font-bold text-text-primary">{formatPaisa(p.net_payable)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {table.pageCount > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-text-tertiary">
            Showing {table.page * table.pageSize + 1}–
            {Math.min((table.page + 1) * table.pageSize, table.filteredCount)} of{" "}
            {table.filteredCount}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={table.previousPage}
              disabled={!table.canPreviousPage}
              className="rounded-xl border border-white/[0.06] px-3 py-2 text-sm text-text-secondary hover:bg-white/[0.06] disabled:opacity-30 transition-all min-h-[44px]"
            >
              Previous
            </button>
            <span className="text-sm text-text-tertiary">
              Page {table.page + 1} of {table.pageCount}
            </span>
            <button
              onClick={table.nextPage}
              disabled={!table.canNextPage}
              className="rounded-xl border border-white/[0.06] px-3 py-2 text-sm text-text-secondary hover:bg-white/[0.06] disabled:opacity-30 transition-all min-h-[44px]"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
