"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";

interface UploadDropzoneProps {
  onFilesAccepted: (files: File[]) => void;
  maxSize?: number;
  maxFiles?: number;
  disabled?: boolean;
}

const ACCEPTED_TYPES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/tiff": [".tiff", ".tif"],
  "image/webp": [".webp"],
  "image/heic": [".heic", ".heif"],
  "image/x-canon-cr2": [".cr2"],
  "image/x-nikon-nef": [".nef"],
  "image/x-sony-arw": [".arw"],
  "image/x-adobe-dng": [".dng"],
  "image/x-fuji-raf": [".raf"],
};

export function UploadDropzone({
  onFilesAccepted,
  maxSize = 500 * 1024 * 1024,
  maxFiles = 100,
  disabled = false,
}: UploadDropzoneProps) {
  const [rejections, setRejections] = useState<FileRejection[]>([]);

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
      accept: ACCEPTED_TYPES,
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
                JPEG, PNG, TIFF, RAW (CR2, NEF, ARW, DNG, RAF) — up to{" "}
                {Math.round(maxSize / 1024 / 1024)}MB per file
              </p>
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
