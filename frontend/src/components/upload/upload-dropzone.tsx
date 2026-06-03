"use client";

import { useCallback, useRef, useState } from "react";
import { useDropzone, type DropEvent, type FileRejection } from "react-dropzone";
import { STILL_IMAGE_DROPZONE_ACCEPT } from "@/lib/still-image-formats";

interface UploadDropzoneProps {
  onFilesAccepted: (files: File[]) => void;
  maxSize?: number;
  maxFiles?: number;
  disabled?: boolean;
}

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
};

type FileSystemFileEntryLike = FileSystemEntryLike & {
  file: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
};

type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
  createReader: () => {
    readEntries: (
      success: (entries: FileSystemEntryLike[]) => void,
      error?: (error: DOMException) => void,
    ) => void;
  };
};

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntryLike | null;
};

function isDirectoryEntry(entry: FileSystemEntryLike): entry is FileSystemDirectoryEntryLike {
  return entry.isDirectory;
}

function isFileEntry(entry: FileSystemEntryLike): entry is FileSystemFileEntryLike {
  return entry.isFile;
}

async function readEntry(entry: FileSystemEntryLike): Promise<File[]> {
  if (isFileEntry(entry)) {
    return new Promise((resolve, reject) => {
      entry.file((file) => resolve([file]), reject);
    });
  }

  if (!isDirectoryEntry(entry)) {
    return [];
  }

  const reader = entry.createReader();
  const entries: FileSystemEntryLike[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) break;
    entries.push(...batch);
  }

  const nested = await Promise.all(entries.map(readEntry));
  return nested.flat();
}

async function getFilesFromEvent(event: DropEvent): Promise<File[]> {
  const nativeEvent = ("nativeEvent" in event ? event.nativeEvent : event) as Event & {
    dataTransfer?: DataTransfer;
  };
  if (!nativeEvent.dataTransfer) {
    const target = nativeEvent.target as HTMLInputElement | null;
    return Array.from(target?.files ?? []);
  }

  const items = Array.from(nativeEvent.dataTransfer.items ?? []) as DataTransferItemWithEntry[];
  const entries = items
    .map((item) => (item.webkitGetAsEntry?.() ?? null) as FileSystemEntryLike | null)
    .filter((entry): entry is FileSystemEntryLike => entry !== null);

  if (entries.length === 0) {
    return Array.from(nativeEvent.dataTransfer.files ?? []);
  }

  const files = await Promise.all(entries.map(readEntry));
  return files.flat();
}

export function UploadDropzone({
  onFilesAccepted,
  maxSize = 500 * 1024 * 1024,
  maxFiles = 2000,
  disabled = false,
}: UploadDropzoneProps) {
  const [rejections, setRejections] = useState<FileRejection[]>([]);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      setRejections(rejected);
      if (accepted.length > 0) {
        onFilesAccepted(accepted);
      }
    },
    [onFilesAccepted]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept: STILL_IMAGE_DROPZONE_ACCEPT,
      getFilesFromEvent,
      maxSize,
      maxFiles,
      multiple: true,
      disabled,
    });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`
          relative flex flex-col items-center justify-center
          min-h-[200px] rounded-xl border-2 border-dashed p-8
          transition-all duration-200 cursor-pointer
          ${isDragActive && !isDragReject ? "border-accent bg-accent/5 scale-[1.01]" : ""}
          ${isDragReject ? "border-error bg-error/5" : ""}
          ${!isDragActive ? "border-border-default hover:border-accent/50 hover:bg-surface-raised/50" : ""}
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <input {...getInputProps()} />
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          multiple
          // React does not type Chromium's directory picker attributes yet.
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          disabled={disabled}
          onChange={(event) => {
            const selected = Array.from(event.currentTarget.files ?? []);
            if (selected.length > 0) {
              onFilesAccepted(selected);
            }
            event.currentTarget.value = "";
          }}
        />

        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>

          {isDragActive ? (
            <p className="text-sm font-medium text-accent">Drop files here...</p>
          ) : (
            <>
              <p className="text-sm font-medium text-text-primary">
                Drag & drop files, or click to browse
              </p>
              <p className="text-xs text-text-secondary">
                JPEG, PNG, WebP, GIF, HEIC/HEIF, AVIF, and common camera RAW
                (CR2, CR3, NEF, ARW, DNG, ORF, RAF, RW2) upload directly in your
                browser. TIFF and less common RAW formats still need RawDrive
                Desktop. Up to {Math.round(maxSize / 1024 / 1024)}MB per file
              </p>
              <button
                type="button"
                className="rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-border-focus"
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  folderInputRef.current?.click();
                }}
              >
                Select folder
              </button>
            </>
          )}
        </div>
      </div>

      {rejections.length > 0 && (
        <div className="rounded-lg bg-error/10 border border-error/20 p-3 space-y-1">
          {rejections.map(({ file, errors }) => (
            <p key={file.name} className="text-xs text-error">
              <span className="font-medium">{file.name}</span>:{" "}
              {errors.map((e: { message: string }) => e.message).join(", ")}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
