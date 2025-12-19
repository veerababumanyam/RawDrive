/**
 * UploadProgressPanel Component
 * YouTube/Dropbox-inspired upload progress panel
 * Displays overall progress, per-file progress with stages, upload speed, and controls
 * Minimizable panel that persists across page navigation
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  Upload as UploadIcon,
  Image,
  FileVideo,
  File,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppCard } from '../../ui/AppCard';
import { Progress } from '../../ui/Progress';

export type UploadStage =
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'thumbnail'
  | 'preview'
  | 'encrypting'
  | 'complete'
  | 'error';

export interface UploadFileProgress {
  id: string;
  file: File;
  stage: UploadStage;
  progress: number; // 0-100
  uploadedBytes: number;
  totalBytes: number;
  speed?: number; // bytes per second
  error?: string;
  thumbnail?: string; // Local thumbnail preview URL
  estimatedTimeRemaining?: number; // seconds
}

export interface UploadProgressPanelProps {
  /** Upload files with progress */
  files: UploadFileProgress[];
  /** Overall upload statistics */
  stats?: {
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    totalBytes: number;
    uploadedBytes: number;
    averageSpeed?: number; // bytes per second
  };
  /** Callback when pause/resume is clicked */
  onPauseResume?: () => void;
  /** Callback when clear completed is clicked */
  onClearCompleted?: () => void;
  /** Callback when cancel all is clicked */
  onCancelAll?: () => void;
  /** Callback when individual file is cancelled */
  onCancelFile?: (fileId: string) => void;
  /** Callback when retry is clicked for failed file */
  onRetryFile?: (fileId: string) => void;
  /** Whether uploads are paused */
  isPaused?: boolean;
  /** Whether panel is minimized */
  isMinimized?: boolean;
  /** Callback when minimize state changes */
  onMinimizeChange?: (minimized: boolean) => void;
  /** Panel position (for persistence) */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  className?: string;
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format upload speed
function formatSpeed(bytesPerSecond: number): string {
  return `${formatFileSize(bytesPerSecond)}/s`;
}

// Get connection quality badge
function getConnectionQuality(speedBytesPerSecond?: number): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (!speedBytesPerSecond) {
    return { label: 'Unknown', color: 'text-text-tertiary', bgColor: 'bg-surface-hover' };
  }

  const speedMbps = (speedBytesPerSecond * 8) / (1024 * 1024); // Convert to Mbps

  if (speedMbps >= 10) {
    return { label: 'Excellent', color: 'text-success', bgColor: 'bg-success/10' };
  } else if (speedMbps >= 1) {
    return { label: 'Good', color: 'text-text-primary', bgColor: 'bg-surface-hover' };
  } else {
    return { label: 'Slow', color: 'text-warning', bgColor: 'bg-warning/10' };
  }
}

// Format time remaining
function formatTimeRemaining(seconds?: number): string {
  if (!seconds || seconds < 0) return 'Calculating...';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

// Get stage label
function getStageLabel(stage: UploadStage): string {
  const labels: Record<UploadStage, string> = {
    queued: 'Queued',
    uploading: 'Uploading',
    processing: 'Processing',
    thumbnail: 'Generating thumbnail',
    preview: 'Generating preview',
    encrypting: 'Encrypting',
    complete: 'Complete',
    error: 'Error',
  };
  return labels[stage];
}

// Get file icon
function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.startsWith('video/')) return FileVideo;
  return File;
}

