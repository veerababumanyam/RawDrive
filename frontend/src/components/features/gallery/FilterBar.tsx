/**
 * FilterBar Component
 * Advanced filter bar with combined filter support
 * Supports Picks, Favorites, Selections filters that can be combined
 * Includes search with debounce
 * Property 19, 20, 27, 28: Filter Accuracy and Combined Filter Support
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Sparkles, Heart, CheckSquare, X } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppInput } from '../../ui/AppInput';
import { useDebounce } from '../../../hooks/useDebounce';

export interface FilterBarProps {
  /** Show picks filter */
  showPicks?: boolean;
  /** Show favorites filter */
  showFavorites?: boolean;
  /** Show selections filter */
  showSelections?: boolean;
  /** Show search input */
  showSearch?: boolean;
  /** Current active filters */
  activeFilters: {
    picks?: boolean;
    favorites?: boolean;
    selections?: boolean;
  };
  /** Search query */
  searchQuery: string;
  /** Callback when filters change */
  onFiltersChange: (filters: {
    picks?: boolean;
    favorites?: boolean;
    selections?: boolean;
  }) => void;
  /** Callback when search query changes */
  onSearchChange: (query: string) => void;
  /** Debounce delay for search (ms) */
  searchDebounceMs?: number;
  /** Clear all filters callback */
  onClearAll?: () => void;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  showPicks = true,
  showFavorites = true,
  showSelections = true,
  showSearch = false,
  activeFilters,
  searchQuery,
  onFiltersChange,
  onSearchChange,
  searchDebounceMs = 300,
  onClearAll,
  className = '',
}) => {
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const debouncedSearchQuery = useDebounce(localSearchQuery, searchDebounceMs);

  // Sync debounced search query with parent
  useEffect(() => {
    if (debouncedSearchQuery !== searchQuery) {
      onSearchChange(debouncedSearchQuery);
    }
  }, [debouncedSearchQuery, searchQuery, onSearchChange]);

  // Sync external search query changes
  useEffect(() => {
    if (searchQuery !== localSearchQuery) {
      setLocalSearchQuery(searchQuery);
    }
  }, [searchQuery]);

  const handleFilterToggle = useCallback(
    (filterKey: 'picks' | 'favorites' | 'selections') => {
      onFiltersChange({
        ...activeFilters,
        [filterKey]: !activeFilters[filterKey],
      });
    },
    [activeFilters, onFiltersChange]
  );

  const handleClearAll = useCallback(() => {
    onFiltersChange({
      picks: false,
      favorites: false,
      selections: false,
    });
    setLocalSearchQuery('');
    onClearAll?.();
  }, [onFiltersChange, onClearAll]);

  const hasActiveFilters =
    activeFilters.picks ||
    activeFilters.favorites ||
    activeFilters.selections ||
    localSearchQuery.trim().length > 0;

  return (
    <div
      className={`
        flex items-center gap-3 p-3 bg-surface border border-border rounded-card
        ${className}
      `}
    >
      {/* Filter Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {showPicks && (
          <AppButton
            variant={activeFilters.picks ? 'primary' : 'outline'}
            size="sm"
            leftIcon={<Sparkles size={14} />}
            onClick={() => handleFilterToggle('picks')}
            aria-pressed={activeFilters.picks}
            aria-label={activeFilters.picks ? 'Hide picks' : 'Show picks'}
          >
            Picks
          </AppButton>
        )}

        {showFavorites && (
          <AppButton
            variant={activeFilters.favorites ? 'primary' : 'outline'}
            size="sm"
            leftIcon={<Heart size={14} fill={activeFilters.favorites ? 'currentColor' : 'none'} />}
            onClick={() => handleFilterToggle('favorites')}
            aria-pressed={activeFilters.favorites}
            aria-label={activeFilters.favorites ? 'Hide favorites' : 'Show favorites'}
          >
            Favorites
          </AppButton>
        )}

        {showSelections && (
          <AppButton
            variant={activeFilters.selections ? 'primary' : 'outline'}
            size="sm"
            leftIcon={<CheckSquare size={14} />}
            onClick={() => handleFilterToggle('selections')}
            aria-pressed={activeFilters.selections}
            aria-label={activeFilters.selections ? 'Hide selections' : 'Show selections'}
          >
            Selections
          </AppButton>
        )}
      </div>

      {/* Search Input */}
      {showSearch && (
        <div className="flex-1 min-w-0 max-w-md">
          <AppInput
            type="text"
            placeholder="Search photos..."
            value={localSearchQuery}
            onChange={(e) => setLocalSearchQuery(e.target.value)}
            leftIcon={<Search size={16} />}
            rightIcon={
              localSearchQuery ? (
                <button
                  onClick={() => {
                    setLocalSearchQuery('');
                    onSearchChange('');
                  }}
                  className="p-1 hover:bg-surface-hover rounded touch-target"
                  aria-label="Clear search"
                >
                  <X size={14} className="text-text-tertiary" />
                </button>
              ) : undefined
            }
            inputSize="sm"
            fullWidth
          />
        </div>
      )}

      {/* Clear All Button */}
      {hasActiveFilters && onClearAll && (
        <AppButton
          variant="ghost"
          size="sm"
          onClick={handleClearAll}
          className="text-text-tertiary hover:text-text-primary"
        >
          Clear All
        </AppButton>
      )}

      {/* Active Filters Count */}
      {hasActiveFilters && (
        <div className="text-xs text-text-tertiary whitespace-nowrap">
          {[
            activeFilters.picks && 'Picks',
            activeFilters.favorites && 'Favorites',
            activeFilters.selections && 'Selections',
            localSearchQuery.trim() && 'Search',
          ]
            .filter(Boolean)
            .join(', ')}
        </div>
      )}
    </div>
  );
};

