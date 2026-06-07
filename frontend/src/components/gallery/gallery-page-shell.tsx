import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GalleryWorkspaceNav } from "./gallery-workspace-nav";

interface GalleryPageShellProps {
  galleryId: string;
  children: ReactNode;
  /** Extra classes merged onto the outer container (e.g. "pb-24"). */
  className?: string;
  /** Standard keeps legacy pages aligned; wide/full use desktop workspace real estate. */
  width?: "standard" | "wide" | "full";
  /** Workbench pages use tighter page chrome so split panes fit above the fold. */
  mode?: "document" | "workbench";
}

const widthClasses = {
  standard: "max-w-6xl",
  wide: "max-w-7xl",
  full: "max-w-none",
} as const;

const modeClasses = {
  document: "space-y-6 px-4 pb-8 pt-4",
  workbench: "space-y-4 px-3 pb-6 pt-3 sm:px-4 lg:px-5",
} as const;

/**
 * Canonical page container for every /galleries/{id} workspace page
 * (overview, cover, photo-search, settings, sales, ai, delivery).
 *
 * One shared shell means the workspace nav renders from the same
 * contract on every tab — previously each page rolled its own wrapper
 * (full-width vs max-w-3xl vs max-w-5xl), so the nav strip visibly
 * jumped when switching tabs. Width is opt-in: legacy pages stay on
 * the standard cap while desktop workspaces can use wide/full space
 * and constrain their own inner columns.
 */
export function GalleryPageShell({
  galleryId,
  children,
  className,
  width = "standard",
  mode = "document",
}: GalleryPageShellProps) {
  return (
    <div
      className={cn(
        "gallery-workspace-shell mx-auto w-full",
        widthClasses[width],
        modeClasses[mode],
        className,
      )}
      data-gallery-shell-mode={mode}
      data-gallery-shell-width={width}
    >
      {/* Workspace nav first so the section dropdown is the topmost
          element on mobile. */}
      <GalleryWorkspaceNav galleryId={galleryId} />
      {children}
    </div>
  );
}
