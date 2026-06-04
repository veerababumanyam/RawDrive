import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BackButton } from "@/components/ui/back-button";

/**
 * PageHeader — the shared dashboard page header.
 *
 * Encapsulates the eyebrow + title + description + back-nav + actions layout
 * that gallery pages each hand-rolled differently (different heading sizes,
 * three back-button treatments, optional eyebrows). One <h1> at the canonical
 * `text-2xl` scale, the shared BackButton (already used by 10+ dashboard
 * pages), and a responsive actions slot. Token-only; renders correctly across
 * all three themes.
 */
interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  description?: string;
  /** When set, renders the shared BackButton above the title. */
  backHref?: string;
  backLabel?: string;
  /** Right-aligned header controls (links, buttons, toggles, badges). */
  actions?: ReactNode;
  /** Forwarded to the <h1> so callers can wire aria-labelledby. */
  titleId?: string;
  className?: string;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  backHref,
  backLabel = "Back",
  actions,
  titleId,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {backHref ? <BackButton href={backHref} label={backLabel} /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-1">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-widest text-text-tertiary">
              {eyebrow}
            </p>
          ) : null}
          <h1
            id={titleId}
            className="text-2xl font-semibold text-text-primary"
          >
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
