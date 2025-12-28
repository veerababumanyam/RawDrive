/**
 * GallerySearchBar Component
 * Search bar with autocomplete for tags and people, plus filter chips
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  X,
  Tag,
  User,
  Sparkles,
  Loader2,
  Filter,
  ChevronDown,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import {
  useAssetSearch,
  type SearchFilters,
  type TagSuggestion,
  type PersonSuggestion,
  type TagSource,
} from '../../../hooks/useAssetSearch';

interface GallerySearchBarProps {
  /** Gallery ID for scoped search */
  galleryId: string;
  /** Called when filters change */
  onFiltersChange: (filters: SearchFilters, queryParams: URLSearchParams) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Show source filter dropdown */
  showSourceFilter?: boolean;
  /** Compact mode */
  compact?: boolean;
}

// Tag source display config
const SOURCE_CONFIG: Record<TagSource, { label: string; icon: React.ReactNode; color: string }> = {
  manual: {
    label: 'Manual',
    icon: <User className="w-3 h-3" />,
    color: 'bg-primary/10 text-primary border-primary/20',
  },
  ai_vision: {
    label: 'AI Vision',
    icon: <Sparkles className="w-3 h-3" />,
    color: 'bg-accent/10 text-accent border-accent/20',
  },
  ai_gemini: {
    label: 'AI Gemini',
    icon: <Sparkles className="w-3 h-3" />,
    color: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  },
  ai_local: {
    label: 'Local AI',
    icon: <Sparkles className="w-3 h-3" />,
    color: 'bg-green-500/10 text-green-500 border-green-500/20',
  },
};

