/**
 * SinglePhotoDownloadModal Component
 * Modal for downloading individual photos with format and resolution options
 *
 * Features:
 * - Resolution selection (web, high, original)
 * - Format selection (JPEG, PNG, WebP)
 * - Watermark indicator
 * - File size estimation
 * - Download progress
 */

import React, { useState, useCallback } from 'react';
import { X, Download, Image, FileImage, Loader2, Check, AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import type { DownloadPolicy } from '../../../types/gallery';

export interface DownloadOption {
  id: string;
  label: string;
  description: string;
  resolution: string;
  estimatedSize: string;
  available: boolean;
}

export interface SinglePhotoDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  photoId: string;
  photoName: string;
  thumbnailUrl?: string;
  downloadPolicy: DownloadPolicy;
  hasWatermark: boolean;
  onDownload: (photoId: string, resolution: string, format: string) => Promise<void>;
  originalWidth?: number;
  originalHeight?: number;
}

const resolutionOptions: DownloadOption[] = [
  {
    id: 'web',
    label: 'Web Quality',
    description: 'Optimized for social media and web sharing',
    resolution: '2048px',
    estimatedSize: '~500KB - 2MB',
    available: true,
  },
  {
    id: 'high',
    label: 'High Quality',
    description: 'Suitable for prints up to 8x10"',
    resolution: '4096px',
    estimatedSize: '~2MB - 8MB',
    available: true,
  },
  {
    id: 'original',
    label: 'Original',
    description: 'Full resolution as captured',
    resolution: 'Full Size',
    estimatedSize: '~10MB - 50MB',
    available: true,
  },
];

const formatOptions = [
  { id: 'jpeg', label: 'JPEG', description: 'Best for photos', icon: FileImage },
  { id: 'png', label: 'PNG', description: 'Lossless quality', icon: Image },
  { id: 'webp', label: 'WebP', description: 'Modern, smaller files', icon: FileImage },
];

export const SinglePhotoDownloadModal: React.FC<SinglePhotoDownloadModalProps> = ({
  isOpen,
  onClose,
  photoId,
  photoName,
  thumbnailUrl,
  downloadPolicy,
  hasWatermark,
  onDownload,
  originalWidth,
  originalHeight,
}) => {
  const [selectedResolution, setSelectedResolution] = useState<string>('web');
  const [selectedFormat, setSelectedFormat] = useState<string>('jpeg');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter available options based on download policy
  const getAvailableResolutions = useCallback(() => {
    return resolutionOptions.map((opt) => {
      let available = true;
      if (downloadPolicy === 'view_only') {
        available = false;
      } else if (downloadPolicy === 'web_only' && opt.id !== 'web') {
        available = false;
      } else if (downloadPolicy === 'watermarked_only') {
        available = true; // All resolutions available with watermark
      }
      return { ...opt, available };
    });
  }, [downloadPolicy]);

  const handleDownload = async () => {
    setIsDownloading(true);
    setError(null);
    try {
      await onDownload(photoId, selectedResolution, selectedFormat);
      setDownloadComplete(true);
      setTimeout(() => {
        onClose();
        setDownloadComplete(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleClose = () => {
    if (!isDownloading) {
      onClose();
      setDownloadComplete(false);
      setError(null);
    }
  };

  if (!isOpen) return null;

  const availableResolutions = getAvailableResolutions();

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
              <h2 className="text-lg font-semibold text-text-primary">Download Photo</h2>
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
              {/* Photo Preview */}
              <div className="flex items-center gap-4">
                {thumbnailUrl && (
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-surface-hover flex-shrink-0">
                    <img
                      src={thumbnailUrl}
                      alt={photoName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text-primary truncate">{photoName}</p>
                  {originalWidth && originalHeight && (
                    <p className="text-sm text-text-secondary">
                      {originalWidth} x {originalHeight} px
                    </p>
                  )}
                  {hasWatermark && (
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-400">
                      <AlertTriangle size={12} />
                      <span>Watermark will be applied</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Resolution Selection */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Resolution
                </label>
                <div className="space-y-2">
                  {availableResolutions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => option.available && setSelectedResolution(option.id)}
                      disabled={!option.available}
                      className={`
                        w-full p-3 rounded-lg border text-left transition-all
                        ${selectedResolution === option.id
                          ? 'border-primary bg-primary/10'
                          : option.available
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
                      {!option.available && (
                        <p className="text-xs text-text-tertiary mt-1">
                          Not available with current download policy
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Format Selection */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Format
                </label>
                <div className="flex gap-2">
                  {formatOptions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setSelectedFormat(option.id)}
                      className={`
                        flex-1 p-3 rounded-lg border text-center transition-all
                        ${selectedFormat === option.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-text-tertiary'
                        }
                      `}
                    >
                      <option.icon size={20} className="mx-auto mb-1 text-text-secondary" />
                      <p className="font-medium text-text-primary text-sm">{option.label}</p>
                      <p className="text-xs text-text-tertiary">{option.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                  <AlertTriangle size={18} />
                  <p className="text-sm">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-border bg-surface-hover">
              <AppButton variant="outline" onClick={handleClose} disabled={isDownloading}>
                Cancel
              </AppButton>
              <AppButton
                variant="primary"
                onClick={handleDownload}
                disabled={isDownloading || downloadComplete || downloadPolicy === 'view_only'}
                leftIcon={
                  downloadComplete ? (
                    <Check size={16} />
                  ) : isDownloading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Download size={16} />
                  )
                }
              >
                {downloadComplete
                  ? 'Downloaded!'
                  : isDownloading
                    ? 'Downloading...'
                    : 'Download'}
              </AppButton>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
};
