/**
 * CompactAIFilters Component
 *
 * Ultra-compact filter bar with icon buttons and tooltips.
 * Minimal space usage, similar to Canva/Gamma design patterns.
 *
 * Feature: AI Services Consolidation
 */

import React, { useState, useMemo } from 'react';
import { Filter, X, ChevronDown, ChevronUp } from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { QualityFilterSection } from './QualityFilterSection';
import { BlurFilterSection } from './BlurFilterSection';
import { TechnicalScoreFilterSection } from './TechnicalScoreFilterSection';
import type { AIFilterState } from '@/types/aiFilter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompactAIFiltersProps {
  filters: AIFilterState;
  onChange: (filters: Partial<AIFilterState>) => void;
  onApply?: () => void;
  onReset?: () => void;
  matchCount?: number | null;
  countLoading?: boolean;
  applyLoading?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CompactAIFilters: React.FC<CompactAIFiltersProps> = ({
  filters,
  onChange,
  onApply,
  onReset,
  matchCount,
  countLoading = false,
  applyLoading = false,
  defaultCollapsed = true,
  className = '',
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.qualityTier && filters.qualityTier !== 'all') count++;
    if (filters.qualityMin !== undefined) count++;
    if (filters.blurHide) count++;
    if (filters.minSharpness !== undefined) count++;
    if (filters.minExposure !== undefined) count++;
    if (filters.minComposition !== undefined) count++;
    return count;
  }, [filters]);

  const hasActiveFilters = activeFilterCount > 0;

  return (
    <div className={`flex items-center gap-2 p-2 bg-background/30 backdrop-blur-sm rounded-lg border border-border/30 ${className}`}>
      {/* Filter Icon Button */}
      <div className="relative group">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`
            relative flex items-center justify-center w-9 h-9 rounded-lg
            transition-all duration-200
            ${hasActiveFilters
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }
          `}
          aria-label="AI Filters"
          aria-expanded={!isCollapsed}
        >
          <Filter className="w-4 h-4" />
          {hasActiveFilters && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {activeFilterCount > 9 ? '9+' : activeFilterCount}
            </span>
          )}
        </button>
        {/* Tooltip */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-surface-elevated border border-border rounded-md text-xs text-text-secondary whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg pointer-events-none">
          <div className="font-medium text-text-primary">AI Filters</div>
          <div className="text-[10px] text-text-tertiary mt-0.5">
            {hasActiveFilters ? `${activeFilterCount} active` : 'Quality, blur, technical scores'}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border" />
        </div>
      </div>

      {/* Active Filter Count / Match Count */}
      {hasActiveFilters && (
        <>
          <div className="h-4 w-px bg-border/50" />
          <div className="text-xs text-text-secondary px-2">
            {countLoading ? '...' : matchCount !== null ? `${matchCount} matches` : '—'}
          </div>
        </>
      )}

      {/* Expand/Collapse Content */}
      {!isCollapsed && (
        <>
          <div className="h-4 w-px bg-border/50" />
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 grid gap-4 md:grid-cols-3 p-3 bg-surface/50 rounded-lg border border-border/50">
              <QualityFilterSection
                qualityTier={filters.qualityTier || 'all'}
                qualityMin={filters.qualityMin}
                onChange={onChange}
              />
              <BlurFilterSection
                blurHide={filters.blurHide || false}
                blurShowBokeh={filters.blurShowBokeh !== false}
                onChange={onChange}
              />
              <TechnicalScoreFilterSection
                minSharpness={filters.minSharpness}
                minExposure={filters.minExposure}
                minComposition={filters.minComposition}
                onChange={onChange}
              />
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <AppButton
                  variant="ghost"
                  size="sm"
                  onClick={onReset}
                  className="h-8"
                >
                  <X className="w-4 h-4" />
                </AppButton>
              )}
              {onApply && (
                <AppButton
                  variant="primary"
                  size="sm"
                  onClick={onApply}
                  isLoading={applyLoading}
                  disabled={!hasActiveFilters}
                  className="h-8"
                >
                  Apply
                </AppButton>
              )}
            </div>
          </div>
        </>
      )}

      {/* Collapse Toggle (when expanded) */}
      {!isCollapsed && (
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1.5 rounded hover:bg-surface-hover transition-colors"
          aria-label="Collapse filters"
        >
          <ChevronUp className="w-4 h-4 text-text-secondary" />
        </button>
      )}
    </div>
  );
};

export default CompactAIFilters;