export const GallerySearchBar: React.FC<GallerySearchBarProps> = ({
  galleryId,
  onFiltersChange,
  placeholder = 'Search photos by filename, tag, or person...',
  showSourceFilter = true,
  compact = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [suggestionType, setSuggestionType] = useState<'tag' | 'person' | null>(null);
  const [selectedTags, setSelectedTags] = useState<TagSuggestion[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<PersonSuggestion[]>([]);

  const {
    filters,
    setFilters,
    clearFilters,
    hasActiveFilters,
    debouncedQuery,
    tagSuggestions,
    personSuggestions,
    loadingSuggestions,
    fetchTagSuggestions,
    fetchPersonSuggestions,
    buildQueryParams,
  } = useAssetSearch({ galleryId });

  // Notify parent when filters change
  useEffect(() => {
    onFiltersChange(filters, buildQueryParams());
  }, [filters, debouncedQuery, onFiltersChange, buildQueryParams]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Check for special prefixes
    if (value.startsWith('@')) {
      // Person search
      setSuggestionType('person');
      fetchPersonSuggestions(value.slice(1));
      setShowSuggestions(true);
    } else if (value.startsWith('#')) {
      // Tag search
      setSuggestionType('tag');
      fetchTagSuggestions(value.slice(1));
      setShowSuggestions(true);
    } else {
      // Regular search
      setSuggestionType(null);
      setFilters({ query: value });
      setShowSuggestions(false);
    }
  };

  // Handle suggestion selection
  const handleSelectTag = useCallback(
    (tag: TagSuggestion) => {
      const newSelectedTags = [...selectedTags, tag];
      setSelectedTags(newSelectedTags);
      setFilters({
        tagIds: newSelectedTags.map((t) => t.tag_id),
      });
      setInputValue('');
      setShowSuggestions(false);
      inputRef.current?.focus();
    },
    [selectedTags, setFilters]
  );

  const handleSelectPerson = useCallback(
    (person: PersonSuggestion) => {
      const newSelectedPeople = [...selectedPeople, person];
      setSelectedPeople(newSelectedPeople);
      setFilters({
        faceGroupIds: newSelectedPeople.map((p) => p.face_group_id),
      });
      setInputValue('');
      setShowSuggestions(false);
      inputRef.current?.focus();
    },
    [selectedPeople, setFilters]
  );

  // Remove filter chip
  const handleRemoveTag = useCallback(
    (tagId: string) => {
      const newSelectedTags = selectedTags.filter((t) => t.tag_id !== tagId);
      setSelectedTags(newSelectedTags);
      setFilters({
        tagIds: newSelectedTags.length > 0 ? newSelectedTags.map((t) => t.tag_id) : undefined,
      });
    },
    [selectedTags, setFilters]
  );

  const handleRemovePerson = useCallback(
    (faceGroupId: string) => {
      const newSelectedPeople = selectedPeople.filter((p) => p.face_group_id !== faceGroupId);
      setSelectedPeople(newSelectedPeople);
      setFilters({
        faceGroupIds:
          newSelectedPeople.length > 0 ? newSelectedPeople.map((p) => p.face_group_id) : undefined,
      });
    },
    [selectedPeople, setFilters]
  );

  // Handle source filter selection
  const handleSourceSelect = (source: TagSource | null) => {
    setFilters({ tagSource: source || undefined });
    setShowSourceDropdown(false);
  };

  // Clear all filters
  const handleClearAll = useCallback(() => {
    clearFilters();
    setSelectedTags([]);
    setSelectedPeople([]);
    setInputValue('');
  }, [clearFilters]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false);
      setShowSourceDropdown(false);
    }
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setShowSourceDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative w-full">
      {/* Search Input with Filter Chips */}
      <div
        className={`
          flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-lg
          focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20
          ${compact ? 'min-h-[40px]' : 'min-h-[44px]'}
        `}
      >
        <Search className="w-4 h-4 text-text-tertiary shrink-0" />

        {/* Selected filter chips */}
        <div className="flex flex-wrap items-center gap-1.5 flex-1">
          {selectedTags.map((tag) => (
            <span
              key={tag.tag_id}
              className={`
                inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border
                ${SOURCE_CONFIG[tag.source]?.color || 'bg-surface-hover text-text-secondary border-border'}
              `}
            >
              <Tag className="w-3 h-3" />
              {tag.name}
              <button
                onClick={() => handleRemoveTag(tag.tag_id)}
                className="ml-0.5 hover:text-error"
                aria-label={`Remove ${tag.name} filter`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {selectedPeople.map((person) => (
            <span
              key={person.face_group_id}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border bg-surface-hover text-text-secondary border-border"
            >
              <User className="w-3 h-3" />
              {person.display_name || 'Unknown'}
              <button
                onClick={() => handleRemovePerson(person.face_group_id)}
                className="ml-0.5 hover:text-error"
                aria-label={`Remove ${person.display_name || 'person'} filter`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {filters.tagSource && (
            <span
              className={`
                inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border
                ${SOURCE_CONFIG[filters.tagSource].color}
              `}
            >
              {SOURCE_CONFIG[filters.tagSource].icon}
              {SOURCE_CONFIG[filters.tagSource].label}
              <button
                onClick={() => setFilters({ tagSource: undefined })}
                className="ml-0.5 hover:text-error"
                aria-label="Remove source filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (suggestionType && inputValue) {
                setShowSuggestions(true);
              }
            }}
            placeholder={
              selectedTags.length > 0 || selectedPeople.length > 0 ? 'Add more...' : placeholder
            }
            className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder-text-tertiary"
          />
        </div>

        {/* Loading indicator */}
        {loadingSuggestions && <Loader2 className="w-4 h-4 animate-spin text-text-tertiary" />}

        {/* Source filter button */}
        {showSourceFilter && (
          <div className="relative">
            <AppButton
              variant="ghost"
              size="sm"
              onClick={() => setShowSourceDropdown(!showSourceDropdown)}
              className="shrink-0"
              aria-label="Filter by tag source"
            >
              <Filter className="w-4 h-4" />
              <ChevronDown className="w-3 h-3" />
            </AppButton>

            {showSourceDropdown && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-surface border border-border rounded-lg shadow-lg z-50 py-1">
                <button
                  onClick={() => handleSourceSelect(null)}
                  className={`
                    w-full px-3 py-2 text-left text-sm hover:bg-surface-hover
                    ${!filters.tagSource ? 'text-primary font-medium' : 'text-text-primary'}
                  `}
                >
                  All Sources
                </button>
                {Object.entries(SOURCE_CONFIG).map(([source, config]) => (
                  <button
                    key={source}
                    onClick={() => handleSourceSelect(source as TagSource)}
                    className={`
                      w-full px-3 py-2 text-left text-sm hover:bg-surface-hover
                      flex items-center gap-2
                      ${filters.tagSource === source ? 'text-primary font-medium' : 'text-text-primary'}
                    `}
                  >
                    {config.icon}
                    {config.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Clear all button */}
        {hasActiveFilters && (
          <AppButton
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="shrink-0 text-text-tertiary hover:text-text-primary"
            aria-label="Clear all filters"
          >
            <X className="w-4 h-4" />
          </AppButton>
        )}
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && (suggestionType === 'tag' || suggestionType === 'person') && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {loadingSuggestions ? (
            <div className="flex items-center justify-center py-4 text-text-tertiary">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              <span className="text-sm">Searching...</span>
            </div>
          ) : suggestionType === 'tag' && tagSuggestions.length > 0 ? (
            <>
              <div className="px-3 py-1.5 text-xs font-medium text-text-tertiary uppercase tracking-wider border-b border-border">
                Tags
              </div>
              {tagSuggestions.map((tag) => (
                <button
                  key={tag.tag_id}
                  onClick={() => handleSelectTag(tag)}
                  className="w-full px-3 py-2 text-left hover:bg-surface-hover flex items-center gap-2"
                >
                  <Tag className="w-4 h-4 text-text-tertiary" />
                  <span className="flex-1 text-sm text-text-primary">{tag.name}</span>
                  <span className="text-xs text-text-tertiary">{tag.usage_count} photos</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${SOURCE_CONFIG[tag.source]?.color || ''}`}
                  >
                    {SOURCE_CONFIG[tag.source]?.label}
                  </span>
                </button>
              ))}
            </>
          ) : suggestionType === 'person' && personSuggestions.length > 0 ? (
            <>
              <div className="px-3 py-1.5 text-xs font-medium text-text-tertiary uppercase tracking-wider border-b border-border">
                People
              </div>
              {personSuggestions.map((person) => (
                <button
                  key={person.face_group_id}
                  onClick={() => handleSelectPerson(person)}
                  className="w-full px-3 py-2 text-left hover:bg-surface-hover flex items-center gap-2"
                >
                  {person.representative_thumbnail_url ? (
                    <img
                      src={person.representative_thumbnail_url}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center">
                      <User className="w-4 h-4 text-text-tertiary" />
                    </div>
                  )}
                  <span className="flex-1 text-sm text-text-primary">
                    {person.display_name || 'Unknown Person'}
                  </span>
                  <span className="text-xs text-text-tertiary">{person.face_count} photos</span>
                </button>
              ))}
            </>
          ) : (
            <div className="px-3 py-4 text-center text-sm text-text-tertiary">
              {suggestionType === 'tag' ? 'No tags found' : 'No people found'}
            </div>
          )}
        </div>
      )}

      {/* Hint text */}
      {!compact && !hasActiveFilters && (
        <div className="mt-1 text-xs text-text-tertiary">
          Type <kbd className="px-1 py-0.5 bg-surface-hover rounded">#</kbd> for tags or{' '}
          <kbd className="px-1 py-0.5 bg-surface-hover rounded">@</kbd> for people
        </div>
      )}
    </div>
  );
};

export default GallerySearchBar;
