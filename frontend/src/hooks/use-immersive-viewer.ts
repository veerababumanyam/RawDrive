"use client";

import { useCallback, useLayoutEffect, type RefObject } from "react";

const VIEWER_HEIGHT_VAR = "--immersive-viewer-height";
const VIEWER_WIDTH_VAR = "--immersive-viewer-width";
const VIEWER_TOP_VAR = "--immersive-viewer-top";
const VIEWER_LEFT_VAR = "--immersive-viewer-left";

function viewportMetric(value: number | undefined, fallback: number): string {
  const next = Number.isFinite(value) && value && value > 0 ? value : fallback;
  return `${Math.round(next)}px`;
}

/**
 * Keeps fixed public media viewers pinned to the visible browser viewport.
 * iPhone Safari often cannot enter native fullscreen for non-video elements,
 * so the overlay still needs to track `visualViewport` while browser chrome
 * expands/collapses.
 */
export function useImmersiveViewerSurface(
  ref: RefObject<HTMLElement | null>,
  active = true,
) {
  const syncViewportVars = useCallback(() => {
    if (!active || typeof window === "undefined") return;
    const surface = ref.current;
    if (!surface) return;

    const viewport = window.visualViewport;
    surface.style.setProperty(
      VIEWER_HEIGHT_VAR,
      viewportMetric(viewport?.height, window.innerHeight),
    );
    surface.style.setProperty(
      VIEWER_WIDTH_VAR,
      viewportMetric(viewport?.width, window.innerWidth),
    );
    surface.style.setProperty(
      VIEWER_TOP_VAR,
      viewportMetric(viewport?.offsetTop, 0),
    );
    surface.style.setProperty(
      VIEWER_LEFT_VAR,
      viewportMetric(viewport?.offsetLeft, 0),
    );
  }, [active, ref]);

  useLayoutEffect(() => {
    if (!active || typeof window === "undefined") return;

    const surface = ref.current;
    syncViewportVars();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", syncViewportVars);
    viewport?.addEventListener("scroll", syncViewportVars);
    window.addEventListener("resize", syncViewportVars);
    window.addEventListener("orientationchange", syncViewportVars);

    return () => {
      viewport?.removeEventListener("resize", syncViewportVars);
      viewport?.removeEventListener("scroll", syncViewportVars);
      window.removeEventListener("resize", syncViewportVars);
      window.removeEventListener("orientationchange", syncViewportVars);
      surface?.style.removeProperty(VIEWER_HEIGHT_VAR);
      surface?.style.removeProperty(VIEWER_WIDTH_VAR);
      surface?.style.removeProperty(VIEWER_TOP_VAR);
      surface?.style.removeProperty(VIEWER_LEFT_VAR);
    };
  }, [active, ref, syncViewportVars]);

  useLayoutEffect(() => {
    if (!active || typeof window === "undefined") return;

    const { document } = window;
    const body = document.body;
    const root = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousRootOverscroll = root.style.overscrollBehavior;
    const scrollY = window.scrollY;

    body.style.overflow = "hidden";
    root.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    root.style.overscrollBehavior = "none";

    return () => {
      body.style.overflow = previousBodyOverflow;
      root.style.overflow = previousRootOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      root.style.overscrollBehavior = previousRootOverscroll;
      if (scrollY > 0) {
        try {
          window.scrollTo({
            top: scrollY,
            behavior: "instant" as ScrollBehavior,
          });
        } catch {
          try {
            window.scrollTo(0, scrollY);
          } catch {
            // Some test browsers expose scrollTo but do not implement it.
          }
        }
      }
    };
  }, [active]);
}
