"use client";

import {
  Children,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

const DEFAULT_MIN_PERCENT = 18;
const DEFAULT_MAX_PERCENT = 48;
const DEFAULT_STEP_PERCENT = 2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toStoredPercent(value: number) {
  return Math.round(value * 10) / 10;
}

function readStoredPercent(
  storageKey: string,
  fallback: number,
  min: number,
  max: number,
) {
  if (typeof window === "undefined") return clamp(fallback, min, max);

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return clamp(fallback, min, max);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return clamp(fallback, min, max);
    return clamp(parsed, min, max);
  } catch {
    return clamp(fallback, min, max);
  }
}

function persistPercent(storageKey: string, percent: number) {
  try {
    window.localStorage.setItem(storageKey, String(toStoredPercent(percent)));
  } catch {
    /* Browser storage can be unavailable; keep the in-page resize anyway. */
  }
}

export interface ResizableWorkspaceSplitProps {
  children: ReactNode;
  className?: string;
  storageKey: string;
  label: string;
  secondarySide?: "start" | "end";
  defaultSecondaryPercent?: number;
  minSecondaryPercent?: number;
  maxSecondaryPercent?: number;
  stepPercent?: number;
  minSecondaryPx?: number;
  maxSecondaryPx?: number;
}

export function ResizableWorkspaceSplit({
  children,
  className,
  storageKey,
  label,
  secondarySide = "end",
  defaultSecondaryPercent = 32,
  minSecondaryPercent = DEFAULT_MIN_PERCENT,
  maxSecondaryPercent = DEFAULT_MAX_PERCENT,
  stepPercent = DEFAULT_STEP_PERCENT,
  minSecondaryPx,
  maxSecondaryPx,
}: ResizableWorkspaceSplitProps) {
  const panes = Children.toArray(children);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [secondaryPercent, setSecondaryPercent] = useState(() =>
    readStoredPercent(
      storageKey,
      defaultSecondaryPercent,
      minSecondaryPercent,
      maxSecondaryPercent,
    ),
  );
  const percentRef = useRef(secondaryPercent);

  const commitPercent = useCallback(
    (nextPercent: number) => {
      const next = toStoredPercent(
        clamp(nextPercent, minSecondaryPercent, maxSecondaryPercent),
      );
      percentRef.current = next;
      setSecondaryPercent(next);
      persistPercent(storageKey, next);
      return next;
    },
    [maxSecondaryPercent, minSecondaryPercent, storageKey],
  );

  const resizeFromClientX = useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return percentRef.current;

      const rawSecondaryPx =
        secondarySide === "start" ? clientX - rect.left : rect.right - clientX;
      const minByPx =
        typeof minSecondaryPx === "number"
          ? (minSecondaryPx / rect.width) * 100
          : minSecondaryPercent;
      const maxByPx =
        typeof maxSecondaryPx === "number"
          ? (maxSecondaryPx / rect.width) * 100
          : maxSecondaryPercent;
      const min = Math.max(minSecondaryPercent, minByPx);
      const max = Math.max(min, Math.min(maxSecondaryPercent, maxByPx));
      const next = toStoredPercent(
        clamp((rawSecondaryPx / rect.width) * 100, min, max),
      );

      percentRef.current = next;
      setSecondaryPercent(next);
      return next;
    },
    [
      maxSecondaryPercent,
      maxSecondaryPx,
      minSecondaryPercent,
      minSecondaryPx,
      secondarySide,
    ],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      let latestPercent = percentRef.current;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      document.body.dataset.galleryWorkspaceResizing = "true";
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      function cleanup() {
        delete document.body.dataset.galleryWorkspaceResizing;
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
      }

      function handlePointerMove(moveEvent: PointerEvent) {
        latestPercent = resizeFromClientX(moveEvent.clientX);
      }

      function handlePointerUp() {
        cleanup();
        commitPercent(latestPercent);
      }

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [commitPercent, resizeFromClientX],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      let nextPercent: number | null = null;
      const direction = secondarySide === "start" ? 1 : -1;

      if (event.key === "ArrowLeft") {
        nextPercent = percentRef.current - stepPercent * direction;
      } else if (event.key === "ArrowRight") {
        nextPercent = percentRef.current + stepPercent * direction;
      } else if (event.key === "Home") {
        nextPercent = minSecondaryPercent;
      } else if (event.key === "End") {
        nextPercent = maxSecondaryPercent;
      }

      if (nextPercent === null) return;
      event.preventDefault();
      commitPercent(nextPercent);
    },
    [
      commitPercent,
      maxSecondaryPercent,
      minSecondaryPercent,
      secondarySide,
      stepPercent,
    ],
  );

  const style = useMemo(
    () =>
      ({
        "--gallery-resizable-secondary-size": `${secondaryPercent}%`,
        ...(typeof minSecondaryPx === "number"
          ? { "--gallery-resizable-secondary-min": `${minSecondaryPx}px` }
          : null),
        ...(typeof maxSecondaryPx === "number"
          ? { "--gallery-resizable-secondary-max": `${maxSecondaryPx}px` }
          : null),
      }) as CSSProperties,
    [maxSecondaryPx, minSecondaryPx, secondaryPercent],
  );

  return (
    <div
      ref={containerRef}
      className={cn("gallery-resizable-split", className)}
      data-resizable-side={secondarySide}
      style={style}
    >
      {panes[0] ?? null}
      <div
        role="separator"
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={minSecondaryPercent}
        aria-valuemax={maxSecondaryPercent}
        aria-valuenow={secondaryPercent}
        aria-valuetext={`Secondary pane ${secondaryPercent}%`}
        tabIndex={0}
        className="gallery-resizable-split__handle"
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
      />
      {panes[1] ?? null}
    </div>
  );
}
