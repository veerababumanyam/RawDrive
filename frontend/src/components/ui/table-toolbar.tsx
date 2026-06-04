"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Search,
  Funnel,
  XMark,
  ChevronUp,
  ChevronDown,
  ChevronUpDown,
} from "@/components/icons";
import { GlassButton } from "@/components/ui/glass-button";
import type { SortDirection } from "@/hooks/use-data-table";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ToolbarFilterDef {
  key: string;
  label: string;
  options: string[];
}

export interface ToolbarSortOption {
  key: string;
  label: string;
}

interface TableToolbarProps {
  /** Enable search input. */
  searchable?: boolean;
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;

  /** Filter dropdowns. */
  filters?: ToolbarFilterDef[];
  getFilterValue: (key: string) => string;
  onFilterChange: (key: string, value: string) => void;

  /** Sort dropdown (for card layouts that can't click headers). */
  sortOptions?: ToolbarSortOption[];
  currentSortKey: string | null;
  currentSortDirection: SortDirection | null;
  onSortChange: (key: string) => void;

  /** Whether any filters are active. */
  hasActiveFilters: boolean;
  onClearAll: () => void;

  /** Toolbar action buttons (right side). */
  actions?: ReactNode;

  /** Extra className. */
  className?: string;
}

// ─── Sort Direction Icon ────────────────────────────────────────────────────

function SortDirectionIcon({ direction }: { direction: SortDirection | null }) {
  if (direction === "asc") return <ChevronUp className="h-3 w-3 text-accent" />;
  if (direction === "desc")
    return <ChevronDown className="h-3 w-3 text-accent" />;
  return <ChevronUpDown className="h-3 w-3 opacity-40" />;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function TableToolbar({
  searchable = false,
  searchPlaceholder = "Search...",
  searchValue,
  onSearchChange,
  filters = [],
  getFilterValue,
  onFilterChange,
  sortOptions = [],
  currentSortKey,
  currentSortDirection,
  onSortChange,
  hasActiveFilters,
  onClearAll,
  actions,
  className,
}: TableToolbarProps) {
  return (
    <div className={cn("glass-card p-4", className)}>
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        {searchable && (
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
            <input
              type="text"
              aria-label={
                searchPlaceholder === "Search..."
                  ? "Search table"
                  : searchPlaceholder
              }
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="input-base w-full pl-10"
            />
          </div>
        )}

        {/* Column Filters */}
        {filters.map((f) => (
          <div key={f.key} className="relative">
            <select
              aria-label={`Filter by ${f.label}`}
              value={getFilterValue(f.key)}
              onChange={(e) => onFilterChange(f.key, e.target.value)}
              className="input-base cursor-pointer appearance-none pl-3 pr-8 text-sm"
            >
              <option value="">All {f.label}</option>
              {f.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </option>
              ))}
            </select>
            <Funnel className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary pointer-events-none" />
          </div>
        ))}

        {/* Sort Dropdown (for card views) */}
        {sortOptions.length > 0 && (
          <div className="relative">
            <select
              aria-label="Sort results"
              value={currentSortKey || ""}
              onChange={(e) => onSortChange(e.target.value)}
              className="input-base cursor-pointer appearance-none pl-3 pr-8 text-sm"
            >
              <option value="">Sort by...</option>
              {sortOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}{" "}
                  {currentSortKey === opt.key
                    ? currentSortDirection === "asc"
                      ? "↑"
                      : "↓"
                    : ""}
                </option>
              ))}
            </select>
            <SortDirectionIcon
              direction={currentSortKey ? currentSortDirection : null}
            />
          </div>
        )}

        {/* Clear */}
        {hasActiveFilters && (
          <GlassButton
            type="button"
            onClick={onClearAll}
            variant="quiet"
            size="sm"
            icon={<XMark className="h-3.5 w-3.5" />}
          >
            Clear
          </GlassButton>
        )}

        {/* Actions */}
        {actions && (
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}
