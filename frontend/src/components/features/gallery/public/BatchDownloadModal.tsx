/**
 * BatchDownloadModal Component
 * Modal for downloading multiple gallery photos as a ZIP file.
 * Respects download_policy to filter available sizes.
 * Shows DownloadProgressBar when a download is in progress.
 */
import React, { useState } from 'react';
import { X, Download, Loader2, Check, AlertTriangle, ImageIcon, Image } from 'lucide-react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AppButton } from '../../../ui/AppButton';
import { DownloadProgressBar } from './DownloadProgressBar';
import type { DownloadPolicy } from '../../../../types/gallery';
import type { DownloadStatus } from '../../../../hooks/useGalleryDownload';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BatchDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  downloadPolicy: DownloadPolicy;
  totalPhotos: number;
  favoritesCount: number;
  selectionsCount: number;
  onDownload: (options: { size: string; scope: string }) => void;
  progress: number;
  status: DownloadStatus;
  onCancel: () => void;
}

interface SizeOption {
  id: string;
  label: string;
  description: string;
  resolution: string;
  estimatedSize: string;
}

const SIZE_OPTIONS: SizeOption[] = [
  {
    id: 'web',
    label: 'Web Quality',
    description: 'Optimized for social media & web (1920px)',
    resolution: '1920px',
    estimatedSize: '~1-3MB each',
  },
  {
    id: 'print',
    label: 'Print Quality',
    description: 'Suitable for large prints (4000px)',
    resolution: '4000px',
    estimatedSize: '~5-10MB each',
  },
  {
    id: 'original',
    label: 'Original',
    description: 'Full resolution as captured',
    resolution: 'Full Size',
    estimatedSize: '~10-50MB each',
  },
];

function isSizeAvailable(sizeId: string, policy: DownloadPolicy): boolean {
  if (policy === 'view_only') return false;
  if (policy === 'web_only' && sizeId !== 'web') return false;
  // watermarked_only and original_allowed allow all sizes
  return true;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const BatchDownloadModal: React.FC<BatchDownloadModalProps> = ({
  isOpen,
  onClose,
  downloadPolicy,
  totalPhotos,
  favoritesCount,
  selectionsCount,
  onDownload,
  progress,
  status,
  onCancel,
}) => {
  const [selectedSize, setSelectedSize] = useState<string>('web');
  const [selectedScope, setSelectedScope] = useState<string>('all');

  const isDownloading = status !== 'idle' && status !== 'error';
  const isWatermarked = downloadPolicy === 'watermarked_only';

  const handleClose = () => {
    if (!isDownloading) {
      onClose();
    }
  };

  const handleDownload = () => {
    onDownload({ size: selectedSize, scope: selectedScope });
  };

  if (!isOpen) return null;

  const scopeOptions = [
    { id: 'all', label: `All Photos (${totalPhotos})`, count: totalPhotos },
    { id: 'favorites', label: `Favorites (${favoritesCount})`, count: favoritesCount },
    { id: 'selections', label: `Selections (${selectionsCount})`, count: selectionsCount },
  ];

  const modal = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg bg-surface rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Download Photos</h2>
              <button
                onClick={handleClose}
                disabled={isDownloading}
                className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-6">
              {/* Show progress bar when downloading */}
              {status !== 'idle' ? (
                <DownloadProgressBar
                  progress={progress}
                  status={status}
                  onCancel={onCancel}
                />
              ) : (
                <>
                  {/* Watermark notice */}
                  {isWatermarked && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                      <AlertTriangle size={16} />
                      <span className="text-sm font-medium">Watermarked</span>
                      <span className="text-sm">Downloads will include a watermark</span>
                    </div>
                  )}

                  {/* Size Selection */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      Quality
                    </label>
                    <div className="space-y-2" role="radiogroup" aria-label="Download quality">
                      {SIZE_OPTIONS.map((option) => {
                        const available = isSizeAvailable(option.id, downloadPolicy);
                        return (
                          <button
                            key={option.id}
                            role="radio"
                            aria-checked={selectedSize === option.id}
                            onClick={() => available && setSelectedSize(option.id)}
                            disabled={!available}
                            className={`
                              w-full p-3 rounded-lg border text-left transition-all
                              ${selectedSize === option.id && available
                                ? 'border-primary bg-primary/10'
                                : available
                                  ? 'border-border hover:border-text-tertiary'
                                  : 'border-border opacity-50 cursor-not-allowed'
                              }
                            `}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-text-primary">{option.label}</p>
                                <p className="text-xs text-text-secondary">{option.description}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-text-primary">{option.resolution}</p>
                                <p className="text-xs text-text-tertiary">{option.estimatedSize}</p>
                              </div>
                            </div>
                            {!available && (
                              <p className="text-xs text-text-tertiary mt-1">
                                Not available with current download policy
                              </p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Scope Selection */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      What to download
                    </label>
                    <div className="space-y-2">
                      {scopeOptions.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => option.count > 0 && setSelectedScope(option.id)}
                          disabled={option.count === 0}
                          className={`
                            w-full p-3 rounded-lg border text-left transition-all
                            ${selectedScope === option.id && option.count > 0
                              ? 'border-primary bg-primary/10'
                              : option.count > 0
                                ? 'border-border hover:border-text-tertiary'
                                : 'border-border opacity-50 cursor-not-allowed'
                            }
                          `}
                        >
                          <span className="font-medium text-text-primary">{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-border bg-surface-hover">
              <AppButton variant="outline" onClick={handleClose} disabled={isDownloading}>
                Cancel
              </AppButton>
              {status === 'idle' && (
                <AppButton
                  variant="primary"
                  onClick={handleDownload}
                  leftIcon={<Download size={16} />}
                >
                  Download
                </AppButton>
              )}
              {status === 'complete' && (
                <AppButton
                  variant="primary"
                  onClick={handleClose}
                  leftIcon={<Check size={16} />}
                >
                  Done
                </AppButton>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
};
