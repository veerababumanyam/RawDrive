/**
 * UploadDropzone Component
 * World-class drag-drop file uploader with folder selection support
 * Supports bulk upload up to 1000 files per batch
 * Generates local thumbnail previews using canvas API
 * Organizes uploads by current gallery and sub-gallery
 */

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Upload, Folder, Image, FileVideo, File, X, Loader2 } from 'lucide-react';
import heic2any from 'heic2any';
import {
  SUPPORTED_IMAGE_MIME_TYPES,
  SUPPORTED_VIDEO_MIME_TYPES,
  SUPPORTED_RAW_EXTENSIONS,
} from '@rawdrive/shared-constants';
import { isRawFileObject } from '@/utils/fileUtils';
import { AppButton } from '../../ui/AppButton';
import { AppCard } from '../../ui/AppCard';
import { SmartUploadSuggestions } from './SmartUploadSuggestions';

export interface UploadDropzoneProps {
  galleryId: string;
  subGalleryId?: string | null;
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  maxSize?: number;
  maxFiles?: number;
  multiple?: boolean;
  className?: string;
}

interface FileWithPreview {
  id: string;
  file: File;
  preview?: string;
  thumbnail?: string;
  error?: string;
}

// Supported file types (imported from shared constants)
const SUPPORTED_IMAGE_TYPES = SUPPORTED_IMAGE_MIME_TYPES;
const SUPPORTED_RAW_TYPES = SUPPORTED_RAW_EXTENSIONS.map(ext => `.${ext}`);
const SUPPORTED_VIDEO_TYPES = SUPPORTED_VIDEO_MIME_TYPES;

// Check if file is HEIC/HEIF format
function isHeicFile(file: File): boolean {
  const ext = file.name.toLowerCase();
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    ext.endsWith('.heic') ||
    ext.endsWith('.heif')
  );
}

