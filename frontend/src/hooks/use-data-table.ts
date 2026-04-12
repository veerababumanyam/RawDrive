"use client";

import { useMemo, useState, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SortDirection = "asc" | "desc";

export interface SortState<K extends string = string> {
  key: K;
  direction: SortDirection;
}

export interface ColumnFilter {
  key: string;
  value: string;
}

export interface UseDataTableOptions<T, K extends string = string> {
  data: T[];
  /** Default rows per page. Defaults to 20. */
  pageSize?: number;
  /** Initial sort state. */
  initialSort?: SortState<K>;
  /** Keys to search across when the user types in the search box. */
  searchKeys?: (keyof T & string)[];
  /** Custom compare function for a column. Return negative/0/positive. */
  compareFns?: Partial<Record<K, (a: T, b: T) => number>>;
}

export interface UseDataTableReturn<T, K extends string = string> {
  // ─── Data ──────
  /** Fully processed rows for the current page. */
  pageData: T[];
  /** Total filtered row count (before pagination). */
  filteredCount: number;
  /** Total unfiltered row count. */
  totalCount: number;

  // ─── Search ────
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // ─── Sort ──────
  sort: SortState<K> | null;
  toggleSort: (key: K) => void;
  getSortDirection: (key: K) => SortDirection | null;

  // ─── Column Filters ──
  columnFilters: ColumnFilter[];
  setColumnFilter: (key: string, value: string) => void;
  clearColumnFilter: (key: string) => void;
  clearAllFilters: () => void;
  getColumnFilterValue: (key: string) => string;

  // ─── Pagination ──
  page: number;
  pageSize: number;
  pageCount: number;
  setPage: (p: number) => void;
  canPreviousPage: boolean;
  canNextPage: boolean;
  nextPage: () => void;
  previousPage: () => void;
  firstPage: () => void;
  lastPage: () => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useDataTable<T extends Record<string, unknown>, K extends string = string>(
  options: UseDataTableOptions<T, K>,
): UseDataTableReturn<T, K> {
  const { data, pageSize: defaultPageSize = 20, initialSort, searchKeys = [], compareFns = {} } = options;

  const [searchQuery, setSearchQueryRaw] = useState("");
  const [sort, setSort] = useState<SortState<K> | null>(initialSort ?? null);
  const [columnFilters, setColumnFilters] = useState<ColumnFilter[]>([]);
  const [page, setPageRaw] = useState(0);

  // Reset to page 0 when search changes
  const setSearchQuery = useCallback((q: string) => {
    setSearchQueryRaw(q);
    setPageRaw(0);
  }, []);

  // ─── Column filter helpers ──
  const setColumnFilter = useCallback((key: string, value: string) => {
    setColumnFilters((prev) => {
      const without = prev.filter((f) => f.key !== key);
      if (!value) return without;
      return [...without, { key, value }];
    });
    setPageRaw(0);
  }, []);

  const clearColumnFilter = useCallback((key: string) => {
    setColumnFilters((prev) => prev.filter((f) => f.key !== key));
    setPageRaw(0);
  }, []);

  const clearAllFilters = useCallback(() => {
    setColumnFilters([]);
    setSearchQueryRaw("");
    setPageRaw(0);
  }, []);

  const getColumnFilterValue = useCallback(
    (key: string) => columnFilters.find((f) => f.key === key)?.value ?? "",
    [columnFilters],
  );

  // ─── Sort helpers ──
  const toggleSort = useCallback(
    (key: K) => {
      setSort((prev) => {
        if (prev?.key === key) {
          return prev.direction === "asc" ? { key, direction: "desc" } : null;
        }
        return { key, direction: "asc" };
      });
    },
    [],
  );

  const getSortDirection = useCallback(
    (key: K): SortDirection | null => (sort?.key === key ? sort.direction : null),
    [sort],
  );

  // ─── Process data ──
  const filtered = useMemo(() => {
    let result = [...data];

    // Text search
    if (searchQuery.trim() && searchKeys.length > 0) {
      const q = searchQuery.toLowerCase();
      result = result.filter((row) =>
        searchKeys.some((key) => {
          const val = row[key];
          if (val == null) return false;
          return String(val).toLowerCase().includes(q);
        }),
      );
    }

    // Column filters
    for (const filter of columnFilters) {
      result = result.filter((row) => {
        const val = row[filter.key];
        if (val == null) return false;
        return String(val).toLowerCase() === filter.value.toLowerCase();
      });
    }

    return result;
  }, [data, searchQuery, searchKeys, columnFilters]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;

    return [...filtered].sort((a, b) => {
      const customCompare = (compareFns as Record<string, ((a: T, b: T) => number) | undefined>)[sort.key];
      if (customCompare) {
        const result = customCompare(a, b);
        return sort.direction === "desc" ? -result : result;
      }

      const aVal = a[sort.key as keyof T];
      const bVal = b[sort.key as keyof T];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sort.direction === "asc" ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      const cmp = aStr.localeCompare(bStr);
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort, compareFns]);

  // ─── Pagination ──
  const pageSize = defaultPageSize;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);

  const pageData = useMemo(
    () => sorted.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [sorted, safePage, pageSize],
  );

  const setPage = useCallback(
    (p: number) => setPageRaw(Math.max(0, Math.min(p, pageCount - 1))),
    [pageCount],
  );

  return {
    pageData,
    filteredCount: sorted.length,
    totalCount: data.length,

    searchQuery,
    setSearchQuery,

    sort,
    toggleSort,
    getSortDirection,

    columnFilters,
    setColumnFilter,
    clearColumnFilter,
    clearAllFilters,
    getColumnFilterValue,

    page: safePage,
    pageSize,
    pageCount,
    setPage,
    canPreviousPage: safePage > 0,
    canNextPage: safePage < pageCount - 1,
    nextPage: () => setPage(safePage + 1),
    previousPage: () => setPage(safePage - 1),
    firstPage: () => setPage(0),
    lastPage: () => setPage(pageCount - 1),
  };
}
