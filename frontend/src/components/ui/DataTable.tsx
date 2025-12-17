import React, { useMemo, useCallback } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppButton } from './AppButton';
import { Checkbox } from './FormControls';
import { Skeleton } from './Progress';

/* =============================================================================
   DataTable Component

   A full-featured data table with sorting, selection, pagination,
   and responsive design.
   ============================================================================= */

export type SortDirection = 'asc' | 'desc' | null;

export interface Column<T> {
  /** Unique column identifier */
  id: string;
  /** Column header text */
  header: string;
  /** Key in data object or accessor function */
  accessor: keyof T | ((row: T) => React.ReactNode);
  /** Enable sorting for this column */
  sortable?: boolean;
  /** Column width (CSS value) */
  width?: string;
  /** Min width (CSS value) */
  minWidth?: string;
  /** Custom cell renderer */
  cell?: (value: unknown, row: T, index: number) => React.ReactNode;
  /** Header alignment */
  headerAlign?: 'left' | 'center' | 'right';
  /** Cell alignment */
  align?: 'left' | 'center' | 'right';
  /** Hide on mobile */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  /** Table data */
  data: T[];
  /** Column definitions */
  columns: Column<T>[];
  /** Unique key accessor for each row */
  keyAccessor: keyof T | ((row: T) => string | number);
  /** Enable row selection */
  selectable?: boolean;
  /** Selected row keys */
  selectedKeys?: Set<string | number>;
  /** Selection change handler */
  onSelectionChange?: (keys: Set<string | number>) => void;
  /** Enable sorting */
  sortable?: boolean;
  /** Current sort column */
  sortColumn?: string;
  /** Current sort direction */
  sortDirection?: SortDirection;
  /** Sort change handler */
  onSortChange?: (column: string, direction: SortDirection) => void;
  /** Row click handler */
  onRowClick?: (row: T) => void;
  /** Loading state */
  isLoading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Table density */
  density?: 'compact' | 'normal' | 'comfortable';
  /** Striped rows */
  striped?: boolean;
  /** Bordered cells */
  bordered?: boolean;
  /** Hover effect on rows */
  hoverable?: boolean;
  /** Sticky header */
  stickyHeader?: boolean;
  /** Max height (for scrolling) */
  maxHeight?: string;
  className?: string;
}

const densityStyles = {
  compact: 'py-2 px-3 text-xs',
  normal: 'py-3 px-4 text-sm',
  comfortable: 'py-4 px-5 text-sm',
};

const alignStyles = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

