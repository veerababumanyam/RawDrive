/**
 * ExportDialog Component
 *
 * Modal dialog for creating gallery exports with format selection
 * and configuration options.
 */

import React, { useState, useMemo } from 'react';
import {
  ExportFormat,
  ImageResolution,
  PDFLayoutStyle,
  PDFPageSize,
  SlideshowTransition,
  SlideshowQuality,
} from '@rawdrive/shared-types';
import { useGalleryExport } from '@/hooks/useGalleryExport';
import { AppButton } from '@/components/ui/AppButton';

// Icons
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  DocumentIcon,
  FilmIcon,
  CloudIcon,
  PhotoIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  galleryId: string;
  galleryTitle?: string;
  assetCount?: number;
  selectedAssetIds?: string[];
  selectedSubGalleryIds?: string[];
}

type FormatCategory = 'download' | 'album' | 'video' | 'cloud';

interface FormatOption {
  value: ExportFormat;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: FormatCategory;
  available: boolean;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: 'zip',
    label: 'ZIP Archive',
    description: 'Download all photos as a ZIP file',
    icon: <ArrowDownTrayIcon className="h-6 w-6" />,
    category: 'download',
    available: true,
  },
  {
    value: 'pdf_album',
    label: 'PDF Album',
    description: 'Print-ready album with layouts',
    icon: <DocumentIcon className="h-6 w-6" />,
    category: 'album',
    available: false, // Coming soon
  },
  {
    value: 'slideshow_mp4',
    label: 'Slideshow (MP4)',
    description: 'Animated video slideshow',
    icon: <FilmIcon className="h-6 w-6" />,
    category: 'video',
    available: false, // Coming soon
  },
  {
    value: 'slideshow_webm',
    label: 'Slideshow (WebM)',
    description: 'Web-optimized video slideshow',
    icon: <FilmIcon className="h-6 w-6" />,
    category: 'video',
    available: false, // Coming soon
  },
  {
    value: 'cloud_google_photos',
    label: 'Google Photos',
    description: 'Sync to Google Photos',
    icon: <CloudIcon className="h-6 w-6" />,
    category: 'cloud',
    available: false, // Coming soon
  },
  {
    value: 'cloud_amazon_photos',
    label: 'Amazon Photos',
    description: 'Sync to Amazon Photos',
    icon: <CloudIcon className="h-6 w-6" />,
    category: 'cloud',
    available: false, // Coming soon
  },
  {
    value: 'cloud_dropbox',
    label: 'Dropbox',
    description: 'Sync to Dropbox',
    icon: <CloudIcon className="h-6 w-6" />,
    category: 'cloud',
    available: false, // Coming soon
  },
];

