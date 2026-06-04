"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll-reveal animation group.
 *
 * Attach the returned ref to a container; descendants carrying `data-reveal`
 * get `data-revealed="true"` the first time they enter the viewport, which
 * triggers the CSS transition defined in globals.css (motion tokens only).
 *
 * - Re-scans when `deps` change (e.g. infinite-scroll appends items).
 * - Honors prefers-reduced-motion: everything is revealed immediately and
 *   the CSS side removes the transition entirely.
 * - Falls back to instant reveal when IntersectionObserver is unavailable.
 *
 * Optional stagger: set `style={{ "--reveal-delay": "80ms" }}` per item.
 */
export function useScrollRevealGroup<T extends HTMLElement>(
  deps: readonly unknown[] = [],
): React.RefObject<T | null> {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const targets = container.querySelectorAll(
      "[data-reveal]:not([data-revealed])",
    );
    if (targets.length === 0) return;

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (typeof IntersectionObserver === "undefined" || reduceMotion) {
      targets.forEach((el) => el.setAttribute("data-revealed", "true"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-revealed", "true");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return containerRef;
}
