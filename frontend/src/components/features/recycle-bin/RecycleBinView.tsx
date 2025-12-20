/**
 * RecycleBinView Component (Refactored)
 * Displays soft-deleted galleries and photos with restore/permanent delete options
 * 
 * Major optimizations:
 * - Extracted inline components to separate files
 * - Added memoization for computed values
 * - Improved performance with React.memo
 * - Centralized constants and utilities
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Search, Filter, CheckSquare, Square } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppInput } from '../../ui/AppInput';
import {
  DeleteConfirmationDialog,
  BulkDeleteConfirmationDialog,
} from '../../ui/DeleteConfirmationDialog';
import { useToast } from '../../ui/Toast';
import { recycleBinService } from '../../../services/recycleBinService';
import { RecycleBinError } from '../../../services/errors';
import { type RecycleBinItem } from '../../../types/recycleBin';
import { RecycleBinLightbox } from './RecycleBinLightbox';
import { RECYCLE_BIN_CONSTANTS } from './constants';
import { determineItemType } from './utils';

// Extracted child components
import { EmptyState } from './components/EmptyState';
import { BulkActionBar } from './components/BulkActionBar';
import { RecycleBinItemCard } from './components/RecycleBinItemCard';

/* =============================================================================
   Types
   ============================================================================= */

interface RecycleBinViewProps {
  workspaceId: string;
  retentionDays?: number;
}

type FilterType = 'all' | 'gallery' | 'photo';

/* =============================================================================
   Main RecycleBinView Component
   ============================================================================= */

