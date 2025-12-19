/**
 * DuplicateDetectionDialog Component
 * Shows side-by-side comparison of duplicate files
 * Offers options: Skip, Replace, Keep Both
 */

import React, { useEffect } from 'react';
import { X, FileImage, AlertTriangle } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppCard } from '../../ui/AppCard';
import { useFocusTrap } from '../../../hooks/useFocusTrap';
import type { DuplicateAssetResponse } from '../../../types/gallery';
import { formatFileSize } from '../../../utils/format';

export interface DuplicateDetectionDialogProps {
  /** Whether dialog is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** List of duplicate assets found */
  duplicates: DuplicateAssetResponse[];
  /** New file being uploaded */
  newFile: File;
  /** Preview URL for new file (optional) */
  newFilePreview?: string;
  /** Handler for Skip action */
  onSkip: () => void;
  /** Handler for Replace action */
  onReplace: () => void;
  /** Handler for Keep Both action */
  onKeepBoth: () => void;
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

/**
 * Generate preview URL for new file
 */
function generateFilePreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File is not an image'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export const DuplicateDetectionDialog: React.FC<DuplicateDetectionDialogProps> = ({
  isOpen,
  onClose,
  duplicates,
  newFile,
  newFilePreview,
  onSkip,
  onReplace,
  onKeepBoth,
}) => {
  const dialogRef = useFocusTrap<HTMLDivElement>({
    enabled: isOpen,
    onEscape: onClose,
  });
  const [newPreview, setNewPreview] = React.useState<string | null>(newFilePreview || null);

  // Generate preview for new file if not provided
  useEffect(() => {
    if (isOpen && !newFilePreview && newFile.type.startsWith('image/')) {
      generateFilePreview(newFile)
        .then(setNewPreview)
        .catch(() => {
          // Ignore errors, will show placeholder
        });
    }
  }, [isOpen, newFile, newFilePreview]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const duplicate = duplicates[0]; // Show first duplicate (most recent)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-dialog-title"
      aria-describedby="duplicate-dialog-description"
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <AppCard
        ref={dialogRef}
        variant="elevated"
        padding="lg"
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-warning-600" aria-hidden="true" />
            <h2
              id="duplicate-dialog-title"
              className="text-lg font-semibold text-text-primary"
            >
              Duplicate File Detected
            </h2>
          </div>
          <AppButton
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </AppButton>
        </div>

        {/* Description */}
        <p
          id="duplicate-dialog-description"
          className="text-sm text-text-secondary mb-6"
        >
          This file already exists in your gallery. Choose how to proceed:
        </p>

        {/* Side-by-side comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Existing file */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-text-primary">Existing File</h3>
            <div className="border border-border rounded-lg overflow-hidden bg-surface-hover">
              {duplicate.thumbnail_url ? (
                <img
                  src={duplicate.thumbnail_url}
                  alt={duplicate.file_name}
                  className="w-full h-48 object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-48 flex items-center justify-center bg-surface-hover">
                  <FileImage className="w-12 h-12 text-text-tertiary" />
                </div>
              )}
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Filename:</span>
                <span className="text-text-primary font-medium">{duplicate.file_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Size:</span>
                <span className="text-text-primary">{formatFileSize(duplicate.size_bytes)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Uploaded:</span>
                <span className="text-text-primary">{formatDate(duplicate.created_at)}</span>
              </div>
            </div>
          </div>

          {/* New file */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-text-primary">New File</h3>
            <div className="border border-border rounded-lg overflow-hidden bg-surface-hover">
              {newPreview ? (
                <img
                  src={newPreview}
                  alt={newFile.name}
                  className="w-full h-48 object-cover"
                />
              ) : (
                <div className="w-full h-48 flex items-center justify-center bg-surface-hover">
                  <FileImage className="w-12 h-12 text-text-tertiary" />
                </div>
              )}
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Filename:</span>
                <span className="text-text-primary font-medium">{newFile.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Size:</span>
                <span className="text-text-primary">{formatFileSize(newFile.size)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Type:</span>
                <span className="text-text-primary">{newFile.type}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Additional duplicates notice */}
        {duplicates.length > 1 && (
          <div className="mb-6 p-3 bg-warning-50 border border-warning-200 rounded-lg">
            <p className="text-sm text-warning-800">
              {duplicates.length - 1} more duplicate{duplicates.length > 2 ? 's' : ''} found.
              This action will apply to all duplicates.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-end">
          <AppButton variant="outline" onClick={onSkip}>
            Skip
          </AppButton>
          <AppButton variant="destructive" onClick={onReplace}>
            Replace Existing
          </AppButton>
          <AppButton variant="primary" onClick={onKeepBoth}>
            Keep Both
          </AppButton>
        </div>
      </AppCard>
    </div>
  );
};

