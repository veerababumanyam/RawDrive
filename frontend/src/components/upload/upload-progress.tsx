"use client";

export interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "complete" | "error";
  error?: string;
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
              </p>
            </div>

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

            {(item.status === "pending" || item.status === "uploading") && onCancel && (
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
