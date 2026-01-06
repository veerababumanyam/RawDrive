/**
 * CommandBar Component
 *
 * AI Native UX command palette accessible via Cmd+K (or Ctrl+K on Windows)
 * Provides unified search and navigation with natural language parsing.
 *
 * Feature: AI & Search Features (GEO)
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  X,
  Image,
  Folder,
  Tag,
  User,
  MessageSquare,
  ArrowRight,
  Clock,
  Sparkles,
  ChevronRight,
  Command,
  CornerDownLeft,
} from 'lucide-react';
import { useSearch } from '@/hooks/useSearch';
import { searchService, type EntityType } from '@/services/searchService';
import type {
  GallerySearchResult,
  AssetSearchResult,
  TagSearchResult,
  PersonSearchResult,
  CommentSearchResult,
} from '@/services/searchService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandBarProps {
  /** Workspace ID for search scope */
  workspaceId: string;
  /** Whether the command bar is open */
  isOpen: boolean;
  /** Callback when the command bar should close */
  onClose: () => void;
  /** Callback when a gallery is selected */
  onSelectGallery?: (galleryId: string) => void;
  /** Callback when an asset is selected */
  onSelectAsset?: (assetId: string, galleryId?: string) => void;
  /** Callback when a tag is selected */
  onSelectTag?: (tagId: string, tagName: string) => void;
  /** Callback when a person is selected */
  onSelectPerson?: (personId: string, displayName?: string) => void;
  /** Callback when a custom action is executed */
  onExecuteAction?: (action: string, params: Record<string, string>) => void;
}

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

type ResultType = 'gallery' | 'asset' | 'tag' | 'person' | 'comment' | 'action';

