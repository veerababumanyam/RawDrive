/**
 * Custom Font Upload Component
 *
 * Provides custom font file upload with drag-and-drop,
 * file validation, progress tracking, and font management.
 *
 * Requirements: 6.3, 6.4
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Upload,
  X,
  FileType,
  AlertTriangle,
  Check,
  Trash2,
  RefreshCw,
  FileWarning,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { fontService, type FontValidationResult } from '@/services/fontService';
import type { CustomFont } from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

export interface CustomFontUploadProps {
  /** Workspace ID for font storage */
  workspaceId: string;
  /** Called when fonts are updated */
  onFontsChange?: (fonts: CustomFont[]) => void;
  /** Maximum number of custom fonts allowed */
  maxFonts?: number;
  /** Optional class name */
  className?: string;
}

interface UploadState {
  file: File;
  fontFamily: string;
  weight: number;
  style: 'normal' | 'italic';
  validation: FontValidationResult;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

// =============================================================================
// Constants
// =============================================================================

const WEIGHT_OPTIONS = [
  { value: 100, label: 'Thin (100)' },
  { value: 200, label: 'Extra Light (200)' },
  { value: 300, label: 'Light (300)' },
  { value: 400, label: 'Regular (400)' },
  { value: 500, label: 'Medium (500)' },
  { value: 600, label: 'Semi Bold (600)' },
  { value: 700, label: 'Bold (700)' },
  { value: 800, label: 'Extra Bold (800)' },
  { value: 900, label: 'Black (900)' },
];

// =============================================================================
// Component
// =============================================================================

export const CustomFontUpload: React.FC<CustomFontUploadProps> = ({
  workspaceId,
  onFontsChange,
  maxFonts = 10,
  className = '',
}) => {
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [deletingFontId, setDeletingFontId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize font service and load fonts
  useEffect(() => {
    fontService.initialize(workspaceId);
    loadCustomFonts();
  }, [workspaceId]);

  const loadCustomFonts = async () => {
    setIsLoading(true);
    try {
      const fonts = await fontService.listCustomFonts();
      setCustomFonts(fonts);
      onFontsChange?.(fonts);
    } catch (error) {
      console.error('Failed to load custom fonts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle file selection
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    const validation = fontService.validateFontFile(file);

    // Extract font family name from filename (remove extension)
    const fontFamily = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

    setUploadState({
      file,
      fontFamily,
      weight: 400,
      style: 'normal',
      validation,
      status: 'pending',
      progress: 0,
    });
  }, []);

  // Handle drag events
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  // Handle upload
  const handleUpload = async () => {
    if (!uploadState || !uploadState.validation.valid) return;

    setUploadState((prev) => (prev ? { ...prev, status: 'uploading', progress: 0 } : null));

    try {
      // Simulate progress (real progress would come from XHR/fetch)
      const progressInterval = setInterval(() => {
        setUploadState((prev) => {
          if (!prev || prev.progress >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return { ...prev, progress: prev.progress + 10 };
        });
      }, 100);

      const response = await fontService.uploadCustomFont(
        uploadState.file,
        uploadState.fontFamily,
        uploadState.weight,
        uploadState.style
      );

      clearInterval(progressInterval);

      if (response.data) {
        setUploadState((prev) => (prev ? { ...prev, status: 'success', progress: 100 } : null));
        const updatedFonts = [...customFonts, response.data];
        setCustomFonts(updatedFonts);
        onFontsChange?.(updatedFonts);

        // Clear upload state after success
        setTimeout(() => {
          setUploadState(null);
        }, 1500);
      } else if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      setUploadState((prev) =>
        prev
          ? {
              ...prev,
              status: 'error',
              error: error instanceof Error ? error.message : 'Upload failed',
            }
          : null
      );
    }
  };

  // Handle delete
  const handleDelete = async (fontId: string) => {
    setDeletingFontId(fontId);
    try {
      await fontService.deleteCustomFont(fontId);
      const updatedFonts = customFonts.filter((f) => f.custom_font_id !== fontId);
      setCustomFonts(updatedFonts);
      onFontsChange?.(updatedFonts);
    } catch (error) {
      console.error('Failed to delete font:', error);
    } finally {
      setDeletingFontId(null);
    }
  };

  // Cancel upload
  const handleCancelUpload = useCallback(() => {
    setUploadState(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const canUpload = customFonts.length < maxFonts;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Upload Area */}
      {canUpload && !uploadState && (
        <div
          className={`
            relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
            ${isDragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'}
          `}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".woff2,.woff,.ttf"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Upload custom font file"
          />

          <Upload className="w-8 h-8 mx-auto text-text-tertiary mb-2" />
          <p className="text-sm font-medium text-text-primary">
            Drag and drop a font file here
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            or click to browse • WOFF2, WOFF, TTF • Max 5MB
          </p>
        </div>
      )}

      {/* Upload limit reached */}
      {!canUpload && !uploadState && (
        <div className="p-4 bg-surface-hover rounded-lg text-center">
          <FileWarning className="w-6 h-6 mx-auto text-warning mb-2" />
          <p className="text-sm text-text-secondary">
            Maximum of {maxFonts} custom fonts reached
          </p>
        </div>
      )}

      {/* Upload Configuration */}
      {uploadState && uploadState.status === 'pending' && (
        <div className="p-4 border border-border rounded-lg space-y-4">
          <div className="flex items-start gap-3">
            <FileType className="w-8 h-8 text-accent flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-text-primary truncate">{uploadState.file.name}</p>
              <p className="text-xs text-text-tertiary">
                {(uploadState.file.size / 1024).toFixed(1)} KB •{' '}
                {uploadState.validation.format?.toUpperCase()}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCancelUpload}
              className="p-1 hover:bg-surface-hover rounded"
              aria-label="Cancel upload"
            >
              <X className="w-4 h-4 text-text-tertiary" />
            </button>
          </div>

          {/* Validation warnings */}
          {uploadState.validation.warnings.length > 0 && (
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                <div className="text-sm text-warning">
                  {uploadState.validation.warnings.map((warning, i) => (
                    <p key={i}>{warning}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Validation errors */}
          {!uploadState.validation.valid && (
            <div className="p-3 bg-error/10 border border-error/20 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-error flex-shrink-0 mt-0.5" />
                <div className="text-sm text-error">
                  {uploadState.validation.errors.map((error, i) => (
                    <p key={i}>{error}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Font configuration */}
          {uploadState.validation.valid && (
            <>
              <div className="space-y-3">
                {/* Font Family Name */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Font Family Name
                  </label>
                  <input
                    type="text"
                    value={uploadState.fontFamily}
                    onChange={(e) =>
                      setUploadState((prev) =>
                        prev ? { ...prev, fontFamily: e.target.value } : null
                      )
                    }
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="Enter font family name"
                  />
                </div>

                {/* Weight and Style */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Weight
                    </label>
                    <select
                      value={uploadState.weight}
                      onChange={(e) =>
                        setUploadState((prev) =>
                          prev ? { ...prev, weight: Number(e.target.value) } : null
                        )
                      }
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-surface"
                    >
                      {WEIGHT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Style
                    </label>
                    <select
                      value={uploadState.style}
                      onChange={(e) =>
                        setUploadState((prev) =>
                          prev
                            ? { ...prev, style: e.target.value as 'normal' | 'italic' }
                            : null
                        )
                      }
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-surface"
                    >
                      <option value="normal">Normal</option>
                      <option value="italic">Italic</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Upload button */}
              <div className="flex gap-2">
                <AppButton
                  variant="primary"
                  className="flex-1"
                  onClick={handleUpload}
                  disabled={!uploadState.fontFamily.trim()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Font
                </AppButton>
                <AppButton variant="outline" onClick={handleCancelUpload}>
                  Cancel
                </AppButton>
              </div>
            </>
          )}
        </div>
      )}

      {/* Upload Progress */}
      {uploadState && uploadState.status === 'uploading' && (
        <div className="p-4 border border-border rounded-lg">
          <div className="flex items-center gap-3 mb-3">
            <RefreshCw className="w-5 h-5 text-accent animate-spin" />
            <span className="text-sm font-medium text-text-primary">Uploading...</span>
          </div>
          <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${uploadState.progress}%` }}
            />
          </div>
          <p className="text-xs text-text-tertiary mt-2 text-right">{uploadState.progress}%</p>
        </div>
      )}

      {/* Upload Success */}
      {uploadState && uploadState.status === 'success' && (
        <div className="p-4 bg-success/10 border border-success/20 rounded-lg">
          <div className="flex items-center gap-3">
            <Check className="w-5 h-5 text-success" />
            <span className="text-sm font-medium text-success">Font uploaded successfully!</span>
          </div>
        </div>
      )}

      {/* Upload Error */}
      {uploadState && uploadState.status === 'error' && (
        <div className="p-4 bg-error/10 border border-error/20 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-error" />
              <span className="text-sm font-medium text-error">
                {uploadState.error || 'Upload failed'}
              </span>
            </div>
            <AppButton variant="outline" size="sm" onClick={handleCancelUpload}>
              Try Again
            </AppButton>
          </div>
        </div>
      )}

      {/* Custom Fonts List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-16 bg-surface-hover rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : customFonts.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Your Custom Fonts ({customFonts.length}/{maxFonts})
          </p>
          {customFonts.map((font) => (
            <div
              key={font.custom_font_id}
              className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-surface-hover transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span
                    className="text-lg font-bold text-accent"
                    style={{ fontFamily: font.font_family }}
                  >
                    Aa
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-text-primary truncate">{font.font_family}</p>
                  <p className="text-xs text-text-tertiary">
                    {font.font_files.length} file{font.font_files.length !== 1 ? 's' : ''} •
                    Uploaded {new Date(font.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(font.custom_font_id)}
                disabled={deletingFontId === font.custom_font_id}
                className="p-2 text-text-tertiary hover:text-error hover:bg-error/10 rounded-lg transition-colors disabled:opacity-50"
                aria-label={`Delete ${font.font_family}`}
              >
                {deletingFontId === font.custom_font_id ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-text-tertiary">
          <FileType className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No custom fonts uploaded yet</p>
        </div>
      )}
    </div>
  );
};

export default CustomFontUpload;
