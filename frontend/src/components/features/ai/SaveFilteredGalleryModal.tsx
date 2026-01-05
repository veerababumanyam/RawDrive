/**
 * SaveFilteredGalleryModal Component
 *
 * Modal for creating a sub-gallery from filtered photo results.
 * Provides name input, validation, and creation workflow.
 *
 * Feature: 025-ai-filter-simplify (T039)
 */

import React, { useState, useCallback } from 'react';
import { X, FolderPlus, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import galleryService from '@/services/galleryService';

interface SaveFilteredGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  parentGalleryId: string;
  parentGalleryName: string;
  assetIds: string[];
  filterDescription?: string;
  onSuccess?: (newGalleryId: string, newGalleryName: string) => void;
}

type SaveState = 'idle' | 'saving' | 'success' | 'error';

export const SaveFilteredGalleryModal: React.FC<SaveFilteredGalleryModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
  parentGalleryId,
  parentGalleryName,
  assetIds,
  filterDescription,
  onSuccess,
}) => {
  const [name, setName] = useState(() => {
    const baseDefault = filterDescription
      ? `${parentGalleryName} - ${filterDescription}`
      : `${parentGalleryName} - Selection`;
    return baseDefault.slice(0, 100);
  });
  const [copySettings, setCopySettings] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newGalleryId, setNewGalleryId] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setErrorMessage('Gallery name is required');
      return;
    }

    if (assetIds.length === 0) {
      setErrorMessage('No photos selected to save');
      return;
    }

    if (assetIds.length > 500) {
      setErrorMessage('Cannot save more than 500 photos at once');
      return;
    }

    setSaveState('saving');
    setErrorMessage(null);

    try {
      const result = await galleryService.createSubGalleryFromFilter(
        workspaceId,
        parentGalleryId,
        {
          name: name.trim(),
          asset_ids: assetIds,
          copy_settings: copySettings,
        }
      );

      setSaveState('success');
      setNewGalleryId(result.gallery_id);
      onSuccess?.(result.gallery_id, result.name);
    } catch (error) {
      setSaveState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to create gallery'
      );
    }
  }, [name, assetIds, copySettings, workspaceId, parentGalleryId, onSuccess]);

  const handleClose = useCallback(() => {
    if (saveState !== 'saving') {
      setSaveState('idle');
      setErrorMessage(null);
      setNewGalleryId(null);
      onClose();
    }
  }, [saveState, onClose]);

  const handleViewNewGallery = useCallback(() => {
    if (newGalleryId) {
      window.location.href = `/workspace/galleries/${newGalleryId}`;
    }
  }, [newGalleryId]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-gallery-title"
    >
      <div
        className="bg-surface rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FolderPlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 id="save-gallery-title" className="text-lg font-semibold text-text-primary">
                Save as Gallery
              </h2>
              <p className="text-sm text-text-secondary">
                {assetIds.length} photo{assetIds.length !== 1 ? 's' : ''} selected
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-background transition-colors"
            aria-label="Close modal"
            disabled={saveState === 'saving'}
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {saveState === 'success' ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-medium text-text-primary mb-2">
                Gallery Created!
              </h3>
              <p className="text-sm text-text-secondary mb-4">
                "{name}" has been created with {assetIds.length} photos.
              </p>
              <div className="flex gap-3 justify-center">
                <AppButton variant="outline" onClick={handleClose}>
                  Close
                </AppButton>
                <AppButton variant="primary" onClick={handleViewNewGallery}>
                  View Gallery
                </AppButton>
              </div>
            </div>
          ) : (
            <>
              {/* Gallery Name Input */}
              <div>
                <label
                  htmlFor="gallery-name"
                  className="block text-sm font-medium text-text-primary mb-2"
                >
                  Gallery Name
                </label>
                <AppInput
                  id="gallery-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter gallery name"
                  maxLength={100}
                  disabled={saveState === 'saving'}
                  className="w-full"
                  autoFocus
                />
                <p className="text-xs text-text-tertiary mt-1">
                  {name.length}/100 characters
                </p>
              </div>

              {/* Copy Settings Checkbox */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={copySettings}
                  onChange={(e) => setCopySettings(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                  disabled={saveState === 'saving'}
                />
                <span className="text-sm text-text-primary">
                  Copy privacy and watermark settings from parent gallery
                </span>
              </label>

              {/* Parent Gallery Info */}
              <div className="bg-background/50 rounded-lg p-3">
                <p className="text-xs text-text-tertiary mb-1">Parent Gallery</p>
                <p className="text-sm text-text-secondary truncate">
                  {parentGalleryName}
                </p>
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="flex items-center gap-2 text-error text-sm p-3 bg-error/5 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {saveState !== 'success' && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-background/50">
            <AppButton
              variant="ghost"
              onClick={handleClose}
              disabled={saveState === 'saving'}
            >
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              onClick={handleSave}
              disabled={saveState === 'saving' || !name.trim()}
            >
              {saveState === 'saving' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FolderPlus className="w-4 h-4 mr-2" />
                  Create Gallery
                </>
              )}
            </AppButton>
          </div>
        )}
      </div>
    </div>
  );
};

export default SaveFilteredGalleryModal;
