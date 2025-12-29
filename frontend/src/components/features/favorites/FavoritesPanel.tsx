/**
 * FavoritesPanel Component
 *
 * Slide-out panel showing favorited photos with list management.
 * Accessible via the favorites icon in gallery view.
 *
 * Feature: 012-client-favorites
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  X,
  Heart,
  ChevronDown,
  Download,
  Share2,
  Trash2,
  Plus,
  Folder,
  MoreHorizontal,
  Loader2,
  Edit3,
  Check,
} from 'lucide-react';
import { useFavorites } from '../../../hooks/useFavorites';
import type { FavoriteItem, FavoriteList } from '../../../services/favoritesService';
import { favoritesService } from '../../../services/favoritesService';
import { AppButton } from '../../ui/AppButton';

export interface FavoritesPanelProps {
  /** Gallery ID */
  galleryId: string;
  /** Whether the panel is open */
  isOpen: boolean;
  /** Callback to close the panel */
  onClose: () => void;
  /** Callback when a photo is clicked */
  onPhotoClick?: (assetId: string) => void;
  /** Callback when download is requested */
  onDownload?: (assetIds: string[]) => void;
}

export const FavoritesPanel: React.FC<FavoritesPanelProps> = ({
  galleryId,
  isOpen,
  onClose,
  onPhotoClick,
  onDownload,
}) => {
  const {
    favorites,
    lists,
    totalFavorites,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    isMutating,
    toggleFavorite,
    refresh,
    loadMore,
  } = useFavorites({ galleryId, enabled: isOpen });

  // Scroll container ref for intersection observer
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scrollContainer = scrollContainerRef.current;

    if (!sentinel || !scrollContainer || !isOpen) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          loadMore();
        }
      },
      {
        root: scrollContainer,
        rootMargin: '100px', // Trigger 100px before reaching end
        threshold: 0,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [isOpen, hasNextPage, isFetchingNextPage, loadMore]);

  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [showListDropdown, setShowListDropdown] = useState(false);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');

  // List edit/delete state
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListName, setEditingListName] = useState('');
  const [isDeletingList, setIsDeletingList] = useState(false);

  // Filter favorites by selected list
  const filteredFavorites = selectedListId
    ? favorites.filter((f) => f.list_id === selectedListId)
    : favorites;

  // Get currently selected list
  const currentList = lists.find((l) => l.list_id === selectedListId) || lists.find((l) => l.is_default);

  // Handle list creation
  const handleCreateList = useCallback(async () => {
    if (!newListName.trim()) return;

    try {
      await favoritesService.createList(galleryId, { name: newListName.trim() });
      setNewListName('');
      setIsCreatingList(false);
      refresh();
    } catch (err) {
      console.error('Failed to create list:', err);
    }
  }, [galleryId, newListName, refresh]);

  // Handle list rename
  const handleStartRename = useCallback((list: FavoriteList, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingListId(list.list_id);
    setEditingListName(list.name);
  }, []);

  const handleSaveRename = useCallback(async () => {
    if (!editingListId || !editingListName.trim()) return;

    try {
      await favoritesService.updateList(galleryId, editingListId, { name: editingListName.trim() });
      setEditingListId(null);
      setEditingListName('');
      refresh();
    } catch (err) {
      console.error('Failed to rename list:', err);
    }
  }, [galleryId, editingListId, editingListName, refresh]);

  const handleCancelRename = useCallback(() => {
    setEditingListId(null);
    setEditingListName('');
  }, []);

  // Handle list delete
  const handleDeleteList = useCallback(async (listId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // Don't allow deleting if already in progress
    if (isDeletingList) return;

    const listToDelete = lists.find((l) => l.list_id === listId);
    if (!listToDelete) return;

    // Confirm deletion
    const confirmed = window.confirm(
      `Delete "${listToDelete.name}"? ${listToDelete.photo_count} photo(s) will be moved to your default list.`
    );
    if (!confirmed) return;

    setIsDeletingList(true);
    try {
      await favoritesService.deleteList(galleryId, listId);
      // If we were viewing the deleted list, reset to all favorites
      if (selectedListId === listId) {
        setSelectedListId(null);
      }
      refresh();
    } catch (err) {
      console.error('Failed to delete list:', err);
    } finally {
      setIsDeletingList(false);
    }
  }, [galleryId, lists, selectedListId, isDeletingList, refresh]);

  // Handle removing favorite
  const handleRemoveFavorite = useCallback(
    async (assetId: string) => {
      await toggleFavorite(assetId, false);
    },
    [toggleFavorite]
  );

  // Handle download all
  const handleDownloadAll = useCallback(() => {
    const assetIds = filteredFavorites.map((f) => f.asset_id);
    onDownload?.(assetIds);
  }, [filteredFavorites, onDownload]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`
          fixed right-0 top-0 h-full w-full sm:w-96 max-w-full
          bg-surface z-50
          shadow-2xl
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        role="dialog"
        aria-modal="true"
        aria-label="Favorites Panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-error fill-error" />
            <h2 className="text-lg font-semibold text-text-primary">
              My Favorites
            </h2>
            <span className="text-sm text-text-secondary">
              ({totalFavorites})
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-hover transition-colors"
            aria-label="Close favorites panel"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        {/* List Selector */}
        <div className="p-4 border-b border-border">
          <div className="relative">
            <button
              onClick={() => setShowListDropdown(!showListDropdown)}
              className="w-full flex items-center justify-between p-3 bg-surface-hover rounded-lg hover:bg-border transition-colors"
              aria-expanded={showListDropdown}
              aria-haspopup="listbox"
            >
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-text-tertiary" />
                <span className="text-sm font-medium text-text-primary">
                  {currentList?.name || 'All Favorites'}
                </span>
                {currentList && (
                  <span className="text-xs text-text-tertiary">
                    ({currentList.photo_count})
                  </span>
                )}
              </div>
              <ChevronDown
                className={`w-4 h-4 text-text-tertiary transition-transform ${
                  showListDropdown ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* List Dropdown */}
            {showListDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                {/* All Favorites Option */}
                <button
                  onClick={() => {
                    setSelectedListId(null);
                    setShowListDropdown(false);
                  }}
                  className={`w-full flex items-center gap-2 p-3 text-left hover:bg-surface-hover ${
                    !selectedListId ? 'bg-primary/10' : ''
                  }`}
                >
                  <Heart className="w-4 h-4 text-error" />
                  <span className="text-sm">All Favorites</span>
                  <span className="text-xs text-text-tertiary ml-auto">
                    ({totalFavorites})
                  </span>
                </button>

                {/* Individual Lists */}
                {lists.map((list) => (
                  <div
                    key={list.list_id}
                    className={`relative group flex items-center ${
                      selectedListId === list.list_id ? 'bg-primary/10' : ''
                    }`}
                  >
                    {editingListId === list.list_id ? (
                      // Inline edit mode
                      <div className="flex-1 flex items-center gap-2 p-2">
                        <Folder className="w-4 h-4 text-text-tertiary" />
                        <input
                          type="text"
                          value={editingListName}
                          onChange={(e) => setEditingListName(e.target.value)}
                          className="flex-1 px-2 py-1 text-sm bg-surface border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename();
                            if (e.key === 'Escape') handleCancelRename();
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveRename();
                          }}
                          className="p-1 text-success hover:bg-success/10 rounded"
                          aria-label="Save list name"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelRename();
                          }}
                          className="p-1 text-text-tertiary hover:bg-surface-hover rounded"
                          aria-label="Cancel editing"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      // Normal view mode
                      <>
                        <button
                          onClick={() => {
                            setSelectedListId(list.list_id);
                            setShowListDropdown(false);
                          }}
                          className="flex-1 flex items-center gap-2 p-3 text-left hover:bg-surface-hover"
                        >
                          <Folder className="w-4 h-4 text-text-tertiary" />
                          <span className="text-sm">{list.name}</span>
                          {list.is_default && (
                            <span className="text-xs bg-primary/20 text-primary px-1.5 rounded">
                              Default
                            </span>
                          )}
                          <span className="text-xs text-text-tertiary ml-auto">
                            ({list.photo_count})
                          </span>
                        </button>

                        {/* Edit/Delete actions for non-default lists */}
                        {!list.is_default && (
                          <div className="flex items-center gap-1 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => handleStartRename(list, e)}
                              className="p-1.5 text-text-tertiary hover:text-primary hover:bg-primary/10 rounded"
                              aria-label={`Rename ${list.name}`}
                              title="Rename list"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteList(list.list_id, e)}
                              className="p-1.5 text-text-tertiary hover:text-error hover:bg-error/10 rounded"
                              aria-label={`Delete ${list.name}`}
                              title="Delete list"
                              disabled={isDeletingList}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}

                {/* Create New List */}
                {isCreatingList ? (
                  <div className="p-3 border-t border-border">
                    <input
                      type="text"
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      placeholder="List name..."
                      className="w-full px-3 py-2 text-sm bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateList();
                        if (e.key === 'Escape') {
                          setIsCreatingList(false);
                          setNewListName('');
                        }
                      }}
                    />
                    <div className="flex gap-2 mt-2">
                      <AppButton
                        size="sm"
                        variant="primary"
                        onClick={handleCreateList}
                        disabled={!newListName.trim()}
                      >
                        Create
                      </AppButton>
                      <AppButton
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setIsCreatingList(false);
                          setNewListName('');
                        }}
                      >
                        Cancel
                      </AppButton>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setIsCreatingList(true);
                      // Keep dropdown open to show create form
                    }}
                    className="w-full flex items-center gap-2 p-3 text-left text-primary hover:bg-surface-hover border-t border-border"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-sm font-medium">Create New List</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions Bar */}
        {filteredFavorites.length > 0 && (
          <div className="flex items-center gap-2 p-4 border-b border-border">
            <AppButton
              size="sm"
              variant="outline"
              onClick={handleDownloadAll}
              className="flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>Download All</span>
            </AppButton>
            <AppButton
              size="sm"
              variant="ghost"
              className="flex items-center gap-1.5"
            >
              <Share2 className="w-4 h-4" />
              <span>Share</span>
            </AppButton>
          </div>
        )}

        {/* Favorites Grid with Infinite Scroll */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-4"
        >
          {isLoading ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square bg-surface-hover rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : filteredFavorites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Heart className="w-12 h-12 text-text-tertiary mb-4" />
              <p className="text-text-secondary font-medium">No favorites yet</p>
              <p className="text-text-tertiary text-sm mt-1">
                Click the heart icon on photos to add them here
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {filteredFavorites.map((item) => (
                  <FavoriteCard
                    key={item.interaction_id}
                    item={item}
                    onClick={() => onPhotoClick?.(item.asset_id)}
                    onRemove={() => handleRemoveFavorite(item.asset_id)}
                    isRemoving={isMutating}
                  />
                ))}
              </div>

              {/* Sentinel element for infinite scroll */}
              <div
                ref={sentinelRef}
                className="h-4 w-full"
                aria-hidden="true"
              />

              {/* Loading indicator for next page */}
              {isFetchingNextPage && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  <span className="ml-2 text-sm text-text-secondary">
                    Loading more...
                  </span>
                </div>
              )}

              {/* End of list indicator */}
              {!hasNextPage && filteredFavorites.length > 0 && (
                <p className="text-center text-text-tertiary text-xs py-4">
                  All {totalFavorites} favorites loaded
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

// ============================================================================
// FavoriteCard Sub-component
// ============================================================================

interface FavoriteCardProps {
  item: FavoriteItem;
  onClick: () => void;
  onRemove: () => void;
  isRemoving: boolean;
}

const FavoriteCard: React.FC<FavoriteCardProps> = ({
  item,
  onClick,
  onRemove,
  isRemoving,
}) => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className="relative group aspect-square rounded-lg overflow-hidden bg-surface-hover cursor-pointer"
      onClick={onClick}
    >
      {/* Thumbnail */}
      {item.thumbnail_url ? (
        <img
          src={item.thumbnail_url}
          alt={item.filename}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Heart className="w-6 h-6 text-text-tertiary" />
        </div>
      )}

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />

      {/* Remove Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        disabled={isRemoving}
        className="absolute top-1 right-1 p-1.5 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error/80"
        aria-label="Remove from favorites"
      >
        <Trash2 className="w-3.5 h-3.5 text-white" />
      </button>

      {/* More Options */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className="absolute bottom-1 right-1 p-1.5 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
        aria-label="More options"
      >
        <MoreHorizontal className="w-3.5 h-3.5 text-white" />
      </button>
    </div>
  );
};

export default FavoritesPanel;
