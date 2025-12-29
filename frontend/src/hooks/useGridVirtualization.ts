/**
 * useGridVirtualization Hook
 * Row-based virtualization for photo grids.
 * Only renders visible rows + overscan buffer to maintain 60fps scrolling.
 *
 * Key concepts:
 * - Items are grouped into rows based on column count
 * - Only visible rows + overscan are rendered
 * - Top and bottom spacers maintain scroll height
 * - DnD incompatible - disable when sortable=true
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

export interface VirtualRow<T> {
  /** Row index */
  rowIndex: number;
  /** Items in this row */
  items: T[];
  /** Starting index of first item in the row */
  startIndex: number;
}

export interface UseGridVirtualizationOptions<T> {
  /** All items to virtualize */
  items: T[];
  /** Number of columns in the grid */
  columnCount: number;
  /** Height of each row in pixels */
  rowHeight: number;
  /** Number of rows to render above/below visible area */
  overscan?: number;
  /** Enable virtualization (set to false when sortable) */
  enabled?: boolean;
  /** Container ref for scroll handling (alternative to internal ref) */
  containerRef?: React.RefObject<HTMLDivElement>;
}

export interface UseGridVirtualizationResult<T> {
  /** Virtual rows to render */
  virtualRows: VirtualRow<T>[];
  /** Total height of the virtual container */
  totalHeight: number;
  /** Height of top spacer */
  topSpacerHeight: number;
  /** Height of bottom spacer */
  bottomSpacerHeight: number;
  /** Ref for scroll container (use if not providing containerRef) */
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  /** Scroll to specific item by global index */
  scrollToItem: (index: number) => void;
  /** Scroll to specific row */
  scrollToRow: (rowIndex: number) => void;
  /** Current visible range */
  visibleRange: { startRow: number; endRow: number };
  /** Check if an item is currently rendered */
  isItemRendered: (index: number) => boolean;
}

export function useGridVirtualization<T>({
  items,
  columnCount,
  rowHeight,
  overscan = 2,
  enabled = true,
  containerRef: externalContainerRef,
}: UseGridVirtualizationOptions<T>): UseGridVirtualizationResult<T> {
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = externalContainerRef || internalContainerRef;

  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Calculate total rows
  const totalRows = Math.ceil(items.length / columnCount);
  const totalHeight = totalRows * rowHeight;

  // Calculate visible row range
  const visibleRange = useMemo(() => {
    if (!enabled || containerHeight === 0) {
      return { startRow: 0, endRow: totalRows - 1 };
    }

    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleRows = Math.ceil(containerHeight / rowHeight);
    const endRow = Math.min(totalRows - 1, startRow + visibleRows + overscan * 2);

    return { startRow, endRow };
  }, [scrollTop, containerHeight, rowHeight, totalRows, overscan, enabled]);

  // Group items into virtual rows
  const virtualRows = useMemo(() => {
    if (!enabled) {
      // Return all items as rows when disabled
      const allRows: VirtualRow<T>[] = [];
      for (let i = 0; i < totalRows; i++) {
        const startIndex = i * columnCount;
        const rowItems = items.slice(startIndex, startIndex + columnCount);
        allRows.push({
          rowIndex: i,
          items: rowItems,
          startIndex,
        });
      }
      return allRows;
    }

    // Only return visible rows
    const rows: VirtualRow<T>[] = [];
    for (let i = visibleRange.startRow; i <= visibleRange.endRow; i++) {
      const startIndex = i * columnCount;
      const rowItems = items.slice(startIndex, startIndex + columnCount);
      if (rowItems.length > 0) {
        rows.push({
          rowIndex: i,
          items: rowItems,
          startIndex,
        });
      }
    }
    return rows;
  }, [items, columnCount, visibleRange, totalRows, enabled]);

  // Calculate spacer heights
  const topSpacerHeight = enabled ? visibleRange.startRow * rowHeight : 0;
  const bottomSpacerHeight = enabled
    ? Math.max(0, (totalRows - visibleRange.endRow - 1) * rowHeight)
    : 0;

  // Handle scroll events
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !enabled) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [scrollContainerRef, enabled]);

  // Handle container resize
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateHeight = () => {
      setContainerHeight(container.clientHeight);
    };

    // Initial measurement
    updateHeight();

    // Use ResizeObserver if available
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateHeight);
      observer.observe(container);
      return () => observer.disconnect();
    }

    // Fallback to window resize
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [scrollContainerRef]);

  // Scroll to specific row
  const scrollToRow = useCallback(
    (rowIndex: number) => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const targetScrollTop = rowIndex * rowHeight;
      container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    },
    [scrollContainerRef, rowHeight]
  );

  // Scroll to specific item by global index
  const scrollToItem = useCallback(
    (index: number) => {
      const rowIndex = Math.floor(index / columnCount);
      scrollToRow(rowIndex);
    },
    [columnCount, scrollToRow]
  );

  // Check if an item is currently rendered
  const isItemRendered = useCallback(
    (index: number) => {
      if (!enabled) return true;
      const rowIndex = Math.floor(index / columnCount);
      return rowIndex >= visibleRange.startRow && rowIndex <= visibleRange.endRow;
    },
    [columnCount, visibleRange, enabled]
  );

  return {
    virtualRows,
    totalHeight,
    topSpacerHeight,
    bottomSpacerHeight,
    scrollContainerRef: internalContainerRef,
    scrollToItem,
    scrollToRow,
    visibleRange,
    isItemRendered,
  };
}

export default useGridVirtualization;
