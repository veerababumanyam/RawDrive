/**
 * XmpImportDialog Component
 * Modal dialog for importing XMP sidecar files to a gallery
 * Feature: 029-pro-review-xmp-sync
 * Task: T050
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  Info,
  AlertTriangle,
  FileUp,
} from 'lucide-react';
import { useXmpSync } from '../../../hooks/useXmpSync';
import type { XmpImportRequest } from '../../../services/xmpSyncService';

export interface XmpImportDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog should close */
  onClose: () => void;
  /** Workspace ID */
  workspaceId: string;
  /** Gallery ID */
  galleryId: string;
  /** Gallery name for display */
  galleryName?: string;
  /** Callback when import completes successfully */
  onImportComplete?: () => void;
}

export const XmpImportDialog: React.FC<XmpImportDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  galleryId,
  galleryName = 'Gallery',
  onImportComplete,
}) => {
  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import options state
  const [matchByRawdriveId, setMatchByRawdriveId] = useState(true);
  const [overwriteExisting, setOverwriteExisting] = useState(true);

  // XMP sync hook
  const {
    importPreview,
    importResult,
    isImporting,
    importProgress,
    importError,
    previewImport,
    executeImport,
    clearImportError,
    clearImportResult,
  } = useXmpSync({
    workspaceId,
    galleryId,
    autoFetchStatus: false,
  });

  // Build import request
  const buildImportRequest = (): XmpImportRequest => ({
    match_by_rawdrive_id: matchByRawdriveId,
    overwrite_existing: overwriteExisting,
  });

  // Handle file selection
  const handleFileSelect = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      clearImportError();
      return;
    }
    setSelectedFile(file);
    clearImportError();
    clearImportResult();

    // Auto-preview when file is selected
    try {
      await previewImport(file, buildImportRequest());
    } catch {
      // Error is handled by the hook
    }
  };

  // Handle file input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Handle drag events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Handle import
  const handleImport = async () => {
    if (!selectedFile) return;

    clearImportError();
    try {
      await executeImport(selectedFile, buildImportRequest());
      // Notify parent of successful import
      onImportComplete?.();
      // Close dialog on success after a short delay
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch {
      // Error is handled by the hook
    }
  };

  // Re-preview when options change
  useEffect(() => {
    if (selectedFile && !isImporting) {
      previewImport(selectedFile, buildImportRequest()).catch(() => {
        // Error handled by hook
      });
    }
  }, [matchByRawdriveId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      clearImportError();
      clearImportResult();
    }
  }, [isOpen, clearImportError, clearImportResult]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isImporting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isImporting, onClose]);

  if (!isOpen) return null;

  const hasPreview = importPreview && selectedFile;
  const isSuccess = importResult && importResult.successfully_imported > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isImporting) {
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-lg bg-surface rounded-xl shadow-2xl border border-border overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="xmp-import-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-secondary">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Upload size={20} className="text-primary" />
            </div>
            <div>
              <h2 id="xmp-import-title" className="text-lg font-semibold text-text-primary">
                Import XMP Files
              </h2>
              <p className="text-sm text-text-secondary">{galleryName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isImporting}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X size={20} className="text-text-tertiary" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">
          {/* File Drop Zone */}
          <div
            className={`
              relative border-2 border-dashed rounded-lg p-6 text-center transition-all
              ${isDragging
                ? 'border-primary bg-primary/5'
                : selectedFile
                  ? 'border-green-500/50 bg-green-500/5'
                  : 'border-border hover:border-primary/50 hover:bg-surface-secondary'
              }
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleInputChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isImporting}
            />
            {selectedFile ? (
              <div className="flex items-center justify-center gap-3">
                <FileText size={24} className="text-green-500" />
                <div className="text-left">
                  <p className="text-sm font-medium text-text-primary">{selectedFile.name}</p>
                  <p className="text-xs text-text-tertiary">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    clearImportResult();
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="p-1 rounded hover:bg-surface-hover"
                  disabled={isImporting}
                >
                  <X size={16} className="text-text-tertiary" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <FileUp size={32} className="mx-auto text-text-tertiary" />
                <p className="text-sm text-text-secondary">
                  Drag & drop a ZIP file here, or click to browse
                </p>
                <p className="text-xs text-text-tertiary">
                  ZIP archive containing XMP sidecar files
                </p>
              </div>
            )}
          </div>

          {/* Import Options */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
              <Info size={16} />
              <span>Import Options</span>
            </div>

            {/* Match by RawDrive ID */}
            <label className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg cursor-pointer hover:bg-surface-hover transition-colors">
              <input
                type="checkbox"
                checked={matchByRawdriveId}
                onChange={(e) => setMatchByRawdriveId(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                disabled={isImporting}
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-text-primary">
                  Match by RawDrive ID
                </span>
                <p className="text-xs text-text-tertiary">
                  Use RawDrive asset IDs in XMP files for accurate matching
                </p>
              </div>
            </label>

            {/* Overwrite existing */}
            <label className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg cursor-pointer hover:bg-surface-hover transition-colors">
              <input
                type="checkbox"
                checked={overwriteExisting}
                onChange={(e) => setOverwriteExisting(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                disabled={isImporting}
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-text-primary">
                  Overwrite existing metadata
                </span>
                <p className="text-xs text-text-tertiary">
                  Replace current ratings, flags, and labels with imported values
                </p>
              </div>
            </label>
          </div>

          {/* Preview */}
          {hasPreview && (
            <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2 mb-3">
                <Info size={16} className="text-primary" />
                <span className="text-sm font-medium text-primary">Import Preview</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-text-tertiary">Total XMP files:</span>
                  <span className="ml-2 font-medium text-text-primary">
                    {importPreview.total_files}
                  </span>
                </div>
                <div>
                  <span className="text-text-tertiary">Matched:</span>
                  <span className="ml-2 font-medium text-green-600 dark:text-green-400">
                    {importPreview.matched_count}
                  </span>
                </div>
                {importPreview.unmatched_count > 0 && (
                  <div className="col-span-2">
                    <span className="text-text-tertiary">Unmatched:</span>
                    <span className="ml-2 font-medium text-amber-600 dark:text-amber-400">
                      {importPreview.unmatched_count}
                    </span>
                  </div>
                )}
              </div>

              {/* Sample changes */}
              {importPreview.changes_preview.length > 0 && (
                <div className="mt-3 pt-3 border-t border-primary/10">
                  <span className="text-xs text-text-tertiary">Sample changes:</span>
                  <div className="mt-2 space-y-1">
                    {importPreview.changes_preview.slice(0, 5).map((change, idx) => (
                      <div
                        key={idx}
                        className="text-xs text-text-secondary flex items-center gap-2"
                      >
                        <FileText size={12} className="text-text-tertiary" />
                        <span className="truncate max-w-[150px]" title={change.filename}>
                          {change.filename}
                        </span>
                        <span className="text-text-tertiary">→</span>
                        {change.rating !== null && change.rating !== undefined && (
                          <span className="text-amber-600 dark:text-amber-400">
                            {change.rating}★
                          </span>
                        )}
                        {change.flag && (
                          <span className="text-green-600 dark:text-green-400">
                            {change.flag}
                          </span>
                        )}
                        {change.color_label && change.color_label !== 'none' && (
                          <span className="text-purple-600 dark:text-purple-400">
                            {change.color_label}
                          </span>
                        )}
                      </div>
                    ))}
                    {importPreview.changes_preview.length > 5 && (
                      <span className="text-xs text-text-tertiary">
                        +{importPreview.changes_preview.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Unmatched files warning */}
              {importPreview.unmatched_files.length > 0 && (
                <div className="mt-3 pt-3 border-t border-primary/10">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs">
                    <AlertTriangle size={14} />
                    <span>Unmatched files (will be skipped):</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {importPreview.unmatched_files.slice(0, 5).map((file) => (
                      <span
                        key={file}
                        className="px-2 py-0.5 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded border border-amber-500/20 truncate max-w-[120px]"
                        title={file}
                      >
                        {file}
                      </span>
                    ))}
                    {importPreview.unmatched_files.length > 5 && (
                      <span className="text-xs text-text-tertiary">
                        +{importPreview.unmatched_files.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Progress */}
          {isImporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">Importing XMP files...</span>
                <span className="font-medium text-primary">{Math.round(importProgress)}%</span>
              </div>
              <div className="h-2 bg-surface-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Success message */}
          {isSuccess && !isImporting && (
            <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle size={18} />
                <span className="text-sm font-medium">Import complete!</span>
              </div>
              <div className="mt-2 text-sm text-text-secondary">
                <span>Successfully imported: </span>
                <span className="font-medium text-green-600 dark:text-green-400">
                  {importResult.successfully_imported}
                </span>
                {importResult.skipped > 0 && (
                  <>
                    <span> | Skipped: </span>
                    <span className="font-medium text-text-tertiary">{importResult.skipped}</span>
                  </>
                )}
                {importResult.failed > 0 && (
                  <>
                    <span> | Failed: </span>
                    <span className="font-medium text-red-600 dark:text-red-400">
                      {importResult.failed}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Error message */}
          {importError && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 rounded-lg text-red-600 dark:text-red-400">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-sm font-medium">Import failed</span>
                <p className="text-xs mt-0.5">{importError}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-surface-secondary">
          <button
            onClick={onClose}
            disabled={isImporting}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={isImporting || !selectedFile || !importPreview?.matched_count}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isImporting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Importing...</span>
              </>
            ) : (
              <>
                <Upload size={16} />
                <span>Import XMP</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default XmpImportDialog;
