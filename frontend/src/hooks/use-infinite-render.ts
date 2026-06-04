"use client";

import { useEffect, useRef, useState } from "react";

export interface UseInfiniteRenderOptions {
  /** Items rendered before the first scroll. Default 60. */
  initialCount?: number;
  /** Items appended each time the sentinel becomes visible. Default 60. */
  batchSize?: number;
  /** Observer rootMargin — preload distance before the sentinel enters view. */
  rootMargin?: string;
}

export interface UseInfiniteRenderResult {
  /** How many items the caller should render (slice(0, visibleCount)). */
  visibleCount: number;
  /** True while more items remain beyond the current window. */
  hasMore: boolean;
  /** Attach to an empty div after the list; observed to grow the window. */
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Continuous-scroll DOM windowing for already-loaded lists.
 *
 * Generalizes the public-gallery-grid pattern (AGENTS.md "Performance Hot
 * Paths"): the full data array stays in memory so selection/navigation
 * indexes remain global, but only a bounded window is mounted in the DOM.
 * The window grows as the user approaches the sentinel — no pagination UI.
 *
 * Falls back to rendering everything when IntersectionObserver is
 * unavailable, mirroring public-gallery-grid's feature detection.
 */
export function useInfiniteRender(
  totalCount: number,
  options: UseInfiniteRenderOptions = {},
): UseInfiniteRenderResult {
  const { initialCount = 60, batchSize = 60, rootMargin = "800px 0px" } =
    options;
  const [visibleCount, setVisibleCount] = useState(initialCount);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [canObserve] = useState(
    () => typeof IntersectionObserver !== "undefined",
  );

  const effectiveCount = canObserve
    ? Math.min(visibleCount, totalCount)
    : totalCount;
  const hasMore = canObserve && effectiveCount < totalCount;

  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => Math.min(count + batchSize, totalCount));
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, totalCount, batchSize, rootMargin]);

  return { visibleCount: effectiveCount, hasMore, sentinelRef };
}

/**
 * Auto-triggers a cursor-based "load more" fetch when the sentinel nears the
 * viewport — converts Load More buttons into continuous scrolling. The
 * callback must be idempotent while a fetch is in flight (guard internally).
 * Keep the button as a no-JS/reduced-capability fallback.
 */
export function useInfiniteFetch(
  enabled: boolean,
  onLoadMore: () => void,
  rootMargin = "600px 0px",
): React.RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const callbackRef = useRef(onLoadMore);

  useEffect(() => {
    callbackRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof IntersectionObserver === "undefined") return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          callbackRef.current();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, rootMargin]);

  return sentinelRef;
}
