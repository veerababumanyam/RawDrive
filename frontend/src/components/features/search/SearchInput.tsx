/**
 * SearchInput Component
 *
 * Inline search input for embedding in pages/galleries.
 * Supports natural language queries with AI parsing hints.
 *
 * Feature: AI & Search Features (GEO)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Search, X, Sparkles, Loader2 } from 'lucide-react';
import { useSearch } from '@/hooks/useSearch';
import { searchService, type EntityType } from '@/services/searchService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchInputProps {
  /** Workspace ID for search scope */
  workspaceId: string;
  /** Gallery ID to scope search within (optional) */
  galleryId?: string;
  /** Entity types to search */
  entityTypes?: EntityType[];
  /** Placeholder text */
  placeholder?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show AI hint when natural language is detected */
  showAIHint?: boolean;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** Callback when search results change */
  onResultsChange?: (results: ReturnType<typeof useSearch>['results']) => void;
  /** Callback when a result is selected (for typeahead) */
  onSelect?: (type: string, id: string, data: unknown) => void;
  /** Custom className */
  className?: string;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const sizeStyles = {
  sm: 'h-8 text-sm px-3',
  md: 'h-10 text-base px-4',
  lg: 'h-12 text-lg px-5',
};

const iconSizes = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SearchInput: React.FC<SearchInputProps> = ({
  workspaceId,
  galleryId,
  entityTypes,
  placeholder = 'Search...',
  size = 'md',
  showAIHint = true,
  autoFocus = false,
  onResultsChange,
  onSelect,
  className = '',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [showAIIndicator, setShowAIIndicator] = useState(false);

  const {
    query,
    setQuery,
    results,
    loading,
    error,
    clear,
  } = useSearch({
    workspaceId,
    entityTypes,
    galleryId,
    debounceMs: 300,
    minQueryLength: 2,
  });

  // Notify parent of results changes
  useEffect(() => {
    onResultsChange?.(results);
  }, [results, onResultsChange]);

  // Check for natural language patterns
  useEffect(() => {
    if (!showAIHint) {
      setShowAIIndicator(false);
      return;
    }
    const parsed = searchService.parseNaturalLanguageQuery(query);
    const hasNLFeatures =
      parsed.filters.entityTypes !== undefined ||
      parsed.filters.hasPerson !== undefined ||
      parsed.filters.hasTag !== undefined ||
      parsed.filters.dateRange !== undefined;
    setShowAIIndicator(hasNLFeatures && query.length > 3);
  }, [query, showAIHint]);

  const handleClear = useCallback(() => {
    clear();
    inputRef.current?.focus();
  }, [clear]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClear();
      }
    },
    [handleClear]
  );

  return (
    <div className={`relative ${className}`}>
      <div
        className={`
          relative flex items-center
          bg-surface border rounded-lg
          transition-all duration-200
          ${isFocused ? 'border-primary ring-2 ring-primary/20' : 'border-border'}
          ${sizeStyles[size]}
        `}
      >
        {/* Search Icon or Loading */}
        <div className="shrink-0 text-text-secondary">
          {loading ? (
            <Loader2 className={`${iconSizes[size]} animate-spin`} />
          ) : (
            <Search className={iconSizes[size]} />
          )}
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`
            flex-1 bg-transparent
            text-text-primary placeholder:text-text-tertiary
            focus:outline-none
            ${size === 'sm' ? 'ml-2' : 'ml-3'}
          `}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
        />

        {/* AI Indicator */}
        {showAIIndicator && (
          <div
            className="shrink-0 flex items-center gap-1 px-2 py-0.5 bg-primary/10 rounded text-primary text-xs mr-2"
            title="AI is parsing your natural language query"
          >
            <Sparkles className="w-3 h-3" />
            <span className="hidden sm:inline">AI</span>
          </div>
        )}

        {/* Clear Button */}
        {query && (
          <button
            onClick={handleClear}
            className="shrink-0 p-1 rounded-md hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Clear search"
          >
            <X className={iconSizes[size]} />
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="absolute top-full left-0 mt-1 text-sm text-error">
          {error.message}
        </p>
      )}

      {/* Results count hint */}
      {results && results.total > 0 && !loading && (
        <p className="absolute top-full left-0 mt-1 text-xs text-text-tertiary">
          {results.total} result{results.total !== 1 ? 's' : ''} found
        </p>
      )}
    </div>
  );
};

export default SearchInput;
