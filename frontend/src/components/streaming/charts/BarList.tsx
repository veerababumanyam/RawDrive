"use client";

/**
 * BarList — horizontal bar list primitive.
 * Bars sized proportionally to the largest value in the set.
 * Colors resolve to design tokens via Tailwind semantic classes.
 */

export interface BarListItem {
  label: string;
  value: number;
  hint?: string;
}

export interface BarListProps {
  items: BarListItem[];
  total?: number;
  maxItems?: number;
  ariaLabel: string;
  className?: string;
}

export function BarList({
  items,
  maxItems,
  ariaLabel,
  className,
}: BarListProps) {
  const visible = maxItems ? items.slice(-maxItems) : items;
  const max = visible.reduce((m, it) => (it.value > m ? it.value : m), 0) || 1;

  return (
    <ul
      role="list"
      aria-label={ariaLabel}
      className={["flex flex-col gap-2", className ?? ""].join(" ")}
    >
      {visible.map((it) => {
        const pct = (it.value / max) * 100;
        const srLabel = `${it.label}: ${it.value}${it.hint ? ` ${it.hint}` : ""}`;
        return (
          <li
            key={it.label}
            role="listitem"
            tabIndex={0}
            aria-label={srLabel}
            className="flex flex-col gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          >
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-text-primary">{it.label}</span>
              <span className="text-text-secondary tabular-nums">
                {it.value}
                {it.hint ? (
                  <span className="ml-1 text-text-tertiary">{it.hint}</span>
                ) : null}
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                data-testid="barlist-fill"
                className="h-full rounded-full bg-accent"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
