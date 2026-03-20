/**
 * DownloadProgressBar Component
 * Animated progress bar for batch ZIP downloads with status text and cancel button.
 */
import React from 'react';
import { X } from 'lucide-react';
import type { DownloadStatus } from '../../../../hooks/useGalleryDownload';

export interface DownloadProgressBarProps {
  progress: number;
  status: DownloadStatus;
  onCancel: () => void;
}

function getStatusText(status: DownloadStatus, progress: number): string {
  switch (status) {
    case 'preparing':
      return 'Preparing ZIP...';
    case 'downloading':
      return `Downloading... ${progress}%`;
    case 'complete':
      return 'Complete!';
    case 'error':
      return 'Download failed';
    default:
      return '';
  }
}

export const DownloadProgressBar: React.FC<DownloadProgressBarProps> = ({
  progress,
  status,
  onCancel,
}) => {
  const isActive = status === 'preparing' || status === 'downloading';

  return (
    <div className="space-y-3" data-testid="download-progress-bar">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">
          {getStatusText(status, progress)}
        </span>
        {isActive && (
          <button
            onClick={onCancel}
            className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
            aria-label="Cancel download"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${
            status === 'complete'
              ? 'bg-green-500'
              : status === 'error'
                ? 'bg-red-500'
                : 'bg-blue-500'
          }`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
};
