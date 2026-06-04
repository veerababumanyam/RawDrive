import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GalleryWorkspaceNav } from "./gallery-workspace-nav";

interface GalleryPageShellProps {
  galleryId: string;
  children: ReactNode;
  /** Extra classes merged onto the outer container (e.g. "pb-24"). */
  className?: string;
}

/**
 * Canonical page container for every /galleries/{id} workspace page
 * (overview, cover, photo-search, settings, sales, ai, delivery).
 *
 * One shared shell means the workspace nav renders at an identical
 * width and position on every tab — previously each page rolled its
 * own wrapper (full-width vs max-w-3xl vs max-w-5xl), so the nav strip
 * visibly jumped when switching tabs. Width follows the sales/ai/
 * delivery sub-pages, which already used max-w-6xl. Narrow content
 * (e.g. settings forms) constrains its own column INSIDE the shell
 * rather than shrinking the shell itself.
 */
export function GalleryPageShell({
  galleryId,
  children,
  className,
}: GalleryPageShellProps) {
  return (
    <div
      className={cn("mx-auto w-full max-w-6xl space-y-6 px-4 py-8", className)}
    >
      {/* Workspace nav first so the section dropdown is the topmost
          element on mobile. */}
      <GalleryWorkspaceNav galleryId={galleryId} />
      {children}
    </div>
  );
}
