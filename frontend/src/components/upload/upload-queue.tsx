"use client";

import type { UploadItem } from "./upload-progress";

interface UploadQueueProps {
  items: UploadItem[];
  onPauseAll?: () => void;
  onResumeAll?: () => void;
  onCancelAll?: () => void;
  isPaused?: boolean;
}

export function UploadQueue({
  items,
  onPauseAll,
  onResumeAll,
  onCancelAll,
  isPaused = false,
}: UploadQueueProps) {
  const uploading = items.filter((i) => i.status === "uploading").length;
  const pending = items.filter((i) => i.status === "pending").length;
  const completed = items.filter((i) => i.status === "complete").length;
  const failed = items.filter((i) => i.status === "error").length;

  if (items.length === 0) return null;

  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-raised px-4 py-3">
      <div className="flex items-center gap-4 text-sm">
        {uploading > 0 && (
          <span className="text-accent font-medium">{uploading} uploading</span>
        )}
        {pending > 0 && (
          <span className="text-text-secondary">{pending} queued</span>
        )}
        {completed > 0 && (
          <span className="text-success">{completed} done</span>
        )}
        {failed > 0 && (
          <span className="text-error">{failed} failed</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isPaused && onResumeAll && (
          <button
            onClick={onResumeAll}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
          >
            Resume All
          </button>
        )}
        {!isPaused && onPauseAll && uploading > 0 && (
          <button
            onClick={onPauseAll}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border-default text-text-secondary hover:bg-surface-sunken transition-colors"
          >
            Pause All
          </button>
        )}
        {onCancelAll && (uploading > 0 || pending > 0) && (
          <button
            onClick={onCancelAll}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-error/30 text-error hover:bg-error/5 transition-colors"
          >
            Cancel All
          </button>
        )}
      </div>
    </div>
  );
}
