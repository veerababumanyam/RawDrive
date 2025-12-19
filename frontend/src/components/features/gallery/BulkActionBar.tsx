/**
 * BulkActionBar Component
 * Displays bulk actions when photos are selected
 * Property 24: Bulk Actions Bar
 */

import React, { useState } from 'react';
import { Move, Trash2, Download, X, FolderOpen } from 'lucide-react';
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
      <AppCard
        padding="md"
        className={`
          sticky top-0 z-10
          bg-surface border-2 border-primary
          shadow-lg
          ${className}
        `}
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
                <button
                  onClick={() => setSelectedSubGalleryId(null)}
                  className={`
                    w-full flex items-center gap-2 p-3 border rounded-lg transition-colors
                    ${selectedSubGalleryId === null
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-surface-hover'
                    }
                  `}
                >
                  <FolderOpen size={20} className={selectedSubGalleryId === null ? 'text-primary' : 'text-text-tertiary'} />
                  <span className={`text-sm ${selectedSubGalleryId === null ? 'text-primary font-medium' : 'text-text-primary'}`}>
                    Root Gallery
                  </span>
                </button>
                {/* Sub-Gallery Options */}
                {subGalleries.map((subGallery) => (
                  <button
                    key={subGallery.sub_gallery_id}
                    onClick={() => setSelectedSubGalleryId(subGallery.sub_gallery_id)}
                    className={`
                      w-full flex items-center gap-2 p-3 border rounded-lg transition-colors
                      ${selectedSubGalleryId === subGallery.sub_gallery_id
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-surface-hover'
                      }
                    `}
                  >
                    <FolderOpen size={20} className={selectedSubGalleryId === subGallery.sub_gallery_id ? 'text-primary' : 'text-text-tertiary'} />
                    <span className={`text-sm ${selectedSubGalleryId === subGallery.sub_gallery_id ? 'text-primary font-medium' : 'text-text-primary'}`}>
                      {subGallery.name}
                    </span>
                  </button>
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

