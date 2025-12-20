/**
 * RecycleBinView Component
 * Displays soft-deleted galleries and photos with restore/permanent delete options
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Trash2,
  RotateCcw,
  Clock,
  Image,
  FolderOpen,
  AlertTriangle,
  Search,
  Filter,
  CheckSquare,
  Square,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppCard } from '../../ui/AppCard';
import { AppInput } from '../../ui/AppInput';
import {
  DeleteConfirmationDialog,
  BulkDeleteConfirmationDialog,
} from '../../ui/DeleteConfirmationDialog';
import { useToast } from '../../ui/Toast';
import {
  recycleBinService,
} from '../../../services/recycleBinService';
import { type RecycleBinItem } from '../../../types/recycleBin';
import { RecycleBinLightbox } from './RecycleBinLightbox';

/* =============================================================================
   Types
   ============================================================================= */

interface RecycleBinViewProps {
  workspaceId: string;
  retentionDays?: number;
}

type FilterType = 'all' | 'gallery' | 'photo';

/* =============================================================================
   Bulk Action Bar Component
   ============================================================================= */

interface BulkActionBarProps {
  selectedCount: number;
  onRestore: () => void;
  onPermanentDelete: () => void;
  onClearSelection: () => void;
  isRestoring: boolean;
  isDeleting: boolean;
}

const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  onRestore,
  onPermanentDelete,
  onClearSelection,
  isRestoring,
  isDeleting,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div
      className="
        fixed bottom-6 left-1/2 -translate-x-1/2
        flex items-center gap-4
        px-6 py-3
        bg-surface/95 backdrop-blur-md
        border border-border
        rounded-full shadow-lg
        animate-slide-in-bottom
        z-50
      "
      role="toolbar"
      aria-label="Bulk actions"
    >
      <span className="text-sm font-medium text-text-primary">
        {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
      </span>

      <div className="h-6 w-px bg-border" />

      <AppButton
        variant="secondary"
        size="sm"
        leftIcon={<RotateCcw size={16} />}
        onClick={onRestore}
        isLoading={isRestoring}
        disabled={isDeleting}
      >
        Restore
      </AppButton>

      <AppButton
        variant="destructive"
        size="sm"
        leftIcon={<Trash2 size={16} />}
        onClick={onPermanentDelete}
        isLoading={isDeleting}
        disabled={isRestoring}
        className="bg-red-600 hover:bg-red-700 text-white border-red-600"
      >
        Delete Forever
      </AppButton>

      <div className="h-6 w-px bg-border" />

      <AppButton
        variant="ghost"
        size="sm"
        onClick={onClearSelection}
        disabled={isRestoring || isDeleting}
      >
        Clear
      </AppButton>
    </div>
  );
};

/* =============================================================================
   Recycle Bin Item Component
   ============================================================================= */

interface RecycleBinItemCardProps {
  item: RecycleBinItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onRestore: (item: RecycleBinItem) => void;
  onPermanentDelete: (item: RecycleBinItem) => void;
  onImageClick?: (item: RecycleBinItem) => void;
  isRestoring: boolean;
  isDeleting: boolean;
}

