/**
 * ContentFilterSection Component
 *
 * Content/context filtering UI for AI photo filtering (US4).
 * Provides tag-based filtering and face presence/count filters.
 * Uses accessible checkbox groups and combobox patterns.
 *
 * Feature: 025-ai-filter-simplify
 */

import React, { useState, useCallback, useMemo, useId } from 'react';
import { AppButton } from '../../ui/AppButton';
import { AppInput } from '../../ui/AppInput';
import { Check, X, User, Tag } from 'lucide-react';
import type { TagOption, ContentFilterState } from '../../../types/aiFilter';

interface ContentFilterSectionProps {
  availableTags: TagOption[];
  includeTags: string[];
  excludeTags: string[];
  hasFaces?: boolean;
  minFaces?: number;
  maxFaces?: number;
  isLoading?: boolean;
  onChange: (values: Partial<ContentFilterState>) => void;
}

export const ContentFilterSection: React.FC<ContentFilterSectionProps> = ({
  availableTags,
  includeTags,
  excludeTags,
  hasFaces,
  minFaces,
  maxFaces,
  isLoading = false,
  onChange,
}) => {
  const [tagSearch, setTagSearch] = useState('');
  const tagGroupId = useId();
  const faceGroupId = useId();

  // Filter tags by search
  const filteredTags = useMemo(() => {
    if (!tagSearch.trim()) return availableTags;
    const search = tagSearch.toLowerCase();
    return availableTags.filter((tag) =>
      tag.name.toLowerCase().includes(search)
    );
  }, [availableTags, tagSearch]);

  // Group tags by type for better organization
  const tagsByType = useMemo(() => {
    const grouped = new Map<string, TagOption[]>();
    for (const tag of filteredTags) {
      const type = tag.type || 'other';
      if (!grouped.has(type)) grouped.set(type, []);
      grouped.get(type)!.push(tag);
    }
    return grouped;
  }, [filteredTags]);

  const handleTagToggle = useCallback(
    (tagName: string, mode: 'include' | 'exclude' | 'clear') => {
      const newInclude = includeTags.filter((t) => t !== tagName);
      const newExclude = excludeTags.filter((t) => t !== tagName);

      if (mode === 'include' && !includeTags.includes(tagName)) {
        newInclude.push(tagName);
      } else if (mode === 'exclude' && !excludeTags.includes(tagName)) {
        newExclude.push(tagName);
      }

      onChange({ includeTags: newInclude, excludeTags: newExclude });
    },
    [includeTags, excludeTags, onChange]
  );

  const handleFaceToggle = useCallback(
    (value: boolean | undefined) => {
      onChange({
        hasFaces: value,
        // Reset counts when toggling face filter
        minFaces: value === false ? undefined : minFaces,
        maxFaces: value === false ? undefined : maxFaces,
      });
    },
    [minFaces, maxFaces, onChange]
  );

  const handleFaceCountChange = useCallback(
    (field: 'minFaces' | 'maxFaces', value: string) => {
      const numeric = value === '' ? undefined : parseInt(value, 10);
      onChange({
        [field]: Number.isFinite(numeric) && numeric! >= 0 ? numeric : undefined,
      });
    },
    [onChange]
  );

  const getTagState = (tagName: string): 'include' | 'exclude' | 'none' => {
    if (includeTags.includes(tagName)) return 'include';
    if (excludeTags.includes(tagName)) return 'exclude';
    return 'none';
  };

  return (
    <div className="space-y-6">
      {/* Tag Filtering Section */}
      <fieldset
        className="border-0 p-0 m-0"
        aria-labelledby={`${tagGroupId}-legend`}
      >
        <legend
          id={`${tagGroupId}-legend`}
          className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2"
        >
          <Tag className="w-4 h-4" />
          Content Tags
        </legend>

        {/* Tag Search */}
        <div className="mb-3">
          <AppInput
            type="search"
            placeholder="Search tags..."
            inputSize="sm"
            value={tagSearch}
            onChange={(e) => setTagSearch(e.target.value)}
            aria-label="Search available tags"
            className="w-full max-w-xs"
          />
        </div>

        {/* Active Filters Summary */}
        {(includeTags.length > 0 || excludeTags.length > 0) && (
          <div className="flex flex-wrap gap-2 mb-3 p-2 bg-surface-secondary rounded-lg">
            {includeTags.map((tag) => (
              <span
                key={`include-${tag}`}
                className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-xs rounded-full"
              >
                <Check className="w-3 h-3" />
                {tag}
                <button
                  type="button"
                  onClick={() => handleTagToggle(tag, 'clear')}
                  className="ml-1 hover:text-green-600"
                  aria-label={`Remove ${tag} from included tags`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {excludeTags.map((tag) => (
              <span
                key={`exclude-${tag}`}
                className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-xs rounded-full"
              >
                <X className="w-3 h-3" />
                {tag}
                <button
                  type="button"
                  onClick={() => handleTagToggle(tag, 'clear')}
                  className="ml-1 hover:text-red-600"
                  aria-label={`Remove ${tag} from excluded tags`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Tag List by Type */}
        {isLoading ? (
          <div className="text-sm text-text-secondary py-4 text-center">
            Loading tags...
          </div>
        ) : availableTags.length === 0 ? (
          <div className="text-sm text-text-secondary py-4 text-center">
            No tags available. Run AI analysis to detect content tags.
          </div>
        ) : filteredTags.length === 0 ? (
          <div className="text-sm text-text-secondary py-4 text-center">
            No tags match &quot;{tagSearch}&quot;
          </div>
        ) : (
          <div className="space-y-3 max-h-48 overflow-y-auto">
            {Array.from(tagsByType.entries()).map(([type, tags]) => (
              <div key={type}>
                <div className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1.5">
                  {type}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => {
                    const state = getTagState(tag.name);
                    return (
                      <TagChip
                        key={tag.tag_id}
                        tag={tag}
                        state={state}
                        onToggle={handleTagToggle}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      {/* Face Filtering Section */}
      <fieldset
        className="border-0 p-0 m-0"
        aria-labelledby={`${faceGroupId}-legend`}
      >
        <legend
          id={`${faceGroupId}-legend`}
          className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2"
        >
          <User className="w-4 h-4" />
          People Filter
        </legend>

        {/* Face Presence Toggle */}
        <div
          role="group"
          aria-label="Filter by face presence"
          className="flex flex-wrap gap-2 mb-3"
        >
          <AppButton
            variant={hasFaces === undefined ? 'primary' : 'outline'}
            size="sm"
            onClick={() => handleFaceToggle(undefined)}
            aria-pressed={hasFaces === undefined}
          >
            All Photos
          </AppButton>
          <AppButton
            variant={hasFaces === true ? 'primary' : 'outline'}
            size="sm"
            onClick={() => handleFaceToggle(true)}
            aria-pressed={hasFaces === true}
          >
            With People
          </AppButton>
          <AppButton
            variant={hasFaces === false ? 'primary' : 'outline'}
            size="sm"
            onClick={() => handleFaceToggle(false)}
            aria-pressed={hasFaces === false}
          >
            Without People
          </AppButton>
        </div>

        {/* Face Count Range (only when hasFaces is true) */}
        {hasFaces === true && (
          <div className="flex items-center gap-3 pl-2">
            <span className="text-sm text-text-secondary">People count:</span>
            <AppInput
              type="number"
              min={0}
              max={100}
              step={1}
              inputSize="sm"
              className="w-16"
              placeholder="Min"
              value={minFaces ?? ''}
              onChange={(e) => handleFaceCountChange('minFaces', e.target.value)}
              aria-label="Minimum number of people"
            />
            <span className="text-text-tertiary">to</span>
            <AppInput
              type="number"
              min={0}
              max={100}
              step={1}
              inputSize="sm"
              className="w-16"
              placeholder="Max"
              value={maxFaces ?? ''}
              onChange={(e) => handleFaceCountChange('maxFaces', e.target.value)}
              aria-label="Maximum number of people"
            />
          </div>
        )}
      </fieldset>
    </div>
  );
};

// ============================================================================
// Tag Chip Subcomponent
// ============================================================================

interface TagChipProps {
  tag: TagOption;
  state: 'include' | 'exclude' | 'none';
  onToggle: (tagName: string, mode: 'include' | 'exclude' | 'clear') => void;
}

const TagChip: React.FC<TagChipProps> = ({ tag, state, onToggle }) => {
  const handleClick = () => {
    // Cycle: none -> include -> exclude -> none
    if (state === 'none') {
      onToggle(tag.name, 'include');
    } else if (state === 'include') {
      onToggle(tag.name, 'exclude');
    } else {
      onToggle(tag.name, 'clear');
    }
  };

  const baseClasses =
    'inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full cursor-pointer transition-colors';

  let stateClasses = '';
  let icon = null;

  switch (state) {
    case 'include':
      stateClasses =
        'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 ring-1 ring-green-500/30';
      icon = <Check className="w-3 h-3" />;
      break;
    case 'exclude':
      stateClasses =
        'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 ring-1 ring-red-500/30';
      icon = <X className="w-3 h-3" />;
      break;
    default:
      stateClasses =
        'bg-surface-tertiary text-text-secondary hover:bg-surface-hover';
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${baseClasses} ${stateClasses}`}
      aria-label={`${tag.name}: ${state === 'none' ? 'not filtered' : state === 'include' ? 'must have' : 'must not have'}. Click to ${state === 'none' ? 'include' : state === 'include' ? 'exclude' : 'clear'}.`}
      title={`${tag.usage_count} photos • Click to cycle filter state`}
    >
      {icon}
      {tag.name}
      <span className="text-[10px] opacity-60 ml-0.5">({tag.usage_count})</span>
    </button>
  );
};
