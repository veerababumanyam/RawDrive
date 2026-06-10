"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import type { UploadItem } from "@/components/upload/upload-progress";
import {
  isActiveUploadStatus,
  useUpload,
  type UploadDestination,
  type UseUploadOptions,
} from "@/hooks/use-upload";
import { getApiBaseUrl } from "@/lib/api/base-url";
import { getStoredAccessToken } from "@/lib/auth";
import { UploadCloud } from "@/components/icons";

type DashboardUploadConfig = {
  ownerKey: string;
  options: UseUploadOptions;
};

type DashboardUploadContextValue = {
  upload: ReturnType<typeof useUpload>;
  configureGalleryUpload: (ownerKey: string, options: UseUploadOptions) => void;
  clearGalleryUpload: (ownerKey: string) => void;
  openFilePicker: (options: DashboardUploadPickerOptions) => void;
  openFolderPicker: (options: DashboardUploadPickerOptions) => void;
};

type UploadItemWithDestination = UploadItem & {
  uploadDestination?: UploadDestination;
};

type DashboardUploadPickerOptions = {
  accept?: string;
  onFilesSelected: (files: File[]) => void;
};

const DashboardUploadContext =
  createContext<DashboardUploadContextValue | null>(null);

export function useDashboardUploadContext() {
  return useContext(DashboardUploadContext);
}

function formatUploadBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

function useUploadSummary(items: UploadItem[]) {
  return useMemo(() => {
    const activeCount = items.filter((item) =>
      isActiveUploadStatus(item.status),
    ).length;
    const completedCount = items.filter(
      (item) => item.status === "complete",
    ).length;
    const failedCount = items.filter((item) => item.status === "error").length;
    const retryableFailedCount = items.filter(
      (item) => item.status === "error" && !item.requiresReselect,
    ).length;
    const blockedCount = items.filter(
      (item) => item.status === "blocked" || item.status === "needs_desktop",
    ).length;
    const progressItems = items.filter(
      (item) =>
        isActiveUploadStatus(item.status) ||
        item.status === "complete" ||
        (item.status === "error" && !item.requiresReselect),
    );
    const bytesTotal = progressItems.reduce(
      (sum, item) => sum + item.file.size,
      0,
    );
    const bytesUploaded = progressItems.reduce(
      (sum, item) =>
        sum +
        Math.floor(
          ((item.status === "complete" ? 100 : item.progress) / 100) *
            item.file.size,
        ),
      0,
    );
    const percent =
      bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
    const sourceGalleryId = items
      .map(
        (item) =>
          (item as UploadItemWithDestination).uploadDestination?.galleryId,
      )
      .find(Boolean);
    const uploadPanelOpen =
      activeCount > 0 || failedCount > 0 || blockedCount > 0;
    const shownCount = progressItems.length;
    const headline =
      activeCount > 0 && shownCount > activeCount
        ? `Uploading ${completedCount + 1} of ${shownCount} files`
        : activeCount > 0
          ? `Uploading ${activeCount} ${activeCount === 1 ? "file" : "files"}`
          : failedCount > 0
            ? `${failedCount} upload${failedCount === 1 ? "" : "s"} failed`
            : blockedCount > 0
              ? `${blockedCount} upload${blockedCount === 1 ? "" : "s"} blocked`
              : `${completedCount} ${completedCount === 1 ? "photo" : "photos"} ready`;

    return {
      activeCount,
      completedCount,
      failedCount,
      retryableFailedCount,
      bytesTotal,
      bytesUploaded,
      percent,
      sourceGalleryId,
      uploadPanelOpen,
      headline,
    };
  }, [items]);
}

