"use client";

import {
  UploadDropzone,
  UploadProgress,
  UploadQueue,
} from "@/components/upload";
import { useUpload } from "@/hooks/use-upload";
import { getStoredAccessToken } from "@/lib/auth";

export default function UploadPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
  const token = getStoredAccessToken();

  const {
    items,
    addFiles,
    cancel,
    retry,
    cancelAll,
    pauseAll,
    resumeAll,
    isPaused,
  } = useUpload(apiUrl, token);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          Upload Files
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Drag and drop your photos or click to browse. Files upload in 5MB
          chunks with automatic resume.
        </p>
      </div>

      <UploadDropzone onFilesAccepted={addFiles} />
      <UploadQueue
        items={items}
        onCancelAll={cancelAll}
        onPauseAll={pauseAll}
        onResumeAll={resumeAll}
        isPaused={isPaused}
      />
      <UploadProgress items={items} onCancel={cancel} onRetry={retry} />
    </div>
  );
}
