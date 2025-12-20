/**
 * GalleryToolbar Component
 * Unified toolbar combining view toggles, filters, and selection controls
 * Clean, professional layout matching modern gallery UIs
 */

import React from 'react';
import { Grid, List, Sparkles, Heart, CheckSquare, Search, X } from 'lucide-react';
import { Checkbox } from '../../ui/FormControls';
import { AppButton } from '../../ui/AppButton';

export type ViewMode = 'grid' | 'list';
export type FilterType = 'all' | 'picks' | 'favorites' | 'selections';

export interface GalleryToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  filter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onViewAsClient?: () => void;
  onFindPeople?: () => void;
  onAIStory?: () => void;
  onShare?: () => void;
  onSettings?: () => void;
  onUpload?: () => void;
  selectAll?: boolean;
  onSelectAllChange?: (selected: boolean) => void;
  selectedCount?: number;
  /** Active filter state for toggle buttons */
  activeFilters?: {
    picks?: boolean;
    favorites?: boolean;
    selections?: boolean;
  };
  /** Callback when filter toggles change */
  onFiltersChange?: (filters: { picks?: boolean; favorites?: boolean; selections?: boolean }) => void;
  className?: string;
}

export const GalleryToolbar: React.FC<GalleryToolbarProps> = ({
  viewMode,
  onViewModeChange,
  searchQuery,
  onSearchChange,
  selectAll = false,
  onSelectAllChange,
  selectedCount = 0,
  activeFilters = {},
  onFiltersChange,
  className = '',
}) => {
  const handleFilterToggle = (filterKey: 'picks' | 'favorites' | 'selections') => {
    if (onFiltersChange) {
      onFiltersChange({
        ...activeFilters,
        [filterKey]: !activeFilters[filterKey],
      });
    }
  };

  return (
    <div
      className={`
        gallery-toolbar
        bg-surface/90 backdrop-blur-sm
        border border-border rounded-xl
        p-3 sm:p-4
        ${className}
      `}
    >
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        {/* View Mode Toggle */}
        <div className="flex items-center">
          <div className="inline-flex items-center p-1 bg-surface-hover/50 rounded-lg border border-border/50">
            <button
              onClick={() => onViewModeChange('grid')}
              className={`
                p-2 rounded-md transition-all duration-200
                ${viewMode === 'grid'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
                }
              `}
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
            >
              <Grid size={18} />
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className={`
                p-2 rounded-md transition-all duration-200
                ${viewMode === 'list'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
                }
              `}
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
            >
              <List size={18} />
            </button>
          </div>
        </div>

        {/* Separator */}
        <div className="hidden sm:block w-px h-6 bg-border" />

        {/* Filter Toggle Buttons */}
        {onFiltersChange && (
          <div className="flex items-center gap-2">
            {/* Picks Filter */}
            <AppButton
              variant={activeFilters.picks ? 'primary' : 'outline'}
              size="sm"
              leftIcon={<Sparkles size={14} />}
              onClick={() => handleFilterToggle('picks')}
              className={`
                gallery-filter-btn
                ${activeFilters.picks ? '' : 'border-border/70 text-text-secondary hover:text-text-primary'}
              `}
            >
              Picks
            </AppButton>

            {/* Favorites Filter */}
            <AppButton
              variant={activeFilters.favorites ? 'primary' : 'outline'}
              size="sm"
              leftIcon={
                <Heart
                  size={14}
                  className={activeFilters.favorites ? 'fill-current' : ''}
                />
              }
              onClick={() => handleFilterToggle('favorites')}
              className={`
                gallery-filter-btn
                ${activeFilters.favorites
                  ? 'bg-pink-500 hover:bg-pink-600 border-pink-500'
                  : 'border-border/70 text-text-secondary hover:text-text-primary hover:border-pink-300 hover:text-pink-500'
                }
              `}
            >
              Favorites
            </AppButton>

            {/* Selections Filter */}
            <AppButton
              variant={activeFilters.selections ? 'primary' : 'outline'}
              size="sm"
              leftIcon={<CheckSquare size={14} />}
              onClick={() => handleFilterToggle('selections')}
              className={`
                gallery-filter-btn
                ${activeFilters.selections ? '' : 'border-border/70 text-text-secondary hover:text-text-primary'}
              `}
            >
              <span className="hidden sm:inline">Select All</span>
              <span className="sm:hidden">All</span>
            </AppButton>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search Input */}
        <div className="relative w-full sm:w-auto sm:min-w-[200px] lg:min-w-[260px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
          <input
            type="text"
            placeholder="Filter items..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="
              w-full pl-9 pr-8 py-2
              text-sm
              bg-surface-hover/30 hover:bg-surface-hover/50 focus:bg-surface
              border border-border/50 focus:border-primary/50
              rounded-lg
              placeholder:text-text-tertiary
              transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-primary/20
            "
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-surface-active"
              aria-label="Clear search"
            >
              <X size={14} className="text-text-tertiary" />
            </button>
          )}
        </div>

        {/* Separator */}
        <div className="hidden sm:block w-px h-6 bg-border" />

        {/* Select All */}
        {onSelectAllChange && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox
              checked={selectAll}
              onChange={(e) => onSelectAllChange(e.target.checked)}
            />
            <span className="text-sm text-text-secondary whitespace-nowrap">
              Select All
            </span>
          </label>
        )}

        {/* Selected Count Badge */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
            <span>{selectedCount}</span>
            <span className="hidden sm:inline">selected</span>
          </div>
        )}
      </div>
    </div>
  );
};
