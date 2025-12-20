import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  Image,
  FolderOpen,
  Clock,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import { staggerContainer, staggerItem } from '../../components/landing/animations/presets';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { AppButton } from '../../components/ui/AppButton';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  recycleBinService,
  type RecycleBinItem,
  type RecycleBinListResponse,
} from '../../services/recycleBinService';
import { signedUrlService } from '../../services/signedUrlService';

/* =============================================================================
   TrashPage Component

   Displays soft-deleted galleries and photos that can be restored
   or permanently deleted. Items auto-delete after 30 days.
   ============================================================================= */

type FilterType = 'all' | 'gallery' | 'photo';

const TrashPage: React.FC = () => {
  const { workspace } = useAuth();
  const { showToast } = useToast();

  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Dialog states
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [processingItem, setProcessingItem] = useState<RecycleBinItem | null>(null);
  const [isBulkOperation, setIsBulkOperation] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!workspace?.workspace_id) return;

    setLoading(true);
    setError(null);

    try {
      const response: RecycleBinListResponse = await recycleBinService.listItems(
        workspace.workspace_id,
        {
          page,
          limit: 20,
          type: filterType,
        }
      );
      setItems(response.items);
      setTotalPages(response.total_pages);
      setTotal(response.total);

      // Fetch thumbnails for photo items
      const photoItems = response.items.filter(
        (item) => item.type === 'photo' && item.asset_id
      );
      if (photoItems.length > 0) {
        const urls: Record<string, string> = {};
        await Promise.all(
          photoItems.map(async (item) => {
            if (item.asset_id) {
              try {
                const url = await signedUrlService.getSignedUrl(
                  workspace.workspace_id,
                  item.asset_id,
                  'thumbnail'
                );
                urls[item.id] = url;
              } catch {
                // Ignore thumbnail fetch errors
              }
            }
          })
        );
        setThumbnailUrls(urls);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recycle bin');
    } finally {
      setLoading(false);
    }
  }, [workspace?.workspace_id, page, filterType]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSelectItem = (itemId: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map((item) => item.id)));
    }
  };

  const handleRestore = async (item: RecycleBinItem) => {
    if (!workspace?.workspace_id) return;

    try {
      await recycleBinService.restoreItem(
        workspace.workspace_id,
        item.id,
        item.type
      );

      showToast({
        title: 'Restored',
        message: `${item.type === 'gallery' ? 'Gallery' : 'Photo'} "${item.name}" has been restored`,
        type: 'success',
      });

      // Refresh the list
      fetchItems();
      setSelectedItems(new Set());
    } catch (err) {
      showToast({
        title: 'Restore failed',
        message: err instanceof Error ? err.message : 'Failed to restore item',
        type: 'error',
      });
    } finally {
      setProcessingItem(null);
      setRestoreDialogOpen(false);
    }
  };

  const handlePermanentDelete = async (item: RecycleBinItem) => {
    if (!workspace?.workspace_id) return;

    try {
      await recycleBinService.permanentDelete(
        workspace.workspace_id,
        item.id,
        item.type
      );

      showToast({
        title: 'Permanently deleted',
        message: `${item.type === 'gallery' ? 'Gallery' : 'Photo'} "${item.name}" has been permanently deleted`,
        type: 'success',
      });

      // Refresh the list
      fetchItems();
      setSelectedItems(new Set());
    } catch (err) {
      showToast({
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Failed to delete item',
        type: 'error',
      });
    } finally {
      setProcessingItem(null);
      setDeleteDialogOpen(false);
    }
  };

  const handleBulkRestore = async () => {
    if (!workspace?.workspace_id || selectedItems.size === 0) return;

    const itemsToRestore = items
      .filter((item) => selectedItems.has(item.id))
      .map((item) => ({ item_id: item.id, item_type: item.type }));

    try {
      const result = await recycleBinService.bulkRestore(
        workspace.workspace_id,
        itemsToRestore
      );

      showToast({
        title: 'Restore complete',
        message: `Restored ${result.success_count} item(s)${result.failure_count > 0 ? `, ${result.failure_count} failed` : ''}`,
        type: result.failure_count === 0 ? 'success' : 'warning',
      });

      fetchItems();
      setSelectedItems(new Set());
    } catch (err) {
      showToast({
        title: 'Restore failed',
        message: err instanceof Error ? err.message : 'Failed to restore items',
        type: 'error',
      });
    } finally {
      setIsBulkOperation(false);
      setRestoreDialogOpen(false);
    }
  };

  const handleBulkPermanentDelete = async () => {
    if (!workspace?.workspace_id || selectedItems.size === 0) return;

    const itemsToDelete = items
      .filter((item) => selectedItems.has(item.id))
      .map((item) => ({ item_id: item.id, item_type: item.type }));

    try {
      const result = await recycleBinService.bulkPermanentDelete(
        workspace.workspace_id,
        itemsToDelete
      );

      showToast({
        title: 'Delete complete',
        message: `Permanently deleted ${result.success_count} item(s)${result.failure_count > 0 ? `, ${result.failure_count} failed` : ''}`,
        type: result.failure_count === 0 ? 'success' : 'warning',
      });

      fetchItems();
      setSelectedItems(new Set());
    } catch (err) {
      showToast({
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Failed to delete items',
        type: 'error',
      });
    } finally {
      setIsBulkOperation(false);
      setDeleteDialogOpen(false);
    }
  };

  const formatDeletedAt = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getItemPath = (item: RecycleBinItem) => {
    if (item.type === 'gallery') return null;
    const parts = [];
    if (item.gallery_title) parts.push(item.gallery_title);
    if (item.sub_gallery_name) parts.push(item.sub_gallery_name);
    return parts.join(' / ');
  };

  if (!workspace?.workspace_id) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-text-secondary">Please select a workspace</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Page Header */}
      <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-text-primary flex items-center gap-2">
                <Trash2 className="w-6 h-6 text-text-secondary" />
                Recycle Bin
              </h1>
              <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                Items are permanently deleted after 30 days
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Filter Bar */}
        <div className="card-glass rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">Filter:</span>
            <div className="flex rounded-lg overflow-hidden border border-border">
              {(['all', 'gallery', 'photo'] as FilterType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setFilterType(type);
                    setPage(1);
                    setSelectedItems(new Set());
                  }}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    filterType === type
                      ? 'bg-primary text-white'
                      : 'bg-surface hover:bg-surface-hover text-text-primary'
                  }`}
                >
                  {type === 'all' ? 'All' : type === 'gallery' ? 'Galleries' : 'Photos'}
                </button>
              ))}
            </div>
            <span className="text-sm text-text-tertiary ml-4">
              {total} item{total !== 1 ? 's' : ''} in trash
            </span>
          </div>

          {/* Bulk Actions */}
          {selectedItems.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-secondary">
                {selectedItems.size} selected
              </span>
              <AppButton
                variant="outline"
                size="sm"
                leftIcon={<RotateCcw size={16} />}
                onClick={() => {
                  setIsBulkOperation(true);
                  setRestoreDialogOpen(true);
                }}
              >
                Restore
              </AppButton>
              <AppButton
                variant="destructive"
                size="sm"
                leftIcon={<Trash2 size={16} />}
                onClick={() => {
                  setIsBulkOperation(true);
                  setDeleteDialogOpen(true);
                }}
              >
                Delete Forever
              </AppButton>
            </div>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="card-glass rounded-xl p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-error mx-auto mb-4" />
            <p className="text-text-primary font-medium mb-2">Failed to load recycle bin</p>
            <p className="text-text-secondary text-sm mb-4">{error}</p>
            <AppButton variant="outline" onClick={fetchItems}>
              Try Again
            </AppButton>
          </div>
        ) : items.length === 0 ? (
          <div className="card-glass rounded-xl p-12 text-center">
            <Trash2 className="w-16 h-16 text-text-tertiary mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-text-primary mb-2">
              Recycle bin is empty
            </h3>
            <p className="text-text-secondary">
              Deleted galleries and photos will appear here
            </p>
          </div>
        ) : (
          <>
            {/* Select All */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedItems.size === items.length}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm text-text-secondary">Select all</span>
            </div>

            {/* Items List */}
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="space-y-3"
            >
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  variants={staggerItem}
                  className={`card-glass rounded-xl p-4 flex items-center gap-4 transition-all ${
                    selectedItems.has(item.id) ? 'ring-2 ring-primary' : ''
                  }`}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={() => handleSelectItem(item.id)}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary flex-shrink-0"
                  />

                  {/* Thumbnail/Icon */}
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-surface-hover flex-shrink-0">
                    {item.type === 'photo' && thumbnailUrls[item.id] ? (
                      <img
                        src={thumbnailUrls[item.id]}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : item.type === 'photo' ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <Image className="w-8 h-8 text-text-tertiary" />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600">
                        <FolderOpen className="w-8 h-8 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          item.type === 'gallery'
                            ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}
                      >
                        {item.type === 'gallery' ? 'Gallery' : 'Photo'}
                      </span>
                    </div>
                    <h3 className="font-medium text-text-primary truncate mt-1">
                      {item.name}
                    </h3>
                    {getItemPath(item) && (
                      <p className="text-sm text-text-tertiary truncate">
                        From: {getItemPath(item)}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-text-tertiary mt-1">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        Deleted {formatDeletedAt(item.deleted_at)}
                      </span>
                      <span
                        className={`${
                          item.days_until_permanent_delete <= 7
                            ? 'text-error font-medium'
                            : ''
                        }`}
                      >
                        {item.days_until_permanent_delete} day
                        {item.days_until_permanent_delete !== 1 ? 's' : ''} left
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <AppButton
                      variant="outline"
                      size="sm"
                      leftIcon={<RotateCcw size={16} />}
                      onClick={() => {
                        setProcessingItem(item);
                        setIsBulkOperation(false);
                        setRestoreDialogOpen(true);
                      }}
                    >
                      Restore
                    </AppButton>
                    <AppButton
                      variant="ghost"
                      size="sm"
                      leftIcon={<Trash2 size={16} />}
                      className="text-error hover:text-error hover:bg-error/10"
                      onClick={() => {
                        setProcessingItem(item);
                        setIsBulkOperation(false);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      Delete
                    </AppButton>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <AppButton
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </AppButton>
                <span className="text-sm text-text-secondary px-4">
                  Page {page} of {totalPages}
                </span>
                <AppButton
                  variant="outline"
                  size="sm"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </AppButton>
              </div>
            )}
          </>
        )}
      </main>

      {/* Restore Confirmation Dialog */}
      <ConfirmDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        title={
          isBulkOperation
            ? `Restore ${selectedItems.size} items?`
            : `Restore "${processingItem?.name}"?`
        }
        description={
          isBulkOperation
            ? 'The selected items will be restored to their original locations.'
            : `This ${processingItem?.type === 'gallery' ? 'gallery' : 'photo'} will be restored to ${
                processingItem?.type === 'gallery'
                  ? 'your galleries'
                  : getItemPath(processingItem!) || 'its original gallery'
              }.`
        }
        confirmText="Restore"
        confirmVariant="primary"
        onConfirm={isBulkOperation ? handleBulkRestore : () => processingItem && handleRestore(processingItem)}
      />

      {/* Permanent Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={
          isBulkOperation
            ? `Permanently delete ${selectedItems.size} items?`
            : `Permanently delete "${processingItem?.name}"?`
        }
        description="This action cannot be undone. The files will be permanently removed from storage."
        confirmText="Delete Forever"
        confirmVariant="destructive"
        onConfirm={
          isBulkOperation
            ? handleBulkPermanentDelete
            : () => processingItem && handlePermanentDelete(processingItem)
        }
      />
    </div>
  );
};

export default TrashPage;
