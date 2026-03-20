/**
 * AIProcessingStatus Component
 * Shows AI processing progress bar with estimated time and per-photo status
 */

import React, { useState } from 'react';
import { CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

export interface PhotoStatus {
  id: string;
  name: string;
  status: 'success' | 'failed' | 'processing';
}

export interface AIProcessingStatusProps {
  galleryId: string;
  totalPhotos: number;
  processedCount: number;
  failedCount: number;
  status: 'idle' | 'processing' | 'complete' | 'partial_failure';
  /** Elapsed processing time in seconds for ETA calculation */
  elapsedSeconds?: number;
  /** Recent per-photo statuses */
  recentPhotos?: PhotoStatus[];
  /** Callback to retry failed photos */
  onRetryFailed?: (galleryId: string) => void;
  className?: string;
}

function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) {
    return `${Math.ceil(seconds)}s remaining`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  if (minutes < 60) {
    return `${minutes}m ${secs}s remaining`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return `${hours}h ${remainingMins}m remaining`;
}

export const AIProcessingStatus: React.FC<AIProcessingStatusProps> = ({
  galleryId,
  totalPhotos,
  processedCount,
  failedCount,
  status,
  elapsedSeconds,
  recentPhotos = [],
  onRetryFailed,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const percentage = totalPhotos > 0
    ? Math.round((processedCount / totalPhotos) * 100)
    : 0;

  // Calculate estimated time remaining
  let estimatedTimeRemaining: string | null = null;
  if (status === 'processing' && elapsedSeconds && processedCount > 0) {
    const timePerPhoto = elapsedSeconds / processedCount;
    const remaining = totalPhotos - processedCount;
    const secondsLeft = timePerPhoto * remaining;
    estimatedTimeRemaining = formatTimeRemaining(secondsLeft);
  }

  const statusIcon = (photoStatus: PhotoStatus['status']) => {
    switch (photoStatus) {
      case 'success':
        return <CheckCircle size={14} className="text-green-500" />;
      case 'failed':
        return <XCircle size={14} className="text-red-500" />;
      case 'processing':
        return <Loader2 size={14} className="text-primary animate-spin" />;
    }
  };

  return (
    <div className={`bg-surface border border-border rounded-lg p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {status === 'processing' && (
            <Loader2 size={16} className="text-primary animate-spin" />
          )}
          {status === 'complete' && (
            <CheckCircle size={16} className="text-green-500" />
          )}
          {status === 'partial_failure' && (
            <XCircle size={16} className="text-amber-500" />
          )}
          {status === 'idle' && (
            <div className="w-4 h-4 rounded-full bg-gray-300" />
          )}
          <span className="text-sm font-medium text-text-primary">
            {status === 'complete' ? 'AI Processing complete' :
             status === 'partial_failure' ? 'AI Processing finished with errors' :
             status === 'idle' ? 'AI Processing' :
             'AI Processing...'}
          </span>
        </div>
        <span className="text-sm font-semibold text-text-primary">{percentage}%</span>
      </div>

      {/* Progress Bar */}
      <div
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2"
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            status === 'complete' ? 'bg-green-500' :
            status === 'partial_failure' ? 'bg-amber-500' :
            'bg-primary'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span>{processedCount} of {totalPhotos} processed</span>
        {estimatedTimeRemaining && (
          <span>{estimatedTimeRemaining}</span>
        )}
      </div>

      {/* Failed Count & Retry */}
      {failedCount > 0 && (
        <div className="flex items-center justify-between mt-2 px-2 py-1.5 bg-red-50 border border-red-200 rounded text-xs">
          <span className="text-red-700">{failedCount} of {totalPhotos} failed</span>
          {onRetryFailed && (
            <button
              onClick={() => onRetryFailed(galleryId)}
              className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 font-medium"
            >
              <RefreshCw size={12} />
              retry
            </button>
          )}
        </div>
      )}

      {/* Collapsible Details */}
      {(status === 'processing' || recentPhotos.length > 0) && (
        <div className="mt-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label="Toggle details"
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span>Details</span>
          </button>

          {isExpanded && (
            <div className="mt-2 space-y-1">
              <div className="text-xs font-medium text-text-secondary mb-1">Per-photo status</div>
              {recentPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="flex items-center gap-2 text-xs text-text-secondary py-0.5"
                >
                  {statusIcon(photo.status)}
                  <span>{photo.name}</span>
                </div>
              ))}
              {recentPhotos.length === 0 && (
                <div className="text-xs text-text-tertiary italic">
                  Processing details will appear here...
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
