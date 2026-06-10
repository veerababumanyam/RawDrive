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
import { GlassIconButton } from "@/components/ui/glass-icon-button";

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
  if (direction === "asc")
    return <ChevronUp className="h-3.5 w-3.5 text-accent" />;
  if (direction === "desc")
    return <ChevronDown className="h-3.5 w-3.5 text-accent" />;
  return (
    <ChevronUpDown className="h-3.5 w-3.5 opacity-30 group-hover:opacity-60 transition-opacity" />
  );
}

function ariaSortValue(direction: SortDirection | null) {
  if (direction === "asc") return "ascending";
  if (direction === "desc") return "descending";
  return "none";
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
  const filterableColumns = columns.filter(
    (c) => c.filterable && c.filterOptions?.length,
  );

  const handleSearch = (q: string) => {
    table.setSearchQuery(q);
    onSearchChange?.(q);
  };

  const handleClearAllFilters = () => {
    table.clearAllFilters();
    onSearchChange?.("");
  };

  // ─── Loading ──
  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="animate-pulse space-y-3">
          <div className="h-12 bg-surface-container-low/40 rounded-2xl" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-14 bg-surface-container-low/20 rounded-xl"
            />
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
        <div className="table-toolbar-panel p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            {searchable && (
              <div className="relative min-w-48 flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
                <input
                  type="text"
                  aria-label={
                    searchPlaceholder === "Search..."
                      ? "Search table"
                      : searchPlaceholder
                  }
                  placeholder={searchPlaceholder}
                  value={table.searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="input-base search-input-with-icon w-full border-none text-sm placeholder:text-text-tertiary/70"
                />
              </div>
            )}

            {/* Column Filters */}
            {filterableColumns.map((col) => (
              <div key={col.key} className="relative">
                <select
                  aria-label={`Filter by ${col.label}`}
                  value={table.getColumnFilterValue(col.key)}
                  onChange={(e) =>
                    table.setColumnFilter(col.key, e.target.value)
                  }
                  className="input-base cursor-pointer appearance-none pl-3 pr-8 text-sm"
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
                type="button"
                onClick={handleClearAllFilters}
                className="touch-min inline-flex items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <XMark className="h-3.5 w-3.5" />
                Clear
              </button>
            )}

            {/* Spacer + Actions */}
            {toolbarActions && (
              <div className="ml-auto flex items-center gap-2">
                {toolbarActions}
              </div>
            )}
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
        <div className="text-center py-12 text-text-secondary">
          {emptyMessage}
        </div>
      ) : (
        <div className="table-toolbar-panel overflow-hidden">
          <div className="table-scroll-panel">
            <table className="w-full table-auto text-left border-collapse">
              <thead>
                <tr className="font-label text-xs uppercase text-text-secondary">
                  {columns.map((col) => {
                    const align = col.headerAlign || col.align || "left";
                    const sortDirection = table.getSortDirection(
                      col.key as never,
                    );
                    return (
                      <th
                        key={col.key}
                        scope="col"
                        aria-sort={
                          col.sortable
                            ? ariaSortValue(sortDirection)
                            : undefined
                        }
                        className={cn(
                          "sticky top-0 z-10 bg-surface-container-low px-6 py-4 font-semibold",
                          align === "right" && "text-right",
                          align === "center" && "text-center",
                        )}
                        style={
                          col.minWidth ? { minWidth: col.minWidth } : undefined
                        }
                      >
                        {col.sortable ? (
                          <button
                            type="button"
                            onClick={() => table.toggleSort(col.key as never)}
                            className={cn(
                              "touch-min group inline-flex items-center gap-1.5 rounded-lg text-left transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
                              align === "right" && "flex-row-reverse",
                              align === "center" && "mx-auto justify-center",
                            )}
                          >
                            {col.label}
                            <SortIcon direction={sortDirection} />
                          </button>
                        ) : (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5",
                              align === "right" && "flex-row-reverse",
                            )}
                          >
                            {col.label}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {table.pageData.map((row) => (
                  <tr
                    key={rowKey(row)}
                    className={cn(
                      "transition-colors hover:bg-surface-container-low",
                      onRowClick && "cursor-pointer",
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((col) => {
                      const rawValue = col.accessor
                        ? col.accessor(row)
                        : row[col.key];
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
                          {col.render
                            ? col.render(rawValue, row)
                            : rawValue != null
                              ? String(rawValue)
                              : "—"}
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
            <div className="flex items-center justify-between border-t border-border-subtle bg-surface-container-low/40 px-6 py-3">
              <p className="text-xs text-text-tertiary">
                Page {table.page + 1} of {table.pageCount}
                <span className="ml-2 text-text-secondary/50">
                  ({table.filteredCount}{" "}
                  {table.filteredCount === 1 ? "row" : "rows"})
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
    <GlassIconButton
      size="md"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      label={label}
    >
      {children}
    </GlassIconButton>
  );
}