function DashboardUploadStatusBar({
  upload,
}: {
  upload: ReturnType<typeof useUpload>;
}) {
  const pathname = usePathname();
  const summary = useUploadSummary(upload.items);
  const isExactGalleryDetail =
    /^\/galleries\/[^/]+$/.test(pathname) ||
    /^\/galleries\/[^/]+\/$/.test(pathname);

  if (!summary.uploadPanelOpen || isExactGalleryDetail) return null;

  return (
    <div
      data-testid="dashboard-upload-status"
      className="fixed inset-x-0 bottom-0 z-[90] border-t border-border-default bg-surface-elevated/95 px-3 py-3 shadow-elevation-1 glass-blur-medium sm:px-6"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
            <UploadCloud className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="truncate text-sm font-semibold text-text-primary">
                {summary.headline}
              </p>
              {summary.bytesTotal > 0 && (
                <span className="text-xs font-medium text-text-secondary">
                  {formatUploadBytes(summary.bytesUploaded)} /{" "}
                  {formatUploadBytes(summary.bytesTotal)} · {summary.percent}%
                </span>
              )}
            </div>
            {summary.bytesTotal > 0 && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${summary.percent}%` }}
                />
              </div>
            )}
            {summary.activeCount > 0 && (
              <p className="mt-1 text-xs text-text-tertiary">
                Upload continues while you use RawDrive. Open Dashboard,
                Messages, Settings, or this gallery; keep this browser tab open
                until uploads finish.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {summary.sourceGalleryId && (
            <Link
              href={`/galleries/${summary.sourceGalleryId}`}
              className="btn-tertiary px-3 py-1.5 text-xs"
            >
              Open gallery
            </Link>
          )}
          {summary.retryableFailedCount > 0 && (
            <button
              type="button"
              onClick={upload.retryAll}
              className="btn-tertiary px-3 py-1.5 text-xs"
            >
              Retry failed
            </button>
          )}
          {summary.activeCount > 0 && (
            <button
              type="button"
              onClick={upload.cancelAll}
              className="btn-tertiary px-3 py-1.5 text-xs"
            >
              Cancel uploads
            </button>
          )}
          {summary.activeCount === 0 && summary.completedCount > 0 && (
            <button
              type="button"
              onClick={upload.clearFinished}
              className="btn-tertiary px-3 py-1.5 text-xs"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function DashboardUploadProvider({ children }: { children: ReactNode }) {
  const apiUrl = useMemo(() => getApiBaseUrl(), []);
  const token = useMemo(() => getStoredAccessToken(), []);
  const [config, setConfig] = useState<DashboardUploadConfig | null>(null);
  const upload = useUpload(apiUrl, token, config?.options);
  const pendingClearOwnerRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const pickerCallbackRef =
    useRef<DashboardUploadPickerOptions["onFilesSelected"] | null>(null);
  const hasActiveUploadsRef = useRef(false);
  const shouldRetainPickerFilesRef = useRef(false);
  const hasActiveUploads = useMemo(
    () => upload.items.some((item) => isActiveUploadStatus(item.status)),
    [upload.items],
  );
  const shouldRetainPickerFiles = useMemo(
    () =>
      upload.items.some(
        (item) =>
          isActiveUploadStatus(item.status) ||
          (item.status === "error" && !item.requiresReselect),
      ),
    [upload.items],
  );

  useEffect(() => {
    hasActiveUploadsRef.current = hasActiveUploads;
  }, [hasActiveUploads]);

  useEffect(() => {
    shouldRetainPickerFilesRef.current = shouldRetainPickerFiles;
  }, [shouldRetainPickerFiles]);

  const configureGalleryUpload = useCallback(
    (ownerKey: string, options: UseUploadOptions) => {
      pendingClearOwnerRef.current = null;
      setConfig({ ownerKey, options });
    },
    [],
  );

  const clearGalleryUpload = useCallback((ownerKey: string) => {
    setConfig((current) => {
      if (current?.ownerKey !== ownerKey) return current;
      const pickerHasFiles =
        Boolean(fileInputRef.current?.files?.length) ||
        Boolean(folderInputRef.current?.files?.length);
      if (
        hasActiveUploadsRef.current ||
        shouldRetainPickerFilesRef.current ||
        pickerHasFiles
      ) {
        pendingClearOwnerRef.current = ownerKey;
        return current;
      }
      pendingClearOwnerRef.current = null;
      return null;
    });
  }, []);

  const handlePickerChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.currentTarget.files ?? []);
      pickerCallbackRef.current?.(files);
      // Keep the FileList mounted in this provider while active/retryable
      // uploads may still need browser-backed read permission.
    },
    [],
  );

  const openProviderPicker = useCallback(
    (
      input: HTMLInputElement | null,
      { accept, onFilesSelected }: DashboardUploadPickerOptions,
    ) => {
      if (!input) return;
      pickerCallbackRef.current = onFilesSelected;
      input.accept = accept ?? "";
      if (!shouldRetainPickerFiles) {
        input.value = "";
      }
      input.click();
    },
    [shouldRetainPickerFiles],
  );

  const openFilePicker = useCallback(
    (options: DashboardUploadPickerOptions) => {
      openProviderPicker(fileInputRef.current, options);
    },
    [openProviderPicker],
  );

  const openFolderPicker = useCallback(
    (options: DashboardUploadPickerOptions) => {
      openProviderPicker(folderInputRef.current, options);
    },
    [openProviderPicker],
  );

  useEffect(() => {
    if (hasActiveUploads || shouldRetainPickerFiles) return;
    pickerCallbackRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
    const ownerKey = pendingClearOwnerRef.current;
    if (!ownerKey) return;
    setConfig((current) => {
      if (current?.ownerKey !== ownerKey) return current;
      pendingClearOwnerRef.current = null;
      return null;
    });
  }, [hasActiveUploads, shouldRetainPickerFiles]);

  const value = useMemo(
    () => ({
      upload,
      configureGalleryUpload,
      clearGalleryUpload,
      openFilePicker,
      openFolderPicker,
    }),
    [
      upload,
      configureGalleryUpload,
      clearGalleryUpload,
      openFilePicker,
      openFolderPicker,
    ],
  );

  return (
    <DashboardUploadContext.Provider value={value}>
      <input
        ref={fileInputRef}
        data-testid="dashboard-upload-file-input"
        className="sr-only"
        type="file"
        multiple
        onChange={handlePickerChange}
      />
      <input
        ref={folderInputRef}
        data-testid="dashboard-upload-folder-input"
        className="sr-only"
        type="file"
        multiple
        {...({ webkitdirectory: "", directory: "" } as Record<
          string,
          string
        >)}
        onChange={handlePickerChange}
      />
      {children}
      <DashboardUploadStatusBar upload={upload} />
    </DashboardUploadContext.Provider>
  );
}