export function DataTable<T>({
  data,
  columns,
  keyAccessor,
  selectable = false,
  selectedKeys = new Set(),
  onSelectionChange,
  sortable = false,
  sortColumn,
  sortDirection,
  onSortChange,
  onRowClick,
  isLoading = false,
  emptyMessage = 'No data available',
  density = 'normal',
  striped = false,
  bordered = false,
  hoverable = true,
  stickyHeader = false,
  maxHeight,
  className = '',
}: DataTableProps<T>) {
  const getRowKey = useCallback(
    (row: T): string | number => {
      if (typeof keyAccessor === 'function') {
        return keyAccessor(row);
      }
      return String(row[keyAccessor]);
    },
    [keyAccessor]
  );

  const getCellValue = useCallback((row: T, accessor: Column<T>['accessor']): unknown => {
    if (typeof accessor === 'function') {
      return accessor(row);
    }
    return row[accessor];
  }, []);

  // Selection handlers
  const isAllSelected = useMemo(() => {
    if (data.length === 0) return false;
    return data.every((row) => selectedKeys.has(getRowKey(row)));
  }, [data, selectedKeys, getRowKey]);

  const isSomeSelected = useMemo(() => {
    return data.some((row) => selectedKeys.has(getRowKey(row))) && !isAllSelected;
  }, [data, selectedKeys, isAllSelected, getRowKey]);

  const handleSelectAll = useCallback(() => {
    if (isAllSelected) {
      onSelectionChange?.(new Set());
    } else {
      const allKeys = new Set(data.map(getRowKey));
      onSelectionChange?.(allKeys);
    }
  }, [data, isAllSelected, onSelectionChange, getRowKey]);

  const handleSelectRow = useCallback(
    (key: string | number) => {
      const newSelection = new Set(selectedKeys);
      if (newSelection.has(key)) {
        newSelection.delete(key);
      } else {
        newSelection.add(key);
      }
      onSelectionChange?.(newSelection);
    },
    [selectedKeys, onSelectionChange]
  );

  // Sort handler
  const handleSort = useCallback(
    (columnId: string) => {
      if (!sortable || !onSortChange) return;

      let newDirection: SortDirection = 'asc';
      if (sortColumn === columnId) {
        if (sortDirection === 'asc') {
          newDirection = 'desc';
        } else if (sortDirection === 'desc') {
          newDirection = null;
        }
      }
      onSortChange(columnId, newDirection);
    },
    [sortable, sortColumn, sortDirection, onSortChange]
  );

  // Render sort icon
  const renderSortIcon = (columnId: string) => {
    if (sortColumn !== columnId) {
      return <ChevronsUpDown size={14} className="text-text-tertiary" />;
    }
    if (sortDirection === 'asc') {
      return <ChevronUp size={14} className="text-primary" />;
    }
    if (sortDirection === 'desc') {
      return <ChevronDown size={14} className="text-primary" />;
    }
    return <ChevronsUpDown size={14} className="text-text-tertiary" />;
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className={`overflow-hidden border border-border rounded-card ${className}`}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-background-alt">
              {selectable && (
                <th className={`${densityStyles[density]} w-12`}>
                  <Skeleton variant="rectangular" width="18px" height="18px" />
                </th>
              )}
              {columns.map((col) => (
                <th key={col.id} className={`${densityStyles[density]} ${alignStyles[col.headerAlign || 'left']}`}>
                  <Skeleton variant="text" width="60%" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-border last:border-b-0">
                {selectable && (
                  <td className={densityStyles[density]}>
                    <Skeleton variant="rectangular" width="18px" height="18px" />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.id} className={densityStyles[density]}>
                    <Skeleton variant="text" width="80%" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div
      className={`
        overflow-auto
        border border-border rounded-card
        ${maxHeight ? 'scrollbar-thin' : ''}
        ${className}
      `}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className="w-full border-collapse">
        <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
          <tr className="border-b border-border bg-background-alt">
            {selectable && (
              <th className={`${densityStyles[density]} w-12`}>
                <Checkbox
                  checked={isAllSelected}
                  indeterminate={isSomeSelected}
                  onChange={handleSelectAll}
                  aria-label="Select all rows"
                />
              </th>
            )}
            {columns.map((col) => {
              const isSortable = sortable && col.sortable !== false;
              return (
                <th
                  key={col.id}
                  className={`
                    ${densityStyles[density]}
                    ${alignStyles[col.headerAlign || 'left']}
                    font-semibold text-text-primary
                    ${col.hideOnMobile ? 'hidden md:table-cell' : ''}
                    ${isSortable ? 'cursor-pointer select-none hover:bg-surface-hover' : ''}
                    transition-colors
                  `}
                  style={{
                    width: col.width,
                    minWidth: col.minWidth,
                  }}
                  onClick={isSortable ? () => handleSort(col.id) : undefined}
                  aria-sort={
                    sortColumn === col.id
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : sortDirection === 'desc'
                        ? 'descending'
                        : 'none'
                      : undefined
                  }
                >
                  <div className={`flex items-center gap-1 ${col.headerAlign === 'right' ? 'justify-end' : col.headerAlign === 'center' ? 'justify-center' : ''}`}>
                    <span>{col.header}</span>
                    {isSortable && renderSortIcon(col.id)}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (selectable ? 1 : 0)}
                className="py-12 text-center text-text-secondary"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, index) => {
              const rowKey = getRowKey(row);
              const isSelected = selectedKeys.has(rowKey);
              return (
                <tr
                  key={rowKey}
                  className={`
                    border-b border-border last:border-b-0
                    ${striped && index % 2 === 1 ? 'bg-background-alt' : 'bg-surface'}
                    ${hoverable ? 'hover:bg-surface-hover transition-colors' : ''}
                    ${isSelected ? 'bg-primary-50 dark:bg-primary-950' : ''}
                    ${onRowClick ? 'cursor-pointer' : ''}
                  `}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectable && (
                    <td
                      className={densityStyles[density]}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onChange={() => handleSelectRow(rowKey)}
                        aria-label={`Select row ${index + 1}`}
                      />
                    </td>
                  )}
                  {columns.map((col) => {
                    const value = getCellValue(row, col.accessor);
                    const content = col.cell ? col.cell(value, row, index) : String(value ?? '');
                    return (
                      <td
                        key={col.id}
                        className={`
                          ${densityStyles[density]}
                          ${alignStyles[col.align || 'left']}
                          text-text-primary
                          ${bordered ? 'border-x border-border first:border-l-0 last:border-r-0' : ''}
                          ${col.hideOnMobile ? 'hidden md:table-cell' : ''}
                        `}
                        style={{
                          width: col.width,
                          minWidth: col.minWidth,
                        }}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/* =============================================================================
   Table Pagination Component
   ============================================================================= */

export interface TablePaginationProps {
  /** Current page (1-indexed) */
  page: number;
  /** Total number of pages */
  totalPages: number;
  /** Total number of items */
  totalItems?: number;
  /** Items per page */
  pageSize?: number;
  /** Page change handler */
  onPageChange: (page: number) => void;
  /** Show page size selector */
  showPageSizeSelector?: boolean;
  /** Available page sizes */
  pageSizes?: number[];
  /** Page size change handler */
  onPageSizeChange?: (size: number) => void;
  className?: string;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  page,
  totalPages,
  totalItems,
  pageSize = 10,
  onPageChange,
  showPageSizeSelector = false,
  pageSizes = [10, 25, 50, 100],
  onPageSizeChange,
  className = '',
}) => {
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems || 0);

  return (
    <div
      className={`
        flex flex-col sm:flex-row items-center justify-between gap-4
        py-3 px-4
        border-t border-border
        bg-background-alt
        ${className}
      `}
    >
      <div className="flex items-center gap-4">
        {totalItems !== undefined && (
          <span className="text-sm text-text-secondary">
            Showing {startItem} to {endItem} of {totalItems} results
          </span>
        )}
        {showPageSizeSelector && onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="
                py-1 px-2
                text-sm
                bg-surface
                border border-border
                rounded
                focus:outline-none focus:ring-2 focus:ring-primary
              "
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <AppButton
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">Previous</span>
        </AppButton>

        <div className="flex items-center gap-1">
          {/* Page numbers */}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (page <= 3) {
              pageNum = i + 1;
            } else if (page >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = page - 2 + i;
            }

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`
                  min-w-[32px] h-8
                  text-sm font-medium
                  rounded
                  transition-colors
                  ${
                    pageNum === page
                      ? 'bg-primary text-white'
                      : 'text-text-secondary hover:bg-surface-hover'
                  }
                `}
                aria-current={pageNum === page ? 'page' : undefined}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        <AppButton
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight size={16} />
        </AppButton>
      </div>
    </div>
  );
};

export default DataTable;
