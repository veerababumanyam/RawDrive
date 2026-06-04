import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * PageContainer — the shared dashboard page shell.
 *
 * Centralises the one composition pattern the dashboard already uses
 * informally everywhere (`mx-auto w-full max-w-* px-4 py-8 space-y-6`) so
 * gallery pages stop each inventing their own width / padding / rhythm.
 * The dashboard <main> supplies the outer gutter; this adds the centred
 * max-width column + consistent vertical rhythm on top of it.
 *
 * Width is a small, fixed vocabulary of semantic max-width tokens — never
 * an arbitrary value — so every page reads from the same scale:
 *  - narrow  → forms / settings        (max-w-3xl)
 *  - default → standard content pages   (max-w-6xl)
 *  - editor  → split-pane editors        (max-w-5xl)
 *  - wide    → dense dashboards          (max-w-7xl)
 *  - full    → edge-to-edge media grids  (max-w-none)
 */
type PageWidth = "narrow" | "default" | "editor" | "wide" | "full";

const widthClasses: Record<PageWidth, string> = {
  narrow: "max-w-3xl",
  default: "max-w-6xl",
  editor: "max-w-5xl",
  wide: "max-w-7xl",
  full: "max-w-none",
};

interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  width?: PageWidth;
}

export function PageContainer({
  width = "default",
  className,
  children,
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-8 space-y-6",
        widthClasses[width],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