const RecycleBinItemCard: React.FC<RecycleBinItemCardProps> = ({
  item,
  isSelected,
  onSelect,
  onRestore,
  onPermanentDelete,
  onImageClick,
  isRestoring,
  isDeleting,
}) => {
  const getDaysLabel = () => {
    if (item.daysUntilPermanentDelete <= 0) {
      return 'Pending deletion';
    }
    if (item.daysUntilPermanentDelete === 1) {
      return '1 day left';
    }
    return `${item.daysUntilPermanentDelete} days left`;
  };

  const getWarningLevel = () => {
    if (item.deleteStatus === 'delete_failed') return 'failed';
    if (item.daysUntilPermanentDelete <= 3) return 'critical';
    if (item.daysUntilPermanentDelete <= 7) return 'warning';
    return 'normal';
  };

  const warningLevel = getWarningLevel();
  const hasFailed = item.deleteStatus === 'delete_failed';

  return (
    <AppCard
      className={`
        relative overflow-hidden transition-all
        ${isSelected ? 'ring-2 ring-primary' : ''}
        ${hasFailed ? 'ring-2 ring-error/50 bg-error/5' : ''}
      `}
      hoverable
    >
      {/* Selection checkbox */}
      <button
        onClick={() => onSelect(item.id)}
        className="
          absolute top-3 left-3 z-10
          p-1 rounded
          bg-surface/80 backdrop-blur-sm
          hover:bg-surface
          transition-colors
        "
        aria-label={isSelected ? 'Deselect item' : 'Select item'}
      >
        {isSelected ? (
          <CheckSquare size={20} className="text-primary" />
        ) : (
          <Square size={20} className="text-text-tertiary" />
        )}
      </button>

      {/* Thumbnail / Icon - clickable for photos */}
      <div
        className={`
          aspect-[4/3] bg-background-alt
          flex items-center justify-center
          border-b border-border
          ${item.type === 'photo' && item.thumbnailUrl ? 'cursor-pointer hover:opacity-70 transition-opacity' : ''}
        `}
        onClick={() => {
          if (item.type === 'photo' && item.thumbnailUrl && onImageClick) {
            onImageClick(item);
          }
        }}
        role={item.type === 'photo' && item.thumbnailUrl ? 'button' : undefined}
        tabIndex={item.type === 'photo' && item.thumbnailUrl ? 0 : undefined}
        aria-label={item.type === 'photo' && item.thumbnailUrl ? `View ${item.name}` : undefined}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && item.type === 'photo' && item.thumbnailUrl && onImageClick) {
            e.preventDefault();
            onImageClick(item);
          }
        }}
      >
        {item.thumbnailUrl ? (
          <img
            src={
              item.thumbnailUrl.startsWith('http')
                ? item.thumbnailUrl
                : `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${item.thumbnailUrl}`
            }
            alt={item.name}
            className="w-full h-full object-cover opacity-50"
          />
        ) : item.type === 'gallery' ? (
          <FolderOpen size={48} className="text-text-tertiary" />
        ) : (
          <Image size={48} className="text-text-tertiary" />
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-medium text-text-primary truncate" title={item.name}>
            {item.name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-text-tertiary capitalize">
              {item.type}
            </span>
            {item.type === 'gallery' && item.photoCount !== undefined && (
              <>
                <span className="text-text-tertiary">·</span>
                <span className="text-xs text-text-tertiary">
                  {item.photoCount} photo{item.photoCount !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Status indicator */}
        <div
          className={`
            flex items-center gap-1.5 text-xs
            ${warningLevel === 'failed'
              ? 'text-error font-medium'
              : warningLevel === 'critical'
                ? 'text-error'
                : warningLevel === 'warning'
                  ? 'text-warning'
                  : 'text-text-tertiary'
            }
          `}
        >
          {warningLevel === 'failed' ? (
            <>
              <AlertTriangle size={14} />
              <span>Deletion failed - tap to retry</span>
            </>
          ) : warningLevel === 'critical' ? (
            <>
              <AlertTriangle size={14} />
              <span>{getDaysLabel()}</span>
            </>
          ) : (
            <>
              <Clock size={14} />
              <span>{getDaysLabel()}</span>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <AppButton
            variant="secondary"
            size="sm"
            fullWidth
            leftIcon={<RotateCcw size={14} />}
            onClick={() => onRestore(item)}
            isLoading={isRestoring}
            disabled={isDeleting}
          >
            Restore
          </AppButton>
          <AppButton
            variant="destructive"
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white border-red-600 px-3"
            onClick={() => onPermanentDelete(item)}
            isLoading={isDeleting}
            disabled={isRestoring}
            aria-label={hasFailed ? "Retry delete" : "Delete forever"}
          >
            <Trash2 size={14} />
          </AppButton>
        </div>
      </div>
    </AppCard>
  );
};

/* =============================================================================
   Empty State Component
   ============================================================================= */

const EmptyState: React.FC<{ filter: FilterType }> = ({ filter }) => {
  const getMessage = () => {
    switch (filter) {
      case 'gallery':
        return 'No deleted galleries';
      case 'photo':
        return 'No deleted photos';
      default:
        return 'Recycle bin is empty';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-background-alt flex items-center justify-center mb-4">
        <Trash2 size={32} className="text-text-tertiary" />
      </div>
      <h3 className="text-lg font-medium text-text-primary mb-2">
        {getMessage()}
      </h3>
      <p className="text-sm text-text-secondary max-w-sm">
        Deleted items will appear here for {30} days before being permanently removed.
      </p>
    </div>
  );
};

/* =============================================================================
   Main RecycleBinView Component
   ============================================================================= */

export const RecycleBinView: React.FC<RecycleBinViewProps> = ({
  workspaceId,
  retentionDays = 30,
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
        limit: 20,
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
      setError(err instanceof Error ? err.message : 'Failed to load recycle bin');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, filter, page]);

  // Initial fetch and refetch on filter change
  useEffect(() => {
    fetchItems(true);
  }, [workspaceId, filter]);

  // Filter items by search query
  const filteredItems = searchQuery
    ? items.filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : items;

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
        addToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Failed to restore item',
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

        addToast({
          variant: 'error',
          message: err instanceof Error ? err.message : 'Failed to delete item',
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
    const selectedItems = filteredItems.filter((item) =>
      selectedIds.has(item.id)
    );

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
      addToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Failed to restore items',
      });
    } finally {
      setRestoringIds(new Set());
    }
  }, [workspaceId, filteredItems, selectedIds, fetchItems, addToast]);

  // Bulk permanent delete handler
  const handleBulkPermanentDelete = useCallback(async () => {
    const selectedItems = filteredItems.filter((item) =>
      selectedIds.has(item.id)
    );

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

      addToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Failed to delete items',
      });
    } finally {
      setDeletingIds(new Set());
    }
  }, [workspaceId, filteredItems, selectedIds, fetchItems, addToast]);

  // Load more handler
  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      setPage((prev) => prev + 1);
      fetchItems(false);
    }
  }, [loading, hasMore, fetchItems]);

  // Get photo items only (for lightbox navigation)
  const photoItems = useMemo(() =>
    filteredItems.filter(item => item.type === 'photo' && item.thumbnailUrl),
    [filteredItems]
  );

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
        itemType={
          filteredItems
            .filter((item) => selectedIds.has(item.id))
            .every((item) => item.type === 'gallery')
            ? 'galleries'
            : filteredItems
              .filter((item) => selectedIds.has(item.id))
              .every((item) => item.type === 'photo')
              ? 'photos'
              : 'mixed'
        }
        isLoading={deletingIds.size > 0}
      />

      {/* Lightbox for viewing photos */}
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
    </div>
  );
};

export default RecycleBinView;
