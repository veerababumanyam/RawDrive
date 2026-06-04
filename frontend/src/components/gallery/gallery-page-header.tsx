import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface GalleryPageHeaderProps {
  /** When set, renders the "Back to gallery" link above the title. */
  backHref?: string;
  backLabel?: string;
  /** Uppercase section label rendered above the title. */
  eyebrow?: string;
  title: ReactNode;
  /** Typically the gallery name, or a one-line description. */
  subtitle?: ReactNode;
  /** Right-aligned controls (selects, Preview/Save buttons, …). */
  actions?: ReactNode;
}

/**
 * Canonical header for /galleries/{id} sub-pages. Standardizes the
 * back link (with chevron), eyebrow label, text-2xl title, and
 * subtitle that previously differed on every page — settings had a
 * bare back link, photo-search the only eyebrow, cover a smaller
 * title and no back link at all. Pages with toolbar controls (cover)
 * pass them via `actions` so they sit on the same row as the title.
 */
export function GalleryPageHeader({
  backHref,
  backLabel = "Back to gallery",
  eyebrow,
  title,
  subtitle,
  actions,
}: GalleryPageHeaderProps) {
  return (
    <header className="space-y-2">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          {eyebrow && (
            <p className="text-xs uppercase tracking-widest text-text-tertiary">
              {eyebrow}
            </p>
          )}
          <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
          {subtitle && (
            <p className="text-sm text-text-secondary">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:justify-end">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
