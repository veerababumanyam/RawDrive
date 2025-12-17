import React, { useState, useRef, useCallback, useId } from 'react';
import { Upload, X, File, Image, FileVideo, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Progress } from './Progress';

/* =============================================================================
   FileUploader Component

   A drag-and-drop file uploader with progress tracking, preview,
   and validation support.
   ============================================================================= */

export interface UploadFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  preview?: string;
}

export interface FileUploaderProps {
  /** Accepted file types (e.g., "image/*", ".pdf") */
  accept?: string;
  /** Allow multiple files */
  multiple?: boolean;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Maximum number of files */
  maxFiles?: number;
  /** Upload handler - called for each file */
  onUpload?: (file: File) => Promise<void>;
  /** Files change handler */
  onFilesChange?: (files: UploadFile[]) => void;
  /** File removal handler */
  onRemove?: (file: UploadFile) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Show file list */
  showFileList?: boolean;
  /** Compact mode (smaller drop zone) */
  compact?: boolean;
  /** Custom drop zone content */
  children?: React.ReactNode;
  className?: string;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return Image;
  if (type.startsWith('video/')) return FileVideo;
  return File;
};

export const FileUploader: React.FC<FileUploaderProps> = ({
  accept,
  multiple = true,
  maxSize = 100 * 1024 * 1024, // 100MB default
  maxFiles = 50,
  onUpload,
  onFilesChange,
  onRemove,
  disabled = false,
  showFileList = true,
  compact = false,
  children,
  className = '',
}) => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  // Validate file
  const validateFile = useCallback(
    (file: File): string | null => {
      if (maxSize && file.size > maxSize) {
        return `File size exceeds ${formatFileSize(maxSize)}`;
      }
      if (accept) {
        const acceptedTypes = accept.split(',').map((t) => t.trim());
        const isAccepted = acceptedTypes.some((type) => {
          if (type.startsWith('.')) {
            return file.name.toLowerCase().endsWith(type.toLowerCase());
          }
          if (type.endsWith('/*')) {
            return file.type.startsWith(type.replace('/*', '/'));
          }
          return file.type === type;
        });
        if (!isAccepted) {
          return 'File type not accepted';
        }
      }
      return null;
    },
    [accept, maxSize]
  );

  // Process files
  const processFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const newFiles: UploadFile[] = [];
      const fileArray = Array.from(fileList);

      // Check max files
      const availableSlots = maxFiles - files.length;
      const filesToProcess = fileArray.slice(0, availableSlots);

      for (const file of filesToProcess) {
        const error = validateFile(file);
        const uploadFile: UploadFile = {
          id: Math.random().toString(36).substring(2, 9),
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          progress: 0,
          status: error ? 'error' : 'pending',
          error: error || undefined,
        };

        // Generate preview for images
        if (file.type.startsWith('image/') && !error) {
          uploadFile.preview = URL.createObjectURL(file);
        }

        newFiles.push(uploadFile);
      }

      const updatedFiles = [...files, ...newFiles];
      setFiles(updatedFiles);
      onFilesChange?.(updatedFiles);

      // Start uploads for valid files
      for (const uploadFile of newFiles) {
        if (uploadFile.status === 'pending' && onUpload) {
          await uploadSingleFile(uploadFile);
        }
      }
    },
    [files, maxFiles, validateFile, onFilesChange, onUpload]
  );

  // Upload single file
  const uploadSingleFile = async (uploadFile: UploadFile) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === uploadFile.id ? { ...f, status: 'uploading' as const } : f
      )
    );

    try {
      // Simulate progress (replace with actual upload logic)
      for (let progress = 0; progress <= 100; progress += 10) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id ? { ...f, progress } : f
          )
        );
      }

      if (onUpload) {
        await onUpload(uploadFile.file);
      }

      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? { ...f, status: 'success' as const, progress: 100 } : f
        )
      );
    } catch (error) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? {
                ...f,
                status: 'error' as const,
                error: error instanceof Error ? error.message : 'Upload failed',
              }
            : f
        )
      );
    }
  };

  // Remove file
  const removeFile = useCallback(
    (fileId: string) => {
      const fileToRemove = files.find((f) => f.id === fileId);
      if (fileToRemove?.preview) {
        URL.revokeObjectURL(fileToRemove.preview);
      }

      const updatedFiles = files.filter((f) => f.id !== fileId);
      setFiles(updatedFiles);
      onFilesChange?.(updatedFiles);

      if (fileToRemove) {
        onRemove?.(fileToRemove);
      }
    },
    [files, onFilesChange, onRemove]
  );

  // Drag handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (disabled) return;

      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles.length > 0) {
        processFiles(droppedFiles);
      }
    },
    [disabled, processFiles]
  );

  // Click to upload
  const handleClick = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  // File input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = ''; // Reset for same file selection
    }
  };

  return (
    <div className={className}>
      {/* Drop Zone */}
      <div
        className={`
          relative
          border-2 border-dashed rounded-xl
          transition-all duration-200 ease-out
          ${isDragOver
            ? 'border-primary bg-primary-50 dark:bg-primary-900/20'
            : 'border-border hover:border-primary/50'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${compact ? 'p-4' : 'p-8'}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        aria-disabled={disabled}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleInputChange}
          disabled={disabled}
          className="sr-only"
          aria-label="File upload input"
        />

        {children || (
          <div className="flex flex-col items-center text-center">
            <div
              className={`
                ${compact ? 'w-10 h-10 mb-2' : 'w-14 h-14 mb-4'}
                rounded-full
                bg-primary-100 dark:bg-primary-900/30
                flex items-center justify-center
              `}
            >
              <Upload
                size={compact ? 20 : 24}
                className="text-primary"
              />
            </div>
            <p className={`font-medium text-text-primary ${compact ? 'text-sm' : ''}`}>
              {isDragOver ? 'Drop files here' : 'Drag & drop files here'}
            </p>
            <p className={`text-text-secondary mt-1 ${compact ? 'text-xs' : 'text-sm'}`}>
              or click to browse
            </p>
            {!compact && (
              <p className="text-xs text-text-tertiary mt-2">
                {accept && `Accepted: ${accept}`}
                {accept && maxSize && ' • '}
                {maxSize && `Max size: ${formatFileSize(maxSize)}`}
              </p>
            )}
          </div>
        )}
      </div>

      {/* File List */}
      {showFileList && files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map((file) => (
            <FileItem
              key={file.id}
              file={file}
              onRemove={() => removeFile(file.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/* =============================================================================
   FileItem Component
   ============================================================================= */

interface FileItemProps {
  file: UploadFile;
  onRemove: () => void;
}

const FileItem: React.FC<FileItemProps> = ({ file, onRemove }) => {
  const Icon = getFileIcon(file.type);

  return (
    <div
      className={`
        flex items-center gap-3
        p-3
        bg-surface
        border border-border
        rounded-lg
        ${file.status === 'error' ? 'border-error bg-error-50 dark:bg-error-900/10' : ''}
      `}
    >
      {/* Preview or Icon */}
      {file.preview ? (
        <img
          src={file.preview}
          alt={file.name}
          className="w-10 h-10 rounded object-cover"
        />
      ) : (
        <div className="w-10 h-10 rounded bg-background-alt flex items-center justify-center">
          <Icon size={20} className="text-text-tertiary" />
        </div>
      )}

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">
          {file.name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-text-tertiary">
            {formatFileSize(file.size)}
          </span>
          {file.error && (
            <span className="text-xs text-error">{file.error}</span>
          )}
        </div>

        {/* Progress bar */}
        {file.status === 'uploading' && (
          <Progress
            value={file.progress}
            size="xs"
            className="mt-2"
          />
        )}
      </div>

      {/* Status / Actions */}
      <div className="flex-shrink-0">
        {file.status === 'uploading' && (
          <Loader2 size={18} className="text-primary animate-spin" />
        )}
        {file.status === 'success' && (
          <CheckCircle size={18} className="text-success" />
        )}
        {file.status === 'error' && (
          <AlertCircle size={18} className="text-error" />
        )}
        {(file.status === 'pending' || file.status === 'error') && (
          <button
            onClick={onRemove}
            className="
              p-1
              rounded
              text-text-tertiary
              hover:text-text-primary hover:bg-surface-hover
              transition-colors
            "
            aria-label={`Remove ${file.name}`}
          >
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
};

/* =============================================================================
   DropZone Component (Simple version)
   ============================================================================= */

export interface DropZoneProps {
  onDrop: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onDrop,
  accept,
  multiple = true,
  disabled = false,
  children,
  className = '',
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!disabled && e.dataTransfer.files.length > 0) {
      onDrop(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div
      className={`
        relative
        ${isDragOver ? 'ring-2 ring-primary ring-offset-2' : ''}
        ${disabled ? 'opacity-50 pointer-events-none' : ''}
        ${className}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          if (e.target.files) {
            onDrop(Array.from(e.target.files));
            e.target.value = '';
          }
        }}
        className="sr-only"
      />
      {children}
    </div>
  );
};

export default FileUploader;
