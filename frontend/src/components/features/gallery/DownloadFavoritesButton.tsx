/**
 * DownloadFavoritesButton Component
 *
 * Button that triggers and shows progress for favorites ZIP download.
 *
 * Feature: 012-client-favorites (US4)
 */

import React, { useState, useEffect } from 'react';
import { Download, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { useDownloadFavorites } from '../../../hooks/useDownloadFavorites';

export interface DownloadFavoritesButtonProps {
  galleryId: string;
  listId: string;
  /** Whether original resolution downloads are allowed */
  allowOriginal?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Button size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Full width button */
  fullWidth?: boolean;
  className?: string;
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const DownloadFavoritesButton: React.FC<DownloadFavoritesButtonProps> = ({
  galleryId,
  listId,
  allowOriginal = false,
  disabled = false,
  size = 'md',
  fullWidth = false,
  className = '',
}) => {
  const [showResolutionPicker, setShowResolutionPicker] = useState(false);
  const {
    state,
    progress,
    downloadUrl,
    fileSize,
    error,
    requestDownload,
    reset,
    isDownloading,
  } = useDownloadFavorites(galleryId, listId);

  // Auto-download when completed
  useEffect(() => {
    if (state === 'completed' && downloadUrl) {
      // Create invisible link and click it
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = 'favorites.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [state, downloadUrl]);

  const handleClick = () => {
    if (state === 'completed') {
      // Re-download the file
      if (downloadUrl) {
        window.open(downloadUrl, '_blank');
      }
      return;
    }

    if (state === 'failed') {
      reset();
      return;
    }

    if (isDownloading) {
      return;
    }

    // If original allowed, show resolution picker
    if (allowOriginal) {
      setShowResolutionPicker(true);
    } else {
      // Start download with web resolution
      requestDownload('web');
    }
  };

  const handleResolutionSelect = (resolution: 'web' | 'original') => {
    setShowResolutionPicker(false);
    requestDownload(resolution);
  };

  const getButtonContent = () => {
    switch (state) {
      case 'requesting':
        return (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Preparing...</span>
          </>
        );
      case 'processing':
        return (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Downloading {progress}%</span>
          </>
        );
      case 'completed':
        return (
          <>
            <CheckCircle className="w-4 h-4 text-success" />
            <span>Download Ready {fileSize ? `(${formatFileSize(fileSize)})` : ''}</span>
          </>
        );
      case 'failed':
        return (
          <>
            <XCircle className="w-4 h-4 text-error" />
            <span>Failed - Retry</span>
          </>
        );
      default:
        return (
          <>
            <Download className="w-4 h-4" />
            <span>Download</span>
          </>
        );
    }
  };

  const getButtonVariant = (): 'primary' | 'outline' | 'destructive' => {
    switch (state) {
      case 'failed':
        return 'destructive';
      case 'completed':
        return 'primary';
      default:
        return 'outline';
    }
  };

  return (
    <div className={`relative ${fullWidth ? 'w-full' : 'inline-block'} ${className}`}>
      <AppButton
        variant={getButtonVariant()}
        size={size}
        onClick={handleClick}
        disabled={disabled || isDownloading}
        className={`${fullWidth ? 'w-full' : ''} gap-2`}
        title={error || undefined}
      >
        {getButtonContent()}
      </AppButton>

      {/* Progress bar overlay when downloading */}
      {isDownloading && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-border rounded-b overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Resolution picker dropdown */}
      {showResolutionPicker && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowResolutionPicker(false)}
            aria-hidden="true"
          />
          {/* Dropdown */}
          <div
            role="menu"
            aria-label="Select download quality"
            className="absolute top-full left-0 mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg p-2 min-w-[180px]"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowResolutionPicker(false);
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = document.querySelector<HTMLButtonElement>(
                  '[role="menuitem"]:first-child'
                );
                next?.focus();
              }
            }}
          >
            <button
              role="menuitem"
              className="w-full text-left px-3 py-2 rounded hover:bg-surface-hover focus:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent text-sm text-text-primary transition-colors"
              onClick={() => handleResolutionSelect('web')}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  (e.currentTarget.nextElementSibling as HTMLElement)?.focus();
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  (e.currentTarget.previousElementSibling as HTMLElement)?.focus();
                }
              }}
              autoFocus
            >
              <div className="font-medium">Web Quality</div>
              <div className="text-xs text-text-tertiary">Optimized for sharing</div>
            </button>
            <button
              role="menuitem"
              className="w-full text-left px-3 py-2 rounded hover:bg-surface-hover focus:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent text-sm text-text-primary transition-colors"
              onClick={() => handleResolutionSelect('original')}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  (e.currentTarget.nextElementSibling as HTMLElement)?.focus();
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  (e.currentTarget.previousElementSibling as HTMLElement)?.focus();
                }
              }}
            >
              <div className="font-medium">Original Quality</div>
              <div className="text-xs text-text-tertiary">Full resolution files</div>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default DownloadFavoritesButton;
