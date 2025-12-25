/**
 * GalleryToolbar Component
 * Toolbar matching screenshot layout exactly
 * Grid/List toggle | Filter pills (Picks, Favorites, Select All) | Search input
 * Mobile-first responsive design
 */

import React from 'react';
import { Grid, List, Sparkles, Heart, CheckSquare, Search, X, LayoutDashboard } from 'lucide-react';
import { Checkbox } from '../../ui/FormControls';
import { ViewMode, FilterType } from '../../../types/gallery';

export interface GalleryToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  filter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
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

// Filter pill button styles
const getFilterPillClasses = (isActive: boolean, variant: 'default' | 'favorites' = 'default') => {
  const baseClasses = `
    inline-flex items-center gap-1.5
    px-3 py-1.5
    text-sm font-medium
    rounded-full
    border
    transition-all duration-200
    whitespace-nowrap
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1
  `;

  if (isActive) {
    if (variant === 'favorites') {
      return `${baseClasses} bg-pink-500 border-pink-500 text-white focus-visible:ring-pink-500`;
    }
    return `${baseClasses} bg-primary border-primary text-white focus-visible:ring-primary`;
  }

  // Inactive state
  return `${baseClasses}
    bg-transparent
    border-border
    text-text-secondary
    hover:border-primary/50 hover:text-primary hover:bg-primary/5
    focus-visible:ring-primary/50
  `;
};

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
    <div className={`gallery-toolbar ${className}`}>
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        {/* View Mode Toggle - Grid/List buttons with active highlight */}
        <div className="flex items-center">
          <div className="inline-flex items-center p-0.5 bg-surface-hover/50 rounded-lg border border-border/50">
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
              onClick={() => onViewModeChange('masonry')}
              className={`
                p-2 rounded-md transition-all duration-200
                ${viewMode === 'masonry'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
                }
              `}
              aria-label="Masonry view"
              aria-pressed={viewMode === 'masonry'}
            >
              <LayoutDashboard size={18} />
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

        {/* Separator - visible on larger screens */}
        <div className="hidden sm:block w-px h-6 bg-border/50" />

        {/* Filter Pills - Matching screenshot exactly */}
        {onFiltersChange && (
          <div className="flex items-center gap-2">
            {/* Picks Filter - Star icon */}
            <button
              onClick={() => handleFilterToggle('picks')}
              className={getFilterPillClasses(!!activeFilters.picks)}
              aria-pressed={!!activeFilters.picks}
              aria-label="Show picks only"
            >
              <Sparkles size={14} />
              <span>Picks</span>
            </button>

            {/* Favorites Filter - Heart icon */}
            <button
              onClick={() => handleFilterToggle('favorites')}
              className={getFilterPillClasses(!!activeFilters.favorites, 'favorites')}
              aria-pressed={!!activeFilters.favorites}
              aria-label="Show favorites only"
            >
              <Heart size={14} className={activeFilters.favorites ? 'fill-current' : ''} />
              <span>Favorites</span>
            </button>

            {/* Select All Filter - Check icon */}
            <button
              onClick={() => handleFilterToggle('selections')}
              className={getFilterPillClasses(!!activeFilters.selections)}
              aria-pressed={!!activeFilters.selections}
              aria-label="Show selected only"
            >
              <CheckSquare size={14} />
              <span className="hidden sm:inline">Selected Only</span>
              <span className="sm:hidden">Selected</span>
            </button>

            {/* Clear Selection Button - Only if items selected */}
            {selectedCount > 0 && onSelectAllChange && (
               <button
                  onClick={() => onSelectAllChange(false)}
                  className="
                    inline-flex items-center gap-1.5
                    px-3 py-1.5
                    text-sm font-medium
                    rounded-full
                    border border-border
                    bg-surface hover:bg-surface-hover
                    text-text-secondary hover:text-text-primary
                    transition-all duration-200
                  "
                  aria-label="Deselect all"
                >
                  <X size={14} />
                  <span>Clear</span>
               </button>
            )}
          </div>
        )}

        {/* Spacer - pushes remaining items to right */}
        <div className="flex-1" />

        {/* Search Input - Clean minimal design */}
        <div className="relative w-full sm:w-auto sm:min-w-[180px] lg:min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
          <input
            type="text"
            placeholder="Filter items..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="
              w-full pl-9 pr-8 py-2
              text-sm
              bg-surface
              border border-border
              rounded-lg
              placeholder:text-text-tertiary
              transition-all duration-200
              focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20
              hover:border-border-hover
            "
            aria-label="Filter items"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface-hover transition-colors"
              aria-label="Clear search"
            >
              <X size={14} className="text-text-tertiary" />
            </button>
          )}
        </div>

        {/* Separator */}
        <div className="hidden sm:block w-px h-6 bg-border/50" />

        {/* Select All Checkbox */}
        {onSelectAllChange && (
          <label className="flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
            <Checkbox
              checked={selectAll}
              onChange={(e) => onSelectAllChange(e.target.checked)}
            />
            <span className="text-sm text-text-secondary">Select All</span>
          </label>
        )}

        {/* Selected Count Badge */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium whitespace-nowrap">
            <span>{selectedCount}</span>
            <span className="hidden sm:inline">selected</span>
          </div>
        )}
      </div>
    </div>
  );
};
