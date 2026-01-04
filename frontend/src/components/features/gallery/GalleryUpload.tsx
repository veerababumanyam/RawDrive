/**
 * GalleryUpload Component
 * Secure file upload component with resumable upload support
 * Implements SHA256 checksum verification and progress tracking
 */

import React, { useCallback, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useUpload } from '../../../hooks/useUpload';
import { UploadDropzone } from '../upload/UploadDropzone';
import { UploadProgressPanel, type UploadFileProgress } from '../upload/UploadProgressPanel';
import { DuplicateDetectionDialog } from '../upload/DuplicateDetectionDialog';
import { DuplicateAssetResponse } from '../../../types/gallery';

export interface GalleryUploadProps {
  galleryId: string;
  subGalleryId?: string | null;
  onUploadComplete?: (assetId: string, fileId: string) => void;
  onUploadError?: (error: Error) => void;
  onBatchComplete?: (completedCount: number, failedCount: number) => void;
  accept?: string;
  maxSize?: number;
  multiple?: boolean;
  className?: string;
}

export const GalleryUpload: React.FC<GalleryUploadProps> = ({
  galleryId,
  subGalleryId,
  onUploadComplete,
  onUploadError,
  onBatchComplete,
  accept,
  maxSize,
  multiple = true,
  className = '',
}) => {
  const { workspace } = useAuth();

  // Duplicate detection state handled via callback from useUpload
  const [duplicateDialog, setDuplicateDialog] = React.useState<{
    isOpen: boolean;
    file: File;
    duplicates: DuplicateAssetResponse[];
  } | null>(null);

  const handleDuplicateDetected = useCallback((file: File, duplicates: DuplicateAssetResponse[]) => {
    setDuplicateDialog({
      isOpen: true,
      file,
      duplicates,
    });
  }, []);

  // Use unified upload hook
  const {
    files,
    progress,
    isUploading,
    isPaused,
    addFiles,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    retryUpload,
    clearCompleted,
  } = useUpload({
    workspaceId: workspace?.workspace_id || '',
    galleryId,
    subGalleryId,
    onComplete: onUploadComplete,
    onError: (err) => onUploadError?.(err),
    onBatchComplete,
    enableDuplicateDetection: true,
    onDuplicateDetected: handleDuplicateDetected
  });

  // Map internal files to Progress Panel format
  const progressFiles: UploadFileProgress[] = files.map(f => ({
    id: f.id,
    file: f.file,
    stage: f.status === 'completed' ? 'complete' :
      f.status === 'error' ? 'error' :
        f.status === 'uploading' ? 'uploading' :
          f.status === 'verifying' ? 'processing' : 'queued',
    progress: f.progress,
    uploadedBytes: f.uploadedBytes,
    totalBytes: f.totalBytes,
    speed: f.speed,
    error: f.error,
    thumbnail: f.thumbnail,
    estimatedTimeRemaining: f.eta
  }));

  // Map internal progress to stats
  const stats = {
    totalFiles: progress.total,
    completedFiles: progress.completed,
    failedFiles: progress.failed,
    totalBytes: progress.totalBytes,
    uploadedBytes: progress.uploadedBytes,
    averageSpeed: progress.averageSpeed
  };

  // Handle files selected from dropzone
  const handleFilesSelected = useCallback(async (selectedFiles: File[]) => {
    // Phase 1: Client-Side Face Detection (Feedback Only)
    // We run this asynchronously so it doesn't block the UI immediately,
    // but practical usage might want to wait or show a "Scanning..." state.
    // For now, we'll log detections to console and potentially show a toast/badge later.
    try {
      const { frontendFaceService } = await import('../../../services/FrontendFaceService');

      // Process first 3 images to avoid freezing browser on bulk upload
      const filesToScan = selectedFiles.slice(0, 3).filter(f => f.type.startsWith('image/'));

      if (filesToScan.length > 0) {
        console.log(`[Face Detection] Scanning ${filesToScan.length} images on client...`);

        await Promise.all(filesToScan.map(async (file) => {
          const img = new Image();
          img.src = URL.createObjectURL(file);
          await img.decode();

          const detections = await frontendFaceService.detectFaces(img);
          console.log(`[Face Detection] File: ${file.name}, Faces Found: ${detections.length}`);

          (file as any).clientMetadata = {
            face_count: detections.length,
            faces: detections.map(d => ({
              score: d.score,
              box: d.box
            })),
            detected_at: new Date().toISOString()
          };

          // Cleanup
          URL.revokeObjectURL(img.src);
        }));
      }
    } catch (e) {
      console.warn('[Face Detection] Client-side detection skipped/failed:', e);
    }

    await addFiles(selectedFiles);
  }, [addFiles]);

  // Handle duplicate dialog actions
  const handleDuplicateSkip = useCallback(() => {
    setDuplicateDialog(null);
  }, []);

  const handleDuplicateReplace = useCallback(async () => {
    if (duplicateDialog) {
      setDuplicateDialog(null);
      // Force add handling would be complex without ignoring checks, 
      // for now we re-add which triggers check again. 
      // Ideally backend handles 'replace' param or we skip check.
      // As a safe fallback for this MVP refactor, we just add it back.
      // A real implementation would pass a flag to addFiles to skip check.
      await addFiles([duplicateDialog.file], true);
    }
  }, [duplicateDialog, addFiles]);

  const handleDuplicateKeepBoth = useCallback(async () => {
    if (duplicateDialog) {
      setDuplicateDialog(null);
      await addFiles([duplicateDialog.file], true);
    }
  }, [duplicateDialog, addFiles]);

  // NOTE: Auto-start removed - useUpload.ts:700-705 handles queue processing automatically.
  // The previous useEffect here caused duplicate uploads when combined with React StrictMode.


  return (
    <div className={className}>
      <UploadDropzone
        galleryId={galleryId}
        subGalleryId={subGalleryId}
        onFilesSelected={handleFilesSelected}
        accept={accept}
        maxSize={maxSize}
        multiple={multiple}
        className="mb-6"
      />

      {files.length > 0 && (
        <UploadProgressPanel
          files={progressFiles}
          stats={stats}
          isPaused={isPaused}
          onPauseResume={isPaused ? resumeUpload : () => pauseUpload()}
          onClearCompleted={clearCompleted}
          onCancelAll={cancelUpload}
          onCancelFile={cancelUpload}
          onRetryFile={retryUpload}
          position="bottom-right"
          className="static w-full max-w-full z-0 mt-4 shadow-none border border-border rounded-lg"
        />
      )}

      {duplicateDialog && (
        <DuplicateDetectionDialog
          isOpen={duplicateDialog.isOpen}
          onClose={handleDuplicateSkip}
          duplicates={duplicateDialog.duplicates}
          newFile={duplicateDialog.file}
          onSkip={handleDuplicateSkip}
          onReplace={handleDuplicateReplace}
          onKeepBoth={handleDuplicateKeepBoth}
        />
      )}
    </div>
  );
};