export const RecycleBinView: React.FC<RecycleBinViewProps> = ({
  workspaceId,
  retentionDays = RECYCLE_BIN_CONSTANTS.DEFAULT_RETENTION_DAYS,
}) => {
  // State
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  // Action states
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Dialog states
  const [deleteDialogItem, setDeleteDialogItem] = useState<RecycleBinItem | null>(null);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  // Lightbox states
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const { addToast } = useToast();

  // Fetch items
  const fetchItems = useCallback(async (resetPage = false) => {
    try {
      setLoading(true);
      setError(null);

      const currentPage = resetPage ? 1 : page;
      const response = await recycleBinService.listItems(workspaceId, {
        type: filter === 'all' ? undefined : filter,
        page: currentPage,
        limit: RECYCLE_BIN_CONSTANTS.DEFAULT_PAGE_SIZE,
      });

      if (resetPage) {
        setItems(response.items);
        setPage(1);
      } else if (currentPage === 1) {
        setItems(response.items);
      } else {
        setItems((prev) => [...prev, ...response.items]);
      }

      setTotal(response.total);
      setHasMore(response.has_more);
    } catch (err) {
      const errorMessage = err instanceof RecycleBinError
        ? err.getUserMessage()
        : err instanceof Error
          ? err.message
          : 'Failed to load recycle bin';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, filter, page]);

  // Initial fetch and refetch on filter change
  useEffect(() => {
    fetchItems(true);
  }, [workspaceId, filter]);

  // ⚡ OPTIMIZATION: Memoize filtered items
  const filteredItems = useMemo(
    () => searchQuery
      ? items.filter((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      : items,
    [items, searchQuery]
  );

  // ⚡ OPTIMIZATION: Memoize selected items
  const selectedItems = useMemo(
    () => filteredItems.filter(item => selectedIds.has(item.id)),
    [filteredItems, selectedIds]
  );

  // ⚡ OPTIMIZATION: Memoize item type determination
  const selectedItemType = useMemo(
    () => determineItemType(selectedItems),
    [selectedItems]
  );

  // ⚡ OPTIMIZATION: Memoize photo items for lightbox
  const photoItems = useMemo(
    () => filteredItems.filter(item => item.type === 'photo' && item.thumbnailUrl),
    [filteredItems]
  );

  // Selection handlers
  const handleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((item) => item.id)));
    }
  }, [filteredItems, selectedIds.size]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Restore handler
  const handleRestore = useCallback(
    async (item: RecycleBinItem) => {
      setRestoringIds((prev) => new Set(prev).add(item.id));

      try {
        const response = await recycleBinService.restoreItem(
          workspaceId,
          item.id,
          item.type
        );

        addToast({
          variant: 'success',
          message: response.new_name
            ? `Restored as "${response.new_name}" (name conflict resolved)`
            : `${item.type === 'gallery' ? 'Gallery' : 'Photo'} restored successfully`,
        });

        // Remove from list
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        setTotal((prev) => prev - 1);
      } catch (err) {
        const errorMessage = err instanceof RecycleBinError
          ? err.getUserMessage()
          : err instanceof Error
            ? err.message
            : 'Failed to restore item';
        addToast({
          variant: 'error',
          message: errorMessage,
        });
      } finally {
        setRestoringIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    },
    [workspaceId, addToast]
  );

  // Permanent delete handler
  const handlePermanentDelete = useCallback(
    async (item: RecycleBinItem) => {
      // Close dialog first for immediate feedback
      setDeleteDialogItem(null);

      // Optimistic removal - remove from UI immediately
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      setTotal((prev) => prev - 1);

      setDeletingIds((prev) => new Set(prev).add(item.id));

      try {
        await recycleBinService.permanentDeleteItem(
          workspaceId,
          item.id,
          item.type
        );

        addToast({
          variant: 'success',
          message: `${item.type === 'gallery' ? 'Gallery' : 'Photo'} permanently deleted`,
        });
      } catch (err) {
        // Restore item on error (optimistic rollback)
        setItems((prev) => [...prev, item].sort((a, b) =>
          new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
        ));
        setTotal((prev) => prev + 1);

        const errorMessage = err instanceof RecycleBinError
          ? err.getUserMessage()
          : err instanceof Error
            ? err.message
            : 'Failed to delete item';
        addToast({
          variant: 'error',
          message: errorMessage,
        });
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    },
    [workspaceId, addToast]
  );

  // Bulk restore handler
  const handleBulkRestore = useCallback(async () => {
    if (selectedItems.length === 0) return;

    const ids = selectedItems.map((item) => item.id);
    ids.forEach((id) => {
      setRestoringIds((prev) => new Set(prev).add(id));
    });

    try {
      const response = await recycleBinService.bulkRestore(
        workspaceId,
        selectedItems.map((item) => ({ id: item.id, type: item.type }))
      );

      if (response.success_count > 0) {
        addToast({
          variant: 'success',
          message: `Restored ${response.success_count} item${response.success_count !== 1 ? 's' : ''}`,
        });
      }

      if (response.failure_count > 0) {
        addToast({
          variant: 'warning',
          message: `Failed to restore ${response.failure_count} item${response.failure_count !== 1 ? 's' : ''}`,
        });
      }

      // Refetch to update list
      fetchItems(true);
      setSelectedIds(new Set());
    } catch (err) {
      const errorMessage = err instanceof RecycleBinError
        ? err.getUserMessage()
        : err instanceof Error
          ? err.message
          : 'Failed to restore items';
      addToast({
        variant: 'error',
        message: errorMessage,
      });
    } finally {
      setRestoringIds(new Set());
    }
  }, [workspaceId, selectedItems, fetchItems, addToast]);

  // Bulk permanent delete handler
  const handleBulkPermanentDelete = useCallback(async () => {
    if (selectedItems.length === 0) return;

    // Close dialog immediately
    setShowBulkDeleteDialog(false);

    // Store items for potential rollback
    const itemsToDelete = [...selectedItems];
    const idsToDelete = new Set(selectedItems.map((item) => item.id));

    // Optimistic removal - remove from UI immediately
    setItems((prev) => prev.filter((i) => !idsToDelete.has(i.id)));
    setTotal((prev) => prev - selectedItems.length);
    setSelectedIds(new Set());

    const ids = selectedItems.map((item) => item.id);
    ids.forEach((id) => {
      setDeletingIds((prev) => new Set(prev).add(id));
    });

    try {
      const response = await recycleBinService.bulkPermanentDelete(
        workspaceId,
        selectedItems.map((item) => ({ id: item.id, type: item.type }))
      );

      if (response.success_count > 0) {
        addToast({
          variant: 'success',
          message: `Permanently deleted ${response.success_count} item${response.success_count !== 1 ? 's' : ''}`,
        });
      }

      if (response.failure_count > 0) {
        // Some items failed - refetch to get correct state
        addToast({
          variant: 'warning',
          message: `Failed to delete ${response.failure_count} item${response.failure_count !== 1 ? 's' : ''}. They will reappear if deletion failed.`,
        });
        // Refetch to show failed items
        fetchItems(true);
      }
    } catch (err) {
      // Restore all items on error (optimistic rollback)
      setItems((prev) => [...prev, ...itemsToDelete].sort((a, b) =>
        new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
      ));
      setTotal((prev) => prev + itemsToDelete.length);

      const errorMessage = err instanceof RecycleBinError
        ? err.getUserMessage()
        : err instanceof Error
          ? err.message
          : 'Failed to delete items';
      addToast({
        variant: 'error',
        message: errorMessage,
      });
    } finally {
      setDeletingIds(new Set());
    }
  }, [workspaceId, selectedItems, fetchItems, addToast]);

  // Load more handler
  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      setPage((prev) => prev + 1);
      fetchItems(false);
    }
  }, [loading, hasMore, fetchItems]);

  // Handle image click to open lightbox
  const handleImageClick = useCallback((item: RecycleBinItem) => {
    const index = photoItems.findIndex(p => p.id === item.id);
    if (index !== -1) {
      setLightboxIndex(index);
      setLightboxOpen(true);
    }
  }, [photoItems]);

  // Handle lightbox navigation
  const handleLightboxNavigate = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  // Handle restore from lightbox
  const handleLightboxRestore = useCallback(async (item: RecycleBinItem) => {
    await handleRestore(item);
    // Close lightbox after successful restore if there are no more items
    if (photoItems.length <= 1) {
      setLightboxOpen(false);
    } else {
      // Navigate to next item if possible, otherwise previous
      if (lightboxIndex >= photoItems.length - 1) {
        setLightboxIndex(Math.max(0, lightboxIndex - 1));
      }
    }
  }, [handleRestore, photoItems.length, lightboxIndex]);

  // Handle permanent delete from lightbox
  const handleLightboxPermanentDelete = useCallback((item: RecycleBinItem) => {
    setLightboxOpen(false);
    setDeleteDialogItem(item);
  }, []);

  return (
    <div className="space-y-6">
      {/* Item count summary */}
      <div className="card-glass rounded-xl px-4 py-3">
        <p className="text-sm text-text-secondary">
          {loading ? 'Loading...' : (
            <>
              {total} item{total !== 1 ? 's' : ''} · Items are permanently deleted after {retentionDays} days
            </>
          )}
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="flex-1 min-w-[200px] max-w-md">
          <AppInput
            placeholder="Search deleted items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search size={16} />}
          />
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-text-tertiary" />
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['all', 'gallery', 'photo'] as FilterType[]).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`
                  px-3 py-1.5 text-sm font-medium
                  transition-colors
                  ${filter === type
                    ? 'bg-primary text-white'
                    : 'bg-surface text-text-secondary hover:bg-surface-hover'
                  }
                `}
              >
                {type === 'all' ? 'All' : type === 'gallery' ? 'Galleries' : 'Photos'}
              </button>
            ))}
          </div>
        </div>

        {/* Select all button */}
        {filteredItems.length > 0 && (
          <AppButton
            variant="ghost"
            size="sm"
            onClick={handleSelectAll}
            leftIcon={
              selectedIds.size === filteredItems.length ? (
                <CheckSquare size={16} />
              ) : (
                <Square size={16} />
              )
            }
          >
            {selectedIds.size === filteredItems.length ? 'Deselect all' : 'Select all'}
          </AppButton>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-lg bg-error/10 border border-error/20 text-error">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && items.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[4/3] bg-background-alt rounded-card animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredItems.length === 0 && <EmptyState filter={filter} />}

      {/* Items grid */}
      {filteredItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems.map((item) => (
            <RecycleBinItemCard
              key={item.id}
              item={item}
              isSelected={selectedIds.has(item.id)}
              onSelect={handleSelect}
              onRestore={handleRestore}
              onPermanentDelete={(item) => setDeleteDialogItem(item)}
              onImageClick={handleImageClick}
              isRestoring={restoringIds.has(item.id)}
              isDeleting={deletingIds.has(item.id)}
            />
          ))}
        </div>
      )}

      {/* Load more button */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <AppButton
            variant="secondary"
            onClick={handleLoadMore}
            isLoading={loading}
          >
            Load More
          </AppButton>
        </div>
      )}

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        onRestore={handleBulkRestore}
        onPermanentDelete={() => setShowBulkDeleteDialog(true)}
        onClearSelection={handleClearSelection}
        isRestoring={restoringIds.size > 0}
        isDeleting={deletingIds.size > 0}
      />

      {/* Single item delete dialog */}
      {deleteDialogItem && (
        <DeleteConfirmationDialog
          isOpen={!!deleteDialogItem}
          onClose={() => setDeleteDialogItem(null)}
          onConfirm={() => handlePermanentDelete(deleteDialogItem)}
          deleteType="permanent"
          entityType={deleteDialogItem.type}
          entityName={deleteDialogItem.name}
          photoCount={deleteDialogItem.photoCount}
          isLoading={deletingIds.has(deleteDialogItem.id)}
        />
      )}

      {/* Bulk delete dialog */}
      <BulkDeleteConfirmationDialog
        isOpen={showBulkDeleteDialog}
        onClose={() => setShowBulkDeleteDialog(false)}
        onConfirm={handleBulkPermanentDelete}
        deleteType="permanent"
        itemCount={selectedIds.size}
        itemType={selectedItemType}
        isLoading={deletingIds.size > 0}
      />

      {/* Lightbox for viewing photos */}
      {photoItems.length > 0 && (
        <RecycleBinLightbox
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          currentItem={photoItems[lightboxIndex] || null}
          items={photoItems}
          currentIndex={lightboxIndex}
          onNavigate={handleLightboxNavigate}
          onRestore={handleLightboxRestore}
          onPermanentDelete={handleLightboxPermanentDelete}
          isRestoring={restoringIds.has(photoItems[lightboxIndex]?.id || '')}
          isDeleting={deletingIds.has(photoItems[lightboxIndex]?.id || '')}
        />
      )}
    </div>
  );
};

export default RecycleBinView;
