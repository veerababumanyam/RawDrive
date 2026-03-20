/**
 * BulkActionBar Component
 * Displays bulk actions when photos are selected
 * Sticky at bottom of screen with slide-up animation
 * Property 24: Bulk Actions Bar
 */

import React, { useState } from 'react';
import { Move, Trash2, Download, X, FolderOpen, Tag, Edit3 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import { AppCard } from '../../ui/AppCard';
import { ConfirmDialog } from '../../ui/Modal';
import type { GalleryAssetItem } from '../../../types/gallery';

export interface BulkActionBarProps {
  /** Selected asset IDs */
  selectedAssetIds: Set<string>;
  /** All assets (for getting details) */
  assets: GalleryAssetItem[];
  /** Sub-galleries for move selector */
  subGalleries?: Array<{ sub_gallery_id: string; name: string }>;
  /** Callback when selection is cleared */
  onClearSelection: () => void;
  /** Callback for bulk move */
  onBulkMove?: (assetIds: string[], subGalleryId: string | null) => void;
  /** Callback for bulk delete */
  onBulkDelete?: (assetIds: string[]) => void;
  /** Callback for bulk download */
  onBulkDownload?: (assetIds: string[]) => void;
  /** Callback for bulk tag */
  onBulkTag?: (assetIds: string[]) => void;
  /** Callback for bulk edit */
  onBulkEdit?: (assetIds: string[]) => void;
  /** Whether actions are loading */
  isLoading?: boolean;
  className?: string;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedAssetIds,
  subGalleries = [],
  onClearSelection,
  onBulkMove,
  onBulkDelete,
  onBulkDownload,
  onBulkTag,
  onBulkEdit,
  isLoading = false,
  className = '',
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [selectedSubGalleryId, setSelectedSubGalleryId] = useState<string | null>(null);

  const selectedCount = selectedAssetIds.size;

  if (selectedCount === 0) return null;

  const handleBulkDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmBulkDelete = () => {
    if (onBulkDelete) {
      onBulkDelete(Array.from(selectedAssetIds));
    }
    setShowDeleteConfirm(false);
    onClearSelection();
  };

  const handleBulkMove = () => {
    setShowMoveDialog(true);
  };

  const handleBulkDownload = () => {
    if (onBulkDownload) {
      onBulkDownload(Array.from(selectedAssetIds));
    }
  };

  return (
    <>
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`
              fixed bottom-0 left-0 right-0 z-40
              ${className}
            `}
          >
            <AppCard
              padding="md"
              className="
                mx-4 mb-4
                bg-surface border-2 border-primary
                shadow-2xl rounded-xl
              "
            >
              <div className="flex items-center justify-between gap-4">
                {/* Selection Info */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-primary font-semibold text-sm">{selectedCount}</span>
                    </div>
                    <span className="text-sm font-medium text-text-primary">
                      {selectedCount === 1 ? 'photo' : 'photos'} selected
                    </span>
                  </div>
                  <AppButton
                    variant="ghost"
                    size="sm"
                    onClick={onClearSelection}
                    className="text-text-tertiary hover:text-text-primary"
                  >
                    <X size={16} className="mr-1" />
                    Clear
                  </AppButton>
                </div>

                {/* Bulk Actions */}
                <div className="flex items-center gap-2">
                  {onBulkEdit && (
                    <AppButton
                      variant="outline"
                      size="sm"
                      leftIcon={<Edit3 size={16} />}
                      onClick={() => onBulkEdit(Array.from(selectedAssetIds))}
                      disabled={isLoading}
                    >
                      Edit
                    </AppButton>
                  )}
                  {onBulkTag && (
                    <AppButton
                      variant="outline"
                      size="sm"
                      leftIcon={<Tag size={16} />}
                      onClick={() => onBulkTag(Array.from(selectedAssetIds))}
                      disabled={isLoading}
                    >
                      Tag
                    </AppButton>
                  )}
                  {onBulkMove && (
                    <AppButton
                      variant="outline"
                      size="sm"
                      leftIcon={<Move size={16} />}
                      onClick={handleBulkMove}
                      disabled={isLoading}
                    >
                      Move
                    </AppButton>
                  )}
                  {onBulkDownload && (
                    <AppButton
                      variant="outline"
                      size="sm"
                      leftIcon={<Download size={16} />}
                      onClick={handleBulkDownload}
                      disabled={isLoading}
                    >
                      Download
                    </AppButton>
                  )}
                  {onBulkDelete && (
                    <AppButton
                      variant="destructive"
                      size="sm"
                      leftIcon={<Trash2 size={16} />}
                      onClick={handleBulkDelete}
                      disabled={isLoading}
                    >
                      Delete
                    </AppButton>
                  )}
                </div>
              </div>
            </AppCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmBulkDelete}
        title="Delete Photos?"
        message={`Are you sure you want to delete ${selectedCount} ${selectedCount === 1 ? 'photo' : 'photos'}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        isLoading={isLoading}
      />

      {/* Move Dialog */}
      {showMoveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowMoveDialog(false)}>
          <AppCard padding="lg" className="max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-text-primary">Move Photos</h3>
              <p className="text-sm text-text-secondary">
                Select a sub-gallery to move {selectedCount} {selectedCount === 1 ? 'photo' : 'photos'} to.
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {/* Root Gallery Option */}
                <AppButton
                  variant={selectedSubGalleryId === null ? 'primary' : 'outline'}
                  onClick={() => setSelectedSubGalleryId(null)}
                  className="w-full justify-start"
                  leftIcon={<FolderOpen size={20} />}
                >
                  Root Gallery
                </AppButton>
                {/* Sub-Gallery Options */}
                {subGalleries.map((subGallery) => (
                  <AppButton
                    key={subGallery.sub_gallery_id}
                    variant={selectedSubGalleryId === subGallery.sub_gallery_id ? 'primary' : 'outline'}
                    onClick={() => setSelectedSubGalleryId(subGallery.sub_gallery_id)}
                    className="w-full justify-start"
                    leftIcon={<FolderOpen size={20} />}
                  >
                    {subGallery.name}
                  </AppButton>
                ))}
              </div>
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
                <AppButton
                  variant="outline"
                  onClick={() => {
                    setShowMoveDialog(false);
                    setSelectedSubGalleryId(null);
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </AppButton>
                <AppButton
                  variant="primary"
                  onClick={() => {
                    if (onBulkMove) {
                      onBulkMove(Array.from(selectedAssetIds), selectedSubGalleryId);
                    }
                    setShowMoveDialog(false);
                    setSelectedSubGalleryId(null);
                  }}
                  disabled={isLoading || selectedSubGalleryId === undefined}
                >
                  Move
                </AppButton>
              </div>
            </div>
          </AppCard>
        </div>
      )}
    </>
  );
};