const RESOLUTION_OPTIONS: { value: ImageResolution; label: string; description: string }[] = [
  { value: 'original', label: 'Original', description: 'Full resolution, largest file size' },
  { value: 'high', label: 'High (4000px)', description: 'Great for printing' },
  { value: 'web', label: 'Web (2048px)', description: 'Optimized for web viewing' },
  { value: 'preview', label: 'Preview (1200px)', description: 'Quick preview quality' },
];

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  galleryId,
  galleryTitle,
  assetCount = 0,
  selectedAssetIds,
  selectedSubGalleryIds,
}) => {
  // State
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('zip');
  const [resolution, setResolution] = useState<ImageResolution>('original');
  const [includeMetadata, setIncludeMetadata] = useState(false);
  const [preserveFilenames, setPreserveFilenames] = useState(true);
  const [includeSubGalleryFolders, setIncludeSubGalleryFolders] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [exportResult, setExportResult] = useState<{
    success: boolean;
    message: string;
    exportId?: string;
  } | null>(null);

  // Hooks
  const { createExport, getDefaultConfig } = useGalleryExport({ workspaceId, galleryId });

  // Derived state
  const selectedOption = useMemo(
    () => FORMAT_OPTIONS.find((opt) => opt.value === selectedFormat),
    [selectedFormat]
  );

  const exportScope = useMemo(() => {
    if (selectedAssetIds?.length) {
      return `${selectedAssetIds.length} selected photos`;
    }
    if (selectedSubGalleryIds?.length) {
      return `${selectedSubGalleryIds.length} sub-galleries`;
    }
    return `${assetCount} photos`;
  }, [selectedAssetIds, selectedSubGalleryIds, assetCount]);

  // Handlers
  const handleSubmit = async () => {
    if (!selectedOption?.available) return;

    setIsSubmitting(true);
    setExportResult(null);

    try {
      const config = {
        ...getDefaultConfig(selectedFormat),
        resolution,
        includeMetadata,
        preserveOriginalFilenames: preserveFilenames,
        includeSubGalleryFolders,
      };

      const result = await createExport({
        galleryId,
        format: selectedFormat,
        config,
        assetIds: selectedAssetIds,
        subGalleryIds: selectedSubGalleryIds,
      });

      setExportResult({
        success: true,
        message: 'Export job created! You will be notified when it\'s ready.',
        exportId: result.exportId,
      });
    } catch (error) {
      setExportResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create export',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setExportResult(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-2xl rounded-xl bg-white shadow-2xl dark:bg-gray-900">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Export Gallery
              </h2>
              {galleryTitle && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {galleryTitle} • {exportScope}
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-800"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4">
            {exportResult ? (
              // Result state
              <div className="py-8 text-center">
                {exportResult.success ? (
                  <>
                    <CheckCircleIcon className="mx-auto h-12 w-12 text-green-500" />
                    <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
                      Export Started
                    </h3>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      {exportResult.message}
                    </p>
                    <div className="mt-6">
                      <AppButton variant="primary" onClick={handleClose}>
                        Done
                      </AppButton>
                    </div>
                  </>
                ) : (
                  <>
                    <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-500" />
                    <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
                      Export Failed
                    </h3>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      {exportResult.message}
                    </p>
                    <div className="mt-6 flex justify-center gap-3">
                      <AppButton variant="secondary" onClick={() => setExportResult(null)}>
                        Try Again
                      </AppButton>
                      <AppButton variant="primary" onClick={handleClose}>
                        Close
                      </AppButton>
                    </div>
                  </>
                )}
              </div>
            ) : (
              // Form state
              <>
                {/* Format Selection */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                    Export Format
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {FORMAT_OPTIONS.filter((opt) => opt.category === 'download' || opt.category === 'album').map(
                      (option) => (
                        <button
                          key={option.value}
                          onClick={() => option.available && setSelectedFormat(option.value)}
                          disabled={!option.available}
                          className={`relative flex flex-col items-center rounded-lg border-2 p-4 text-center transition-colors ${
                            selectedFormat === option.value
                              ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20'
                              : option.available
                              ? 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                              : 'cursor-not-allowed border-gray-100 opacity-50 dark:border-gray-800'
                          }`}
                        >
                          <div
                            className={`${
                              selectedFormat === option.value
                                ? 'text-indigo-600 dark:text-indigo-400'
                                : 'text-gray-400'
                            }`}
                          >
                            {option.icon}
                          </div>
                          <span
                            className={`mt-2 text-sm font-medium ${
                              selectedFormat === option.value
                                ? 'text-indigo-600 dark:text-indigo-400'
                                : 'text-gray-900 dark:text-white'
                            }`}
                          >
                            {option.label}
                          </span>
                          {!option.available && (
                            <span className="absolute -right-1 -top-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-800">
                              Soon
                            </span>
                          )}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* ZIP Configuration */}
                {selectedFormat === 'zip' && (
                  <div className="mt-6 space-y-4 border-t border-gray-200 pt-6 dark:border-gray-700">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                      Export Options
                    </h3>

                    {/* Resolution */}
                    <div>
                      <label className="text-sm text-gray-700 dark:text-gray-300">
                        Image Resolution
                      </label>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {RESOLUTION_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setResolution(opt.value)}
                            className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                              resolution === opt.value
                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400'
                                : 'border-gray-200 text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300'
                            }`}
                          >
                            <div className="font-medium">{opt.label}</div>
                            <div className="text-xs opacity-70">{opt.description}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Checkboxes */}
                    <div className="space-y-3">
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={preserveFilenames}
                          onChange={(e) => setPreserveFilenames(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Preserve original filenames
                        </span>
                      </label>

                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={includeSubGalleryFolders}
                          onChange={(e) => setIncludeSubGalleryFolders(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Organize by sub-gallery folders
                        </span>
                      </label>

                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={includeMetadata}
                          onChange={(e) => setIncludeMetadata(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Include metadata file (JSON)
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Cloud Sync Section */}
                <div className="mt-6 border-t border-gray-200 pt-6 dark:border-gray-700">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                    Cloud Sync
                    <span className="ml-2 rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                      Coming Soon
                    </span>
                  </h3>
                  <div className="mt-3 grid grid-cols-3 gap-3 opacity-50">
                    {FORMAT_OPTIONS.filter((opt) => opt.category === 'cloud').map((option) => (
                      <div
                        key={option.value}
                        className="flex flex-col items-center rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700"
                      >
                        <div className="text-gray-400">{option.icon}</div>
                        <span className="mt-1 text-xs text-gray-500">{option.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          {!exportResult && (
            <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Export will be processed in the background
              </p>
              <div className="flex gap-3">
                <AppButton variant="secondary" onClick={handleClose}>
                  Cancel
                </AppButton>
                <AppButton
                  variant="primary"
                  onClick={handleSubmit}
                  disabled={!selectedOption?.available || isSubmitting}
                  isLoading={isSubmitting}
                >
                  {isSubmitting ? 'Creating Export...' : 'Start Export'}
                </AppButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;
