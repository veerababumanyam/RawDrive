/**
 * FavoriteListSelector Component
 *
 * Dropdown for selecting which list to add a photo to when favoriting.
 * Shows when clicking the heart button - allows direct list selection.
 *
 * Feature: 012-client-favorites
 */

import React, { useState, useRef, useEffect } from 'react';
import { Heart, ChevronDown, Folder, Plus, Check } from 'lucide-react';
import type { FavoriteList } from '../../../services/favoritesService';

export interface FavoriteListSelectorProps {
  /** Available lists */
  lists: FavoriteList[];
  /** Currently selected list ID (null = default) */
  selectedListId: string | null;
  /** Callback when list is selected */
  onSelect: (listId: string | null) => void;
  /** Callback when user wants to create a new list */
  onCreateNew: () => void;
  /** Whether selector is disabled */
  disabled?: boolean;
  /** Compact mode for inline use */
  compact?: boolean;
}

export const FavoriteListSelector: React.FC<FavoriteListSelectorProps> = ({
  lists,
  selectedListId,
  onSelect,
  onCreateNew,
  disabled = false,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get current list name
  const selectedList = lists.find((l) => l.list_id === selectedListId);
  const defaultList = lists.find((l) => l.is_default);
  const currentList = selectedList || defaultList;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleSelect = (listId: string | null) => {
    onSelect(listId);
    setIsOpen(false);
  };

  if (compact) {
    // Compact mode: just a small dropdown trigger
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className={`
            flex items-center gap-1 px-2 py-1 text-xs rounded-md
            transition-colors
            ${disabled
              ? 'bg-surface text-text-tertiary cursor-not-allowed'
              : 'bg-surface-hover text-text-secondary hover:bg-border'
            }
          `}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <Folder className="w-3 h-3" />
          <span className="max-w-[80px] truncate">
            {currentList?.name || 'Favorites'}
          </span>
          <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <ListDropdown
            lists={lists}
            selectedListId={selectedListId}
            onSelect={handleSelect}
            onCreateNew={() => {
              setIsOpen(false);
              onCreateNew();
            }}
            compact
          />
        )}
      </div>
    );
  }

  // Full mode: larger button with more detail
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between p-3
          bg-surface-hover rounded-lg transition-colors
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-border'}
        `}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-text-tertiary" />
          <span className="text-sm font-medium text-text-primary">
            {currentList?.name || 'Favorites'}
          </span>
          {currentList && (
            <span className="text-xs text-text-tertiary">
              ({currentList.photo_count})
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-text-tertiary transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <ListDropdown
          lists={lists}
          selectedListId={selectedListId}
          onSelect={handleSelect}
          onCreateNew={() => {
            setIsOpen(false);
            onCreateNew();
          }}
        />
      )}
    </div>
  );
};

// ============================================================================
// ListDropdown Sub-component
// ============================================================================

interface ListDropdownProps {
  lists: FavoriteList[];
  selectedListId: string | null;
  onSelect: (listId: string | null) => void;
  onCreateNew: () => void;
  compact?: boolean;
}

const ListDropdown: React.FC<ListDropdownProps> = ({
  lists,
  selectedListId,
  onSelect,
  onCreateNew,
  compact = false,
}) => {
  const defaultList = lists.find((l) => l.is_default);
  const otherLists = lists.filter((l) => !l.is_default);

  return (
    <div
      className={`
        absolute z-50 mt-1 bg-surface border border-border rounded-lg shadow-lg
        max-h-60 overflow-y-auto
        ${compact ? 'right-0 min-w-[160px]' : 'left-0 right-0'}
      `}
      role="listbox"
    >
      {/* Default Favorites list */}
      {defaultList && (
        <ListOption
          list={defaultList}
          isSelected={selectedListId === null || selectedListId === defaultList.list_id}
          onSelect={() => onSelect(null)}
          compact={compact}
        />
      )}

      {/* Divider */}
      {otherLists.length > 0 && <div className="border-t border-border" />}

      {/* Other lists */}
      {otherLists.map((list) => (
        <ListOption
          key={list.list_id}
          list={list}
          isSelected={selectedListId === list.list_id}
          onSelect={() => onSelect(list.list_id)}
          compact={compact}
        />
      ))}

      {/* Create new option */}
      <div className="border-t border-border">
        <button
          onClick={onCreateNew}
          className={`
            w-full flex items-center gap-2 text-left text-primary
            hover:bg-surface-hover transition-colors
            ${compact ? 'p-2 text-xs' : 'p-3 text-sm'}
          `}
        >
          <Plus className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
          <span className="font-medium">Create New List</span>
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// ListOption Sub-component
// ============================================================================

interface ListOptionProps {
  list: FavoriteList;
  isSelected: boolean;
  onSelect: () => void;
  compact?: boolean;
}

const ListOption: React.FC<ListOptionProps> = ({
  list,
  isSelected,
  onSelect,
  compact = false,
}) => {
  return (
    <button
      onClick={onSelect}
      className={`
        w-full flex items-center gap-2 text-left
        transition-colors
        ${isSelected ? 'bg-primary/10' : 'hover:bg-surface-hover'}
        ${compact ? 'p-2 text-xs' : 'p-3 text-sm'}
      `}
      role="option"
      aria-selected={isSelected}
    >
      {list.is_default ? (
        <Heart className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} text-error fill-error`} />
      ) : (
        <Folder className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} text-text-tertiary`} />
      )}
      <span className="flex-1 truncate">{list.name}</span>
      {list.is_default && !compact && (
        <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">
          Default
        </span>
      )}
      <span className="text-text-tertiary">
        {compact ? list.photo_count : `(${list.photo_count})`}
      </span>
      {isSelected && (
        <Check className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} text-primary`} />
      )}
    </button>
  );
};

export default FavoriteListSelector;