interface SearchResultItem {
  type: ResultType;
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  data: GallerySearchResult | AssetSearchResult | TagSearchResult | PersonSearchResult | CommentSearchResult | QuickAction;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTITY_TYPE_ICONS: Record<EntityType, React.ReactNode> = {
  galleries: <Folder className="w-4 h-4" />,
  assets: <Image className="w-4 h-4" />,
  tags: <Tag className="w-4 h-4" />,
  people: <User className="w-4 h-4" />,
  comments: <MessageSquare className="w-4 h-4" />,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CommandBar: React.FC<CommandBarProps> = ({
  workspaceId,
  isOpen,
  onClose,
  onSelectGallery,
  onSelectAsset,
  onSelectTag,
  onSelectPerson,
  onExecuteAction,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showAIHint, setShowAIHint] = useState(false);

  const {
    query,
    setQuery,
    results,
    loading,
    error,
    recentQueries,
    clear,
  } = useSearch({
    workspaceId,
    debounceMs: 200,
    minQueryLength: 1,
    cacheResults: true,
  });

  // Quick actions available when no query
  const quickActions: QuickAction[] = useMemo(
    () => [
      {
        id: 'create-gallery',
        label: 'Create new gallery',
        description: 'Start a new photo gallery',
        icon: <Folder className="w-4 h-4" />,
        shortcut: 'G',
        action: () => {
          onExecuteAction?.('create-gallery', {});
          onClose();
        },
      },
      {
        id: 'upload-photos',
        label: 'Upload photos',
        description: 'Upload photos to current gallery',
        icon: <Image className="w-4 h-4" />,
        shortcut: 'U',
        action: () => {
          onExecuteAction?.('upload-photos', {});
          onClose();
        },
      },
      {
        id: 'ai-analyze',
        label: 'AI Photo Analysis',
        description: 'Analyze photos with AI',
        icon: <Sparkles className="w-4 h-4" />,
        action: () => {
          onExecuteAction?.('ai-analyze', {});
          onClose();
        },
      },
    ],
    [onExecuteAction, onClose]
  );

  // Transform search results into unified list
  const searchResultItems: SearchResultItem[] = useMemo(() => {
    if (!results) return [];

    const items: SearchResultItem[] = [];

    // Add galleries
    results.results.galleries?.forEach((gallery) => {
      items.push({
        type: 'gallery',
        id: gallery.gallery_id,
        title: gallery.title,
        subtitle: gallery.client_name || gallery.description,
        icon: <Folder className="w-4 h-4 text-blue-500" />,
        data: gallery,
      });
    });

    // Add assets
    results.results.assets?.forEach((asset) => {
      items.push({
        type: 'asset',
        id: asset.asset_id,
        title: asset.file_name,
        subtitle: `${(asset.size_bytes / 1024 / 1024).toFixed(1)} MB`,
        icon: <Image className="w-4 h-4 text-green-500" />,
        data: asset,
      });
    });

    // Add tags
    results.results.tags?.forEach((tag) => {
      items.push({
        type: 'tag',
        id: tag.tag_id,
        title: tag.name,
        subtitle: `${tag.usage_count} photos`,
        icon: <Tag className="w-4 h-4 text-purple-500" />,
        data: tag,
      });
    });

    // Add people
    results.results.people?.forEach((person) => {
      items.push({
        type: 'person',
        id: person.person_id,
        title: person.display_name || 'Unknown',
        subtitle: `${person.face_count} appearances`,
        icon: <User className="w-4 h-4 text-orange-500" />,
        data: person,
      });
    });

    // Add comments
    results.results.comments?.forEach((comment) => {
      items.push({
        type: 'comment',
        id: comment.comment_id,
        title: comment.body.substring(0, 50) + (comment.body.length > 50 ? '...' : ''),
        subtitle: `by ${comment.author_name}`,
        icon: <MessageSquare className="w-4 h-4 text-cyan-500" />,
        data: comment,
      });
    });

    return items;
  }, [results]);

  // Combined list of items to display
  const displayItems: SearchResultItem[] = useMemo(() => {
    if (query.length > 0) {
      return searchResultItems;
    }
    // Show quick actions when no query
    return quickActions.map((action) => ({
      type: 'action' as ResultType,
      id: action.id,
      title: action.label,
      subtitle: action.description,
      icon: action.icon,
      data: action,
    }));
  }, [query, searchResultItems, quickActions]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [displayItems]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < displayItems.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case 'Enter':
          e.preventDefault();
          handleSelectItem(displayItems[selectedIndex]);
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'Tab':
          e.preventDefault();
          // Cycle through entity type filters
          break;
      }
    },
    [displayItems, selectedIndex, onClose]
  );

  // Handle item selection
  const handleSelectItem = useCallback(
    (item: SearchResultItem) => {
      if (!item) return;

      switch (item.type) {
        case 'gallery':
          onSelectGallery?.((item.data as GallerySearchResult).gallery_id);
          onClose();
          break;
        case 'asset':
          const asset = item.data as AssetSearchResult;
          onSelectAsset?.(asset.asset_id, asset.gallery_id);
          onClose();
          break;
        case 'tag':
          const tag = item.data as TagSearchResult;
          onSelectTag?.(tag.tag_id, tag.name);
          onClose();
          break;
        case 'person':
          const person = item.data as PersonSearchResult;
          onSelectPerson?.(person.person_id, person.display_name);
          onClose();
          break;
        case 'action':
          (item.data as QuickAction).action();
          break;
      }
    },
    [onSelectGallery, onSelectAsset, onSelectTag, onSelectPerson, onClose]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Global keyboard shortcut to open
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (!isOpen) {
          // Trigger external open handler if needed
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen]);