// Convert HEIC to JPEG blob for preview generation
async function convertHeicToJpeg(file: File): Promise<Blob> {
  const result = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.8,
  });
  // heic2any can return array for multi-image HEIC, take first
  return Array.isArray(result) ? result[0] : result;
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Generate thumbnail preview using canvas API
// Handles HEIC/HEIF conversion automatically
async function generateThumbnail(file: File, maxSize: number = 200): Promise<string> {
  // Convert HEIC to JPEG first if needed
  let fileToProcess: Blob = file;
  if (isHeicFile(file)) {
    try {
      fileToProcess = await convertHeicToJpeg(file);
    } catch (heicError) {
      console.warn('HEIC conversion failed, skipping preview:', file.name, heicError);
      throw new Error('HEIC conversion failed');
    }
  }

  return new Promise((resolve, reject) => {
    // After HEIC conversion, fileToProcess is a JPEG Blob, so check original file
    if (!file.type.startsWith('image/') && !isHeicFile(file)) {
      reject(new Error('Not an image file'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate thumbnail dimensions (maintain aspect ratio)
        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(fileToProcess);
  });
}

// Validate file type
function isValidFileType(file: File, accept?: string): boolean {
  if (!accept) {
    // Default: check against all supported types
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return (
      (SUPPORTED_IMAGE_TYPES as unknown as string[]).includes(file.type) ||
      (SUPPORTED_VIDEO_TYPES as unknown as string[]).includes(file.type) ||
      (SUPPORTED_RAW_TYPES as unknown as string[]).includes(ext!)
    );
  }

  const acceptedTypes = accept.split(',').map((t) => t.trim());
  return acceptedTypes.some((type) => {
    if (type.startsWith('.')) {
      return file.name.toLowerCase().endsWith(type.toLowerCase());
    }
    if (type.endsWith('/*')) {
      return file.type.startsWith(type.replace('/*', '/'));
    }
    return file.type === type;
  });
}

export const UploadDropzone = React.memo<UploadDropzoneProps>(({
  galleryId: _galleryId,
  subGalleryId: _subGalleryId,
  onFilesSelected,
  accept,
  maxSize = 100 * 1024 * 1024, // 100MB default
  maxFiles = 1000,
  multiple = true,
  className = '',
}) => {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Smart Suggestions state
  const [suggestionFiles, setSuggestionFiles] = useState<File[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Validate file
  const validateFile = useCallback(
    (file: File): string | null => {
      if (maxSize && file.size > maxSize) {
        return `File size exceeds ${formatFileSize(maxSize)}`;
      }
      if (!isValidFileType(file, accept)) {
        return 'File type not supported';
      }
      return null;
    },
    [maxSize, accept]
  );

  // Process files and add to upload queue
  const confirmProcessFiles = useCallback(async (filesToProcess: File[]) => {
    setIsProcessing(true);
    setShowSuggestions(false);
    setSuggestionFiles([]);

    const newFiles: FileWithPreview[] = [];

    // Process files in parallel (with concurrency limit for preview generation)
    const processBatch = async (batch: File[]) => {
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          const error = validateFile(file);
          if (error) {
            return {
              id: Math.random().toString(36).substring(7) + Date.now(),
              file,
              error
            };
          }

          const fileWithPreview: FileWithPreview = {
            id: Math.random().toString(36).substring(7) + Date.now(),
            file
          };

          // Generate thumbnail preview for images (excluding RAW files)
          // RAW files cannot be previewed in browser - backend will handle
          const isRaw = isRawFileObject(file);

          if ((file.type.startsWith('image/') || isHeicFile(file)) && !isRaw) {
            try {
              fileWithPreview.thumbnail = await generateThumbnail(file, 200);
              fileWithPreview.preview = URL.createObjectURL(file);
            } catch (err) {
              // Preview generation failed, but file is still valid
              console.warn('Failed to generate preview for', file.name, err);
            }
          } else if (isRaw) {
            // RAW files: no browser preview, will be processed server-side
            console.debug(`RAW file detected: ${file.name}, skipping browser preview`);
          }

          return fileWithPreview;
        })
      );

      return results.map((result) => {
        if (result.status === 'fulfilled') {
          return result.value;
        }
        return {
          id: Math.random().toString(36).substring(7) + Date.now(),
          file: batch[0],
          error: 'Failed to process file'
        };
      });
    };

    // Process in batches of 10 to avoid overwhelming the browser
    const batchSize = 10;
    for (let i = 0; i < filesToProcess.length; i += batchSize) {
      const batch = filesToProcess.slice(i, i + batchSize);
      const processed = await processBatch(batch);
      newFiles.push(...processed);
    }

    setFiles((prev) => [...prev, ...newFiles]);
    setIsProcessing(false);

    // Notify parent of selected files
    const validFiles = newFiles.filter((f) => !f.error).map((f) => f.file);
    if (validFiles.length > 0) {
      onFilesSelected(validFiles);
    }
  }, [validateFile, onFilesSelected]);

  // Process files and generate previews
  const processFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const fileArray = Array.from(fileList);

      // Check max files limit
      const availableSlots = maxFiles - files.length;
      const filesToProcess = fileArray.slice(0, availableSlots);

      if (filesToProcess.length === 0) {
        return;
      }

      // Process files directly - SmartUploadSuggestions disabled to ensure
      // immediate feedback via upload progress panel
      // TODO: Re-implement SmartUploadSuggestions as non-blocking feature
      confirmProcessFiles(filesToProcess);
    },
    [files.length, maxFiles, confirmProcessFiles]
  );

  // Handle folder selection (webkitdirectory)
  const handleFolderSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        // Folder selection returns a flat list of files with relativePath
        await processFiles(e.target.files);
        e.target.value = '';
      }
    },
    [processFiles]
  );

  // Handle file selection
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        await processFiles(e.target.files);
        e.target.value = '';
      }
    },
    [processFiles]
  );

  // Remove file
  const removeFile = useCallback((index: number) => {
    setFiles((prev) => {
      const file = prev[index];
      // Revoke object URL to prevent memory leak
      if (file.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // Clear all files
  const clearAll = useCallback(() => {
    files.forEach((file) => {
      if (file.preview) {
        URL.revokeObjectURL(file.preview);
      }
    });
    setFiles([]);
  }, [files]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  // Recursively scan directory entry
  const scanEntry = async (entry: FileSystemEntry): Promise<File[]> => {
    if (entry.isFile) {
      return new Promise((resolve) => {
        (entry as FileSystemFileEntry).file((file) => resolve([file]));
      });
    } else if (entry.isDirectory) {
      const dirReader = (entry as FileSystemDirectoryEntry).createReader();
      return new Promise((resolve) => {
        dirReader.readEntries(async (entries) => {
          const files = await Promise.all(entries.map(scanEntry));
          resolve(files.flat());
        });
      });
    }
    return [];
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const items = e.dataTransfer.items;
      const droppedFiles: File[] = [];

      // Handle both files and directory drops
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            const files = await scanEntry(entry);
            droppedFiles.push(...files);
          }
        }
      }

      // Also check dataTransfer.files as fallback if webkitGetAsEntry failed or empty
      if (droppedFiles.length === 0 && e.dataTransfer.files.length > 0) {
        await processFiles(e.dataTransfer.files);
      } else if (droppedFiles.length > 0) {
        await processFiles(droppedFiles);
      }
    },
    [processFiles]
  );

  // Get file icon
  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return Image;
    if (file.type.startsWith('video/')) return FileVideo;
    return File;
  };

  // Statistics
  const stats = useMemo(() => {
    const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
    const validFiles = files.filter((f) => !f.error);
    const errorFiles = files.filter((f) => f.error);
    return {
      total: files.length,
      valid: validFiles.length,
      errors: errorFiles.length,
      totalSize,
    };
  }, [files]);

  const handleSuggestionApply = useCallback((type: 'date' | 'camera' | 'quality', action: string) => {
    if (type === 'date' && action === 'group') {
      // Group files by date
      const processedFiles = suggestionFiles.map((file) => {
        const date = new Date(file.lastModified);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const folderName = `${year}-${month}-${day}`;

        // Create a new property or override webkitRelativePath if possible
        // Note: webkitRelativePath is read-only in some browsers, so we use Object.defineProperty
        try {
          Object.defineProperty(file, 'webkitRelativePath', {
            value: `${folderName}/${file.name}`,
            writable: false,
            configurable: true,
            enumerable: true,
          });
        } catch (e) {
          console.warn('Failed to set relative path for file:', file.name);
        }
        return file;
      });
      confirmProcessFiles(processedFiles);
    } else if (type === 'quality' && action === 'review') {
      // For review, we add them but they will appear in the list where user can remove them
      // We could ideally highlight them, but for now standard process is sufficient
      confirmProcessFiles(suggestionFiles);
    } else {
      confirmProcessFiles(suggestionFiles);
    }
  }, [suggestionFiles, confirmProcessFiles]);

  const handleSuggestionDismiss = useCallback(() => {
    confirmProcessFiles(suggestionFiles);
  }, [suggestionFiles, confirmProcessFiles]);

  return (
    <div className={className}>
      {/* Smart Suggestions Interstitial */}
      {showSuggestions && suggestionFiles.length > 0 && (
        <div className="mb-4">
          <SmartUploadSuggestions
            files={suggestionFiles}
            onApplySuggestion={handleSuggestionApply}
            onDismiss={handleSuggestionDismiss}
          />
        </div>
      )}

      {/* Drop Zone */}
      <AppCard
        padding="lg"
        className={`
          relative border-2 border-dashed rounded-card
          transition-all duration-200 ease-out
          ${isDragOver
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-primary/50'
          }
          ${isProcessing ? 'opacity-50 pointer-events-none' : ''}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload size={28} className="text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">
            {isDragOver ? 'Drop files here' : 'Drag & drop or tap to select'}
          </h3>
          <p className="text-text-secondary text-sm mb-4">or</p>
          <div className="flex items-center gap-3">
            <AppButton
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={isProcessing}
            >
              <File size={16} className="mr-2" />
              Select Files
            </AppButton>
            <AppButton
              variant="outline"
              onClick={() => folderInputRef.current?.click()}
              disabled={isProcessing}
            >
              <Folder size={16} className="mr-2" />
              Select Folder
            </AppButton>
          </div>
          <p className="text-xs text-text-tertiary mt-4">
            Supports: JPEG, PNG, WebP, HEIC, RAW (CR2, NEF, ARW, RAF, ORF, RW2, DNG), MP4, MOV
            {maxSize && ` • Max photo: ${formatFileSize(maxSize)}, RAW: 200MB`}
            {maxFiles && ` • Max files: ${maxFiles}`}
          </p>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={inputRef}
          type="file"
          accept={accept || SUPPORTED_IMAGE_TYPES.join(',') + ',' + SUPPORTED_VIDEO_TYPES.join(',') + ',' + SUPPORTED_RAW_TYPES.join(',')}
          multiple={multiple}
          onChange={handleFileSelect}
          className="sr-only"
          aria-label="File upload input"
        />
        <input
          ref={folderInputRef}
          type="file"
          {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
          multiple={multiple}
          onChange={handleFolderSelect}
          className="sr-only"
          aria-label="Folder upload input"
        />
      </AppCard>

      {/* File List with Thumbnails */}
      {files.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-sm font-semibold text-text-primary">
                {stats.valid} file{stats.valid !== 1 ? 's' : ''} selected
                {stats.errors > 0 && (
                  <span className="text-error ml-2">({stats.errors} error{stats.errors !== 1 ? 's' : ''})</span>
                )}
              </h4>
              <p className="text-xs text-text-tertiary mt-1">
                Total size: {formatFileSize(stats.totalSize)}
              </p>
            </div>
            <AppButton variant="ghost" size="sm" onClick={clearAll}>
              Clear All
            </AppButton>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto">
            {files.map((fileWithPreview, index) => {
              const FileIcon = getFileIcon(fileWithPreview.file);
              return (
                <AppCard
                  key={fileWithPreview.id}
                  padding="sm"
                  className="relative group"
                >
                  {/* Thumbnail Preview */}
                  {fileWithPreview.thumbnail ? (
                    <div className="aspect-square rounded-lg overflow-hidden bg-surface-hover mb-2">
                      <img
                        src={fileWithPreview.thumbnail}
                        alt={fileWithPreview.file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="aspect-square rounded-lg bg-surface-hover mb-2 flex items-center justify-center">
                      <FileIcon size={32} className="text-text-tertiary" />
                    </div>
                  )}

                  {/* File Info */}
                  <div className="min-h-[60px]">
                    <p className="text-xs font-medium text-text-primary truncate mb-1">
                      {fileWithPreview.file.name}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {formatFileSize(fileWithPreview.file.size)}
                    </p>
                    {fileWithPreview.error && (
                      <p className="text-xs text-error mt-1">{fileWithPreview.error}</p>
                    )}
                  </div>

                  {/* Remove Button */}
                  <button
                    onClick={() => removeFile(index)}
                    className="
                      absolute top-2 right-2
                      p-1 rounded-full
                      bg-surface/90 backdrop-blur-sm
                      opacity-0 group-hover:opacity-100
                      transition-opacity
                      touch-target
                      hover:bg-error/20
                    "
                    aria-label="Remove file"
                  >
                    <X size={14} className="text-text-tertiary hover:text-error" />
                  </button>
                </AppCard>
              );
            })}
          </div>
        </div>
      )}

      {/* Processing Indicator */}
      {isProcessing && (
        <div className="mt-4 flex items-center justify-center gap-2 text-text-secondary">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Processing files...</span>
        </div>
      )}
    </div>
  );
});

// Display name for debugging
UploadDropzone.displayName = 'UploadDropzone';