export const UploadProgressPanel: React.FC<UploadProgressPanelProps> = ({
  files,
  stats,
  onPauseResume,
  onClearCompleted,
  onCancelAll,
  onCancelFile,
  onRetryFile,
  isPaused = false,
  isMinimized = false,
  onMinimizeChange,
  position = 'bottom-right',
  className = '',
}) => {
  const [localMinimized, setLocalMinimized] = useState(isMinimized);

  // Use local state if onMinimizeChange not provided
  const minimized = onMinimizeChange !== undefined ? isMinimized : localMinimized;
  const setMinimized = useCallback(
    (value: boolean) => {
      if (onMinimizeChange) {
        onMinimizeChange(value);
      } else {
        setLocalMinimized(value);
      }
    },
    [onMinimizeChange]
  );

  // Calculate overall progress
  const overallProgress = useMemo(() => {
    if (!stats || stats.totalFiles === 0) return 0;
    return Math.round((stats.completedFiles / stats.totalFiles) * 100);
  }, [stats]);

  // Calculate estimated time remaining
  const estimatedTimeRemaining = useMemo(() => {
    if (!stats?.averageSpeed || stats.averageSpeed === 0) return undefined;
    const remainingBytes = stats.totalBytes - stats.uploadedBytes;
    return remainingBytes / stats.averageSpeed;
  }, [stats]);

  // Connection quality
  const connectionQuality = useMemo(
    () => getConnectionQuality(stats?.averageSpeed),
    [stats?.averageSpeed]
  );

  // Position classes
  const positionClasses = useMemo(() => {
    // Mobile: always fixed bottom with margin
    const mobileClasses = 'bottom-2 left-2 right-2 md:left-auto md:right-auto md:w-96';

    const desktopClasses: Record<string, string> = {
      'bottom-right': 'md:bottom-4 md:right-4',
      'bottom-left': 'md:bottom-4 md:left-4',
      'top-right': 'md:top-4 md:right-4',
      'top-left': 'md:top-4 md:left-4',
    };

    return `${mobileClasses} ${desktopClasses[position] || desktopClasses['bottom-right']}`;
  }, [position]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Esc to minimize
      if (e.key === 'Escape') {
        setMinimized(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setMinimized]);

  if (files.length === 0) return null;

  const allComplete = !!stats && stats.completedFiles === stats.totalFiles && stats.totalFiles > 0;
  const hasCompleted = (stats?.completedFiles || 0) > 0;

  return (
    <div
      className={`fixed ${positionClasses} z-50 w-full max-w-md ${className}`}
      role="region"
      aria-label="Upload progress"
    >
      <AppCard
        padding="md"
        className={`
          shadow-2xl border-2 
          ${allComplete ? 'border-success/50 bg-success/5' : 'border-primary/20'}
          ${minimized ? 'max-h-16 overflow-hidden' : ''}
          transition-all duration-300
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {allComplete ? (
              <CheckCircle size={20} className="text-success" />
            ) : (
              <UploadIcon size={20} className="text-primary" />
            )}
            <h3 className="text-sm font-semibold text-text-primary">
              {allComplete ? 'Upload Complete' : `Uploading ${stats?.completedFiles || 0} of ${stats?.totalFiles || files.length}`}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            {/* Connection Quality Badge */}
            {stats?.averageSpeed && !allComplete && (
              <div
                className={`
                  px-2 py-0.5 rounded text-xs font-medium
                  ${connectionQuality.color} ${connectionQuality.bgColor}
                `}
                title={`Upload speed: ${formatSpeed(stats.averageSpeed)}`}
              >
                {connectionQuality.label}
              </div>
            )}
            {/* Minimize Button */}
            <button
              onClick={() => setMinimized(!minimized)}
              className="p-1 hover:bg-surface-hover rounded touch-target"
              aria-label={minimized ? 'Expand panel' : 'Minimize panel'}
            >
              {minimized ? (
                <ChevronUp size={16} className="text-text-tertiary" />
              ) : (
                <ChevronDown size={16} className="text-text-tertiary" />
              )}
            </button>
          </div>
        </div>

        {/* Overall Progress */}
        {!minimized && (
          <>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-secondary">Overall Progress</span>
                <span className="text-xs font-medium text-text-primary">
                  {overallProgress}%
                </span>
              </div>
              <Progress value={overallProgress} size="sm" />
              {estimatedTimeRemaining && (
                <p className="text-xs text-text-tertiary mt-1">
                  {formatTimeRemaining(estimatedTimeRemaining)} remaining
                </p>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 mb-4">
              {onPauseResume && !allComplete && (
                <AppButton
                  variant="outline"
                  size="sm"
                  onClick={onPauseResume}
                  leftIcon={isPaused ? <Play size={14} /> : <Pause size={14} />}
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </AppButton>
              )}
              {onClearCompleted && hasCompleted && (
                <AppButton
                  variant="outline"
                  size="sm"
                  onClick={onClearCompleted}
                  leftIcon={<CheckCircle size={14} />}
                >
                  Clear Completed
                </AppButton>
              )}
              {onCancelAll && !allComplete && (
                <AppButton
                  variant="ghost"
                  size="sm"
                  onClick={onCancelAll}
                  leftIcon={<X size={14} />}
                >
                  Cancel All
                </AppButton>
              )}
            </div>

            {/* File List */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {files.map((fileProgress) => {
                const FileIcon = getFileIcon(fileProgress.file.type);
                const isComplete = fileProgress.stage === 'complete';
                const isError = fileProgress.stage === 'error';
                const isActive =
                  fileProgress.stage === 'uploading' ||
                  fileProgress.stage === 'processing' ||
                  fileProgress.stage === 'thumbnail' ||
                  fileProgress.stage === 'preview' ||
                  fileProgress.stage === 'encrypting';

                return (
                  <div
                    key={fileProgress.id}
                    className={`
                      p-3 rounded-lg border
                      ${isError ? 'border-error bg-error/5' : 'border-border bg-surface'}
                    `}
                  >
                    <div className="flex items-start gap-3">
                      {/* Thumbnail Preview */}
                      <div className="flex-shrink-0">
                        {fileProgress.thumbnail ? (
                          <div className="w-12 h-12 rounded overflow-hidden bg-surface-hover">
                            <img
                              src={fileProgress.thumbnail}
                              alt={fileProgress.file.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded bg-surface-hover flex items-center justify-center">
                            <FileIcon size={20} className="text-text-tertiary" />
                          </div>
                        )}
                      </div>

                      {/* File Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {fileProgress.file.name}
                          </p>
                          {isComplete && (
                            <CheckCircle size={16} className="text-success flex-shrink-0" />
                          )}
                          {isError && (
                            <AlertCircle size={16} className="text-error flex-shrink-0" />
                          )}
                          {isActive && (
                            <Loader2 size={16} className="text-primary animate-spin flex-shrink-0" />
                          )}
                        </div>

                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-text-tertiary">
                            {formatFileSize(fileProgress.uploadedBytes)} /{' '}
                            {formatFileSize(fileProgress.totalBytes)}
                          </span>
                          {fileProgress.speed && (
                            <span className="text-xs text-text-tertiary">
                              • {formatSpeed(fileProgress.speed)}
                            </span>
                          )}
                        </div>

                        {/* Stage Label */}
                        <p className="text-xs text-text-secondary mb-2">
                          {getStageLabel(fileProgress.stage)}
                          {fileProgress.stage === 'uploading' && fileProgress.progress > 0
                            ? ` • ${Math.round(fileProgress.progress)}%`
                            : ''}
                        </p>

                        {/* Progress Bar */}
                        {isActive && (
                          <Progress
                            value={fileProgress.progress}
                            size="xs"
                            variant={isError ? 'error' : 'primary'}
                          />
                        )}

                        {/* Error Message */}
                        {isError && fileProgress.error && (
                          <p className="text-xs text-error mt-2">{fileProgress.error}</p>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-2">
                          {isError && onRetryFile && (
                            <AppButton
                              variant="outline"
                              size="xs"
                              onClick={() => onRetryFile(fileProgress.id)}
                            >
                              Retry
                            </AppButton>
                          )}
                          {onCancelFile && !isComplete && (
                            <AppButton
                              variant="ghost"
                              size="xs"
                              onClick={() => onCancelFile(fileProgress.id)}
                            >
                              Cancel
                            </AppButton>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </AppCard>
    </div>
  );
};