  // Show AI hint for natural language queries
  useEffect(() => {
    const parsed = searchService.parseNaturalLanguageQuery(query);
    setShowAIHint(parsed.filters.entityTypes !== undefined ||
                  parsed.filters.hasPerson !== undefined ||
                  parsed.filters.hasTag !== undefined);
  }, [query]);

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Command Bar */}
      <div
        className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-2xl z-50"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center px-4 py-3 border-b border-border">
            <Search className="w-5 h-5 text-text-secondary shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search galleries, photos, people, tags..."
              className="flex-1 px-3 py-1 bg-transparent text-text-primary placeholder:text-text-tertiary focus:outline-none"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
            />
            {loading && (
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            )}
            {query && !loading && (
              <button
                onClick={clear}
                className="p-1 rounded hover:bg-surface-hover text-text-secondary"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* AI Hint */}
          {showAIHint && (
            <div className="px-4 py-2 bg-primary/5 border-b border-border flex items-center gap-2 text-sm">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-text-secondary">
                AI is interpreting your natural language query
              </span>
            </div>
          )}

          {/* Results List */}
          <div
            ref={listRef}
            className="max-h-[60vh] overflow-y-auto"
            role="listbox"
          >
            {/* Recent Queries */}
            {!query && recentQueries.length > 0 && (
              <div className="px-4 py-2">
                <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">
                  Recent Searches
                </p>
                <div className="space-y-1">
                  {recentQueries.slice(0, 3).map((recentQuery) => (
                    <button
                      key={recentQuery}
                      onClick={() => setQuery(recentQuery)}
                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-left hover:bg-surface-hover text-text-secondary"
                    >
                      <Clock className="w-4 h-4" />
                      <span>{recentQuery}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Section Header */}
            {displayItems.length > 0 && (
              <div className="px-4 py-2 sticky top-0 bg-surface/95 backdrop-blur-sm">
                <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
                  {query ? `Results (${results?.total || 0})` : 'Quick Actions'}
                </p>
              </div>
            )}

            {/* Result Items */}
            {displayItems.map((item, index) => (
              <button
                key={`${item.type}-${item.id}`}
                data-index={index}
                onClick={() => handleSelectItem(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`flex items-center gap-3 w-full px-4 py-3 text-left transition-colors ${
                  selectedIndex === index
                    ? 'bg-primary/10'
                    : 'hover:bg-surface-hover'
                }`}
                role="option"
                aria-selected={selectedIndex === index}
              >
                <div
                  className={`shrink-0 p-2 rounded-lg ${
                    selectedIndex === index ? 'bg-primary/20' : 'bg-surface-hover'
                  }`}
                >
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary font-medium truncate">
                    {item.title}
                  </p>
                  {item.subtitle && (
                    <p className="text-sm text-text-secondary truncate">
                      {item.subtitle}
                    </p>
                  )}
                </div>
                {item.type === 'action' && (item.data as QuickAction).shortcut && (
                  <kbd className="hidden sm:block px-2 py-1 text-xs bg-surface-hover rounded text-text-tertiary">
                    {(item.data as QuickAction).shortcut}
                  </kbd>
                )}
                {selectedIndex === index && (
                  <ChevronRight className="w-4 h-4 text-text-tertiary" />
                )}
              </button>
            ))}

            {/* No Results */}
            {query && displayItems.length === 0 && !loading && (
              <div className="px-4 py-8 text-center">
                <Search className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
                <p className="text-text-secondary">No results found for "{query}"</p>
                <p className="text-sm text-text-tertiary mt-1">
                  Try a different search term or check spelling
                </p>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="px-4 py-8 text-center">
                <p className="text-error">Search failed: {error.message}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border bg-surface-hover/50 flex items-center justify-between text-xs text-text-tertiary">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-surface rounded border border-border">
                  <ArrowRight className="w-3 h-3 -rotate-90" />
                </kbd>
                <kbd className="px-1.5 py-0.5 bg-surface rounded border border-border">
                  <ArrowRight className="w-3 h-3 rotate-90" />
                </kbd>
                <span className="ml-1">Navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-surface rounded border border-border">
                  <CornerDownLeft className="w-3 h-3" />
                </kbd>
                <span className="ml-1">Select</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-surface rounded border border-border">
                  esc
                </kbd>
                <span className="ml-1">Close</span>
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Command className="w-3 h-3" />
              <span>K to open</span>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default CommandBar;
