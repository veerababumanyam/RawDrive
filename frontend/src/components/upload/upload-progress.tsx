"use client";

import type { ScanManifest } from "@/lib/upload-screening/types";

export interface UploadItem {
  id: string;
  file: File;
  progress: number;
  /**
   * M16 E47-S4: added "screening", "blocked", "needs_desktop" states so
   * the UI can distinguish the local pre-flight from the network upload
   * phase and show a different message for each rejection mode.
   */
  status:
    | "pending"
    | "screening"
    | "encrypting"
    | "paused"
    | "uploading"
    | "complete"
    | "error"
    | "blocked"
    | "needs_desktop";
  error?: string;
  /** M16: the scan manifest produced by the local screener. Present once
   *  screening finishes regardless of decision. Used by the UI to render
   *  finding details and by the upload hook to attach to the session
   *  create payload. */
  scanManifest?: ScanManifest;
  /** Asset UUID returned by the backend on finalization. Set once upload
   *  is complete so callers (e.g. gallery page) can link the asset. */
  assetId?: string;
}

interface UploadProgressProps {
  items: UploadItem[];
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
}

export function UploadProgress({ items, onCancel, onRetry }: UploadProgressProps) {
  if (items.length === 0) return null;

  const completed = items.filter((i) => i.status === "complete").length;
  const total = items.length;
  const overallProgress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Overall progress */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-secondary">
          {completed}/{total} files uploaded
        </span>
        <span className="font-medium text-text-primary">{overallProgress}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${overallProgress}%` }}
        />
      </div>

      {/* Per-file progress */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-lg bg-surface-raised/50 px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {item.file.name}
              </p>
              <p className="text-xs text-text-secondary">
                {(item.file.size / 1024 / 1024).toFixed(1)} MB
                {item.status === "screening" && " • screening…"}
                {item.status === "encrypting" && " • encrypting…"}
                {item.status === "paused" && " • paused"}
                {item.status === "blocked" && item.error && ` • ${item.error}`}
                {item.status === "needs_desktop" &&
                  ` • ${item.error ?? "requires RawDrive Desktop"}`}
              </p>
            </div>

            {item.status === "screening" && (
              <span className="text-xs font-medium text-text-secondary">
                Screening
              </span>
            )}

            {item.status === "encrypting" && (
              <span className="text-xs font-medium text-text-secondary">
                Encrypting
              </span>
            )}

            {item.status === "paused" && (
              <span className="text-xs font-medium text-warning">
                Paused
              </span>
            )}

            {item.status === "uploading" && (
              <div className="w-20">
                <div className="h-1 rounded-full bg-surface-sunken overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-200"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </div>
            )}

            {item.status === "complete" && (
              <span className="text-xs font-medium text-success">Done</span>
            )}

            {item.status === "blocked" && (
              <span
                className="text-xs font-medium text-error"
                title={item.error}
              >
                Blocked
              </span>
            )}

            {item.status === "needs_desktop" && (
              <span className="text-xs font-medium text-warning">
                Desktop required
              </span>
            )}

            {item.status === "error" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-error">Failed</span>
                {onRetry && (
                  <button
                    onClick={() => onRetry(item.id)}
                    className="text-xs text-accent hover:underline"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            {(item.status === "pending" ||
              item.status === "screening" ||
              item.status === "encrypting" ||
              item.status === "paused" ||
              item.status === "uploading") &&
              onCancel && (
                <button
                  onClick={() => onCancel(item.id)}
                  className="text-xs text-text-secondary hover:text-error"
                >
                  Cancel
                </button>
              )}
          </div>
        ))}
      </div>
    </div>
  );
}
