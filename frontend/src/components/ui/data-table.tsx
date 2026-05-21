"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronUp,
  ChevronDown,
  ChevronUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronDoubleLeft,
  ChevronDoubleRight,
  Search,
  Funnel,
  XMark,
} from "@/components/icons";
import {
  useDataTable,
  type SortDirection,
  type UseDataTableOptions,
} from "@/hooks/use-data-table";

// ─── Column Definition ──────────────────────────────────────────────────────

export interface ColumnDef<T> {
  /** Unique key for this column — also used as sort/filter key. */
  key: string;
  /** Header label. */
  label: string;
  /** Extract the display value from a row. Falls back to row[key]. */
  accessor?: (row: T) => unknown;
  /** Custom cell renderer. Receives the accessor value and the full row. */
  render?: (value: unknown, row: T) => ReactNode;
  /** Enable column sorting. */
  sortable?: boolean;
  /** Enable column filter dropdown. Provide explicit options. */
  filterable?: boolean;
  filterOptions?: string[];
  /** Header text alignment. */
  headerAlign?: "left" | "center" | "right";
  /** Cell text alignment. */
  align?: "left" | "center" | "right";
  /** Cell className override. */
  className?: string;
  /** Min width CSS value. */
  minWidth?: string;
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface DataTableProps<T extends Record<string, unknown>> {
  /** Column definitions. */
  columns: ColumnDef<T>[];
  /** Raw data array. */
  data: T[];
  /** Unique key extractor for each row. */
  rowKey: (row: T) => string;
  /** Enable the search bar. */
  searchable?: boolean;
  /** Search input placeholder text. */
  searchPlaceholder?: string;
  /** Keys to match against for text search. */
  searchKeys?: (keyof T & string)[];
  /** Rows per page. Default 20. */
  pageSize?: number;
  /** Message shown when data is empty after filtering. */
  emptyMessage?: string;
  /** Message shown when data is empty before any filtering. */
  emptyStateMessage?: string;
  /** Loading state. */
  loading?: boolean;
  /** Action buttons rendered in the toolbar (right side). */
  toolbarActions?: ReactNode;
  /** Additional class on the outer wrapper. */
  className?: string;
  /** Row click handler. */
  onRowClick?: (row: T) => void;
  /** Pass-through for custom compare functions. */
  compareFns?: UseDataTableOptions<T>["compareFns"];
  /** Initial sort state. */
  initialSort?: UseDataTableOptions<T>["initialSort"];
  /** Optional: callback when search changes (for server-side search). */
  onSearchChange?: (query: string) => void;
}

// ─── Sort Icon ──────────────────────────────────────────────────────────────

function SortIcon({ direction }: { direction: SortDirection | null }) {
  if (direction === "asc") return <ChevronUp className="h-3.5 w-3.5 text-primary" />;
  if (direction === "desc") return <ChevronDown className="h-3.5 w-3.5 text-primary" />;
  return <ChevronUpDown className="h-3.5 w-3.5 opacity-30 group-hover:opacity-60 transition-opacity" />;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  searchable = false,
  searchPlaceholder = "Search...",
  searchKeys = [],
  pageSize = 20,
  emptyMessage = "No results found.",
  emptyStateMessage,
  loading = false,
  toolbarActions,
  className,
  onRowClick,
  compareFns,
  initialSort,
  onSearchChange,
}: DataTableProps<T>) {
  const table = useDataTable<T>({
    data,
    pageSize,
    searchKeys,
    compareFns,
    initialSort,
  });

  const hasActiveFilters = table.searchQuery || table.columnFilters.length > 0;
  const filterableColumns = columns.filter((c) => c.filterable && c.filterOptions?.length);

  const handleSearch = (q: string) => {
    table.setSearchQuery(q);
    onSearchChange?.(q);
  };

  // ─── Loading ──
  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="animate-pulse space-y-3">
          <div className="h-12 bg-surface-container-low/40 rounded-2xl" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 bg-surface-container-low/20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Truly empty (no data at all) ──
  if (data.length === 0 && !hasActiveFilters) {
    return (
      <div className={cn("text-center py-16 text-text-secondary", className)}>
        {emptyStateMessage || emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* ─── Toolbar ─── */}
      {(searchable || filterableColumns.length > 0 || toolbarActions) && (
        <div className="bg-surface-container-low/40 backdrop-blur-md border border-white/[0.03] p-4 rounded-2xl shadow-xl">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            {searchable && (
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={table.searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full bg-surface-container-lowest border-none rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-secondary/50 transition-all outline-none placeholder:text-text-tertiary/50"
                />
              </div>
            )}

            {/* Column Filters */}
            {filterableColumns.map((col) => (
              <div key={col.key} className="relative">
                <select
                  value={table.getColumnFilterValue(col.key)}
                  onChange={(e) => table.setColumnFilter(col.key, e.target.value)}
                  className="appearance-none bg-surface-container-lowest border border-white/[0.06] rounded-xl pl-3 pr-8 py-2.5 text-sm text-on-surface focus:ring-2 focus:ring-secondary/50 outline-none cursor-pointer [&_option]:bg-[var(--surface-container-lowest)] [&_option]:text-[var(--on-surface)]"
                >
                  <option value="">All {col.label}</option>
                  {col.filterOptions!.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </option>
                  ))}
                </select>
                <Funnel className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary pointer-events-none" />
              </div>
            ))}

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                onClick={table.clearAllFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-text-secondary hover:text-on-surface hover:bg-white/[0.06] transition-colors"
              >
                <XMark className="h-3.5 w-3.5" />
                Clear
              </button>
            )}

            {/* Spacer + Actions */}
            {toolbarActions && <div className="ml-auto flex items-center gap-2">{toolbarActions}</div>}
          </div>
        </div>
      )}

      {/* ─── Results Summary ─── */}
      {hasActiveFilters && (
        <p className="text-xs text-text-tertiary px-1">
          Showing {table.filteredCount} of {table.totalCount} results
        </p>
      )}

      {/* ─── Table ─── */}
      {table.filteredCount === 0 ? (
        <div className="text-center py-12 text-text-secondary">{emptyMessage}</div>
      ) : (
        <div className="bg-surface-container-low/20 border border-white/[0.03] rounded-2xl overflow-hidden backdrop-blur-sm">
          <div className="overflow-x-auto overflow-y-auto max-h-[75vh]">
            <table className="w-full table-auto text-left border-collapse">
              <thead>
                <tr className="text-text-secondary font-label text-[10px] uppercase tracking-[0.1em]">
                  {columns.map((col) => {
                    const align = col.headerAlign || col.align || "left";
                    return (
                      <th
                        key={col.key}
                        className={cn(
                          "px-6 py-4 font-semibold sticky top-0 z-10 bg-surface-container-low",
                          align === "right" && "text-right",
                          align === "center" && "text-center",
                          col.sortable && "cursor-pointer select-none group hover:text-on-surface transition-colors",
                          col.minWidth && `min-w-[${col.minWidth}]`,
                        )}
                        onClick={col.sortable ? () => table.toggleSort(col.key as never) : undefined}
                      >
                        <span className={cn("inline-flex items-center gap-1.5", align === "right" && "flex-row-reverse")}>
                          {col.label}
                          {col.sortable && <SortIcon direction={table.getSortDirection(col.key as never)} />}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {table.pageData.map((row) => (
                  <tr
                    key={rowKey(row)}
                    className={cn(
                      "hover:bg-white/[0.02] transition-colors",
                      onRowClick && "cursor-pointer",
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((col) => {
                      const rawValue = col.accessor ? col.accessor(row) : row[col.key];
                      const align = col.align || "left";
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "px-6 py-5 text-sm",
                            align === "right" && "text-right",
                            align === "center" && "text-center",
                            col.className,
                          )}
                        >
                          {col.render ? col.render(rawValue, row) : (rawValue != null ? String(rawValue) : "—")}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ─── Pagination Footer ─── */}
          {table.pageCount > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-white/[0.03] bg-surface-container-low/40">
              <p className="text-xs text-text-tertiary">
                Page {table.page + 1} of {table.pageCount}
                <span className="ml-2 text-text-secondary/50">
                  ({table.filteredCount} {table.filteredCount === 1 ? "row" : "rows"})
                </span>
              </p>
              <div className="flex items-center gap-1">
                <PaginationButton
                  onClick={table.firstPage}
                  disabled={!table.canPreviousPage}
                  label="First page"
                >
                  <ChevronDoubleLeft className="h-3.5 w-3.5" />
                </PaginationButton>
                <PaginationButton
                  onClick={table.previousPage}
                  disabled={!table.canPreviousPage}
                  label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </PaginationButton>
                <PaginationButton
                  onClick={table.nextPage}
                  disabled={!table.canNextPage}
                  label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </PaginationButton>
                <PaginationButton
                  onClick={table.lastPage}
                  disabled={!table.canNextPage}
                  label="Last page"
                >
                  <ChevronDoubleRight className="h-3.5 w-3.5" />
                </PaginationButton>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Pagination Button ──────────────────────────────────────────────────────

function PaginationButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-text-secondary hover:text-on-surface hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none transition-all"
    >
      {children}
    </button>
  );
}
