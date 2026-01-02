/**
 * InvitationFontSelector: Language-aware font selector for invitations
 *
 * Features:
 * - Multiple font options per Indian language
 * - Live preview with native script text
 * - Category filtering (Display, Body, Traditional)
 * - Custom font upload support
 * - Lazy font loading for performance
 *
 * Feature: 019-invitation-indian-languages (Font Enhancement)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Type, Upload, ChevronDown, Check, Loader2, X, Sparkles } from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { Modal as AppModal } from '@/components/ui/Modal';
import { useToast } from '@/hooks/useToast';
import {
  INDIAN_LANGUAGE_FONTS,
  getFontsForLanguage,
  getDefaultFont,
  FONT_CATEGORY_LABELS,
  type FontOption,
  type LanguageFontConfig,
} from '@/config/indianFonts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvitationFontSelectorProps {
  /** The language code to show fonts for */
  languageCode: string;
  /** Currently selected font family */
  selectedFont: string;
  /** Callback when font is selected */
  onFontChange: (fontFamily: string, fontName: string) => void;
  /** Whether to show the custom upload option */
  allowCustomUpload?: boolean;
  /** Workspace ID for custom font uploads */
  workspaceId?: string;
  /** Custom fonts uploaded by the user */
  customFonts?: CustomFont[];
  /** Callback when a custom font is uploaded */
  onCustomFontUpload?: (font: CustomFont) => void;
  /** Label for the selector */
  label?: string;
  /** Optional className */
  className?: string;
}

export interface CustomFont {
  id: string;
  name: string;
  family: string;
  url: string;
  uploadedAt: string;
}

// ---------------------------------------------------------------------------
// Font Preview Card
// ---------------------------------------------------------------------------

interface FontPreviewCardProps {
  font: FontOption;
  isSelected: boolean;
  onSelect: () => void;
  isLoading?: boolean;
}

const FontPreviewCard: React.FC<FontPreviewCardProps> = ({
  font,
  isSelected,
  onSelect,
  isLoading,
}) => {
  const [fontLoaded, setFontLoaded] = useState(false);

  // Load font on mount
  useEffect(() => {
    const link = document.createElement('link');
    link.href = font.googleFontsUrl;
    link.rel = 'stylesheet';
    link.onload = () => setFontLoaded(true);
    document.head.appendChild(link);

    return () => {
      // Keep font loaded for reuse
    };
  }, [font.googleFontsUrl]);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isLoading}
      className={`
        relative w-full text-left p-4 rounded-lg border-2 transition-all duration-200
        focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none
        ${
          isSelected
            ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
            : 'border-border hover:border-primary/50 hover:bg-surface-hover'
        }
      `}
      aria-pressed={isSelected}
    >
      {/* Category badge */}
      <span
        className={`
          absolute top-2 right-2 px-2 py-0.5 text-xs rounded-full
          ${font.category === 'display' ? 'bg-accent/10 text-accent' : ''}
          ${font.category === 'body' ? 'bg-primary/10 text-primary' : ''}
          ${font.category === 'traditional' ? 'bg-gold/10 text-gold' : ''}
        `}
      >
        {FONT_CATEGORY_LABELS[font.category]}
      </span>

      {/* Font name */}
      <p className="text-sm font-medium text-text-primary mb-2 pr-20">{font.name}</p>

      {/* Preview text */}
      <div className="min-h-[3rem] flex items-center">
        {fontLoaded ? (
          <p
            className="text-xl leading-relaxed text-text-primary"
            style={{ fontFamily: font.family }}
          >
            {font.previewText}
          </p>
        ) : (
          <div className="flex items-center gap-2 text-text-tertiary">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading font...</span>
          </div>
        )}
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-2 left-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Custom Font Upload Modal
// ---------------------------------------------------------------------------

interface CustomFontUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File, name: string) => Promise<void>;
  isUploading: boolean;
}

const CustomFontUploadModal: React.FC<CustomFontUploadModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  isUploading,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [fontName, setFontName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    const validTypes = ['.ttf', '.otf', '.woff', '.woff2'];
    const extension = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf('.'));
    if (!validTypes.includes(extension)) {
      setError('Please upload a valid font file (.ttf, .otf, .woff, .woff2)');
      return;
    }

    // Validate file size (max 5MB)
    if (selectedFile.size > 5 * 1024 * 1024) {
      setError('Font file must be less than 5MB');
      return;
    }

    setError(null);
    setFile(selectedFile);
    // Auto-fill name from filename
    if (!fontName) {
      setFontName(selectedFile.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
    }
  };

  const handleSubmit = async () => {
    if (!file || !fontName.trim()) {
      setError('Please select a font file and provide a name');
      return;
    }

    try {
      await onUpload(file, fontName.trim());
      showToast('Font uploaded successfully!', 'success');
      onClose();
      setFile(null);
      setFontName('');
    } catch (err: any) {
      setError(err.message || 'Failed to upload font');
    }
  };

  return (
    <AppModal isOpen={isOpen} onClose={onClose} title="Upload Custom Font" size="md">
      <div className="space-y-6">
        <div className="p-4 bg-info-50 dark:bg-info-900/10 rounded-lg text-sm text-info-700 dark:text-info-300">
          <p className="font-medium mb-1">Font Upload Guidelines:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Supported formats: TTF, OTF, WOFF, WOFF2</li>
            <li>Maximum file size: 5MB</li>
            <li>Ensure you have the license to use this font commercially</li>
            <li>Font will be available only for your invitations</li>
          </ul>
        </div>

        {/* File input */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Font File
          </label>
          <div className="relative">
            <input
              type="file"
              accept=".ttf,.otf,.woff,.woff2"
              onChange={handleFileChange}
              className="hidden"
              id="font-upload-input"
            />
            <label
              htmlFor="font-upload-input"
              className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-surface-hover transition-colors"
            >
              {file ? (
                <div className="flex items-center gap-2 text-text-primary">
                  <Type className="w-5 h-5 text-primary" />
                  <span>{file.name}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setFile(null);
                    }}
                    className="p-1 hover:bg-error/10 rounded"
                  >
                    <X className="w-4 h-4 text-error" />
                  </button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-text-tertiary" />
                  <p className="text-text-secondary">Click to select a font file</p>
                  <p className="text-xs text-text-tertiary mt-1">
                    TTF, OTF, WOFF, WOFF2 (max 5MB)
                  </p>
                </div>
              )}
            </label>
          </div>
        </div>

        {/* Font name */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Font Name
          </label>
          <input
            type="text"
            value={fontName}
            onChange={(e) => setFontName(e.target.value)}
            placeholder="e.g., My Custom Wedding Font"
            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-surface text-text-primary"
          />
        </div>

        {error && (
          <div className="p-3 bg-error-50 dark:bg-error-900/10 text-error-600 dark:text-error-400 text-sm rounded-md">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <AppButton variant="ghost" onClick={onClose} disabled={isUploading}>
            Cancel
          </AppButton>
          <AppButton
            variant="primary"
            onClick={handleSubmit}
            disabled={!file || !fontName.trim() || isUploading}
            isLoading={isUploading}
          >
            Upload Font
          </AppButton>
        </div>
      </div>
    </AppModal>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const InvitationFontSelector: React.FC<InvitationFontSelectorProps> = ({
  languageCode,
  selectedFont,
  onFontChange,
  allowCustomUpload = true,
  workspaceId,
  customFonts = [],
  onCustomFontUpload,
  label = 'Select Font',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const { showToast } = useToast();

  // Get fonts for the selected language
  const languageConfig = useMemo(() => {
    return INDIAN_LANGUAGE_FONTS.find((lang) => lang.code === languageCode);
  }, [languageCode]);

  const availableFonts = useMemo(() => {
    let fonts = languageConfig?.fonts || [];
    if (categoryFilter) {
      fonts = fonts.filter((f) => f.category === categoryFilter);
    }
    return fonts;
  }, [languageConfig, categoryFilter]);

  // Get selected font info
  const selectedFontInfo = useMemo(() => {
    // Check system fonts
    const systemFont = languageConfig?.fonts.find((f) => f.family === selectedFont);
    if (systemFont) return { type: 'system', font: systemFont };

    // Check custom fonts
    const customFont = customFonts.find((f) => f.family === selectedFont);
    if (customFont) return { type: 'custom', font: customFont };

    // Default to first available
    return { type: 'system', font: languageConfig?.fonts[0] };
  }, [selectedFont, languageConfig, customFonts]);

  // Handle custom font upload
  const handleCustomFontUpload = useCallback(
    async (file: File, name: string) => {
      if (!workspaceId || !onCustomFontUpload) return;

      setIsUploading(true);
      try {
        // Create a temporary URL for the font
        const fontUrl = URL.createObjectURL(file);
        const fontFamily = `custom-${Date.now()}`;

        // Create @font-face rule
        const fontFace = new FontFace(fontFamily, `url(${fontUrl})`);
        await fontFace.load();
        document.fonts.add(fontFace);

        // In a real implementation, you would upload to the server here
        // For now, we'll create a mock custom font object
        const customFont: CustomFont = {
          id: `custom-${Date.now()}`,
          name,
          family: fontFamily,
          url: fontUrl, // In production, this would be the CDN URL
          uploadedAt: new Date().toISOString(),
        };

        onCustomFontUpload(customFont);
        onFontChange(fontFamily, name);
      } finally {
        setIsUploading(false);
      }
    },
    [workspaceId, onCustomFontUpload, onFontChange]
  );

  const handleFontSelect = useCallback(
    (font: FontOption) => {
      onFontChange(font.family, font.name);
      setIsOpen(false);
    },
    [onFontChange]
  );

  const handleCustomFontSelect = useCallback(
    (font: CustomFont) => {
      onFontChange(font.family, font.name);
      setIsOpen(false);
    },
    [onFontChange]
  );

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-text-primary mb-2">{label}</label>

      {/* Selected font display / trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-between p-3 border border-border rounded-lg bg-surface hover:border-primary/50 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none"
      >
        <div className="flex items-center gap-3">
          <Type className="w-5 h-5 text-primary" />
          <div className="text-left">
            <p className="text-sm font-medium text-text-primary">
              {selectedFontInfo.font?.name || 'Select a font'}
            </p>
            {selectedFontInfo.type === 'custom' && (
              <span className="text-xs text-accent flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Custom Font
              </span>
            )}
          </div>
        </div>
        <ChevronDown className="w-5 h-5 text-text-tertiary" />
      </button>

      {/* Font preview */}
      {selectedFontInfo.font && (
        <div className="mt-2 p-3 border border-border rounded-md bg-surface-hover">
          <style>
            {`@import url('${(selectedFontInfo.font as FontOption).googleFontsUrl || ''}');`}
          </style>
          <p
            className="text-lg"
            style={{ fontFamily: selectedFontInfo.font.family }}
          >
            {(selectedFontInfo.font as FontOption).previewText || 'Preview text'}
          </p>
        </div>
      )}

      {/* Font selection modal */}
      <AppModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={`Choose Font for ${languageConfig?.nativeName || languageCode}`}
        size="lg"
      >
        <div className="space-y-6">
          {/* Category filter */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategoryFilter(null)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                categoryFilter === null
                  ? 'bg-primary text-white'
                  : 'bg-surface-hover text-text-secondary hover:bg-surface-hover/80'
              }`}
            >
              All Styles
            </button>
            {Object.entries(FONT_CATEGORY_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategoryFilter(key)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  categoryFilter === key
                    ? 'bg-primary text-white'
                    : 'bg-surface-hover text-text-secondary hover:bg-surface-hover/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* System fonts grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto">
            {availableFonts.map((font) => (
              <FontPreviewCard
                key={font.name}
                font={font}
                isSelected={selectedFont === font.family}
                onSelect={() => handleFontSelect(font)}
              />
            ))}
          </div>

          {/* Custom fonts section */}
          {customFonts.length > 0 && (
            <div className="border-t border-border pt-4">
              <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                Your Custom Fonts
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {customFonts.map((font) => (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => handleCustomFontSelect(font)}
                    className={`
                      relative w-full text-left p-4 rounded-lg border-2 transition-all
                      ${
                        selectedFont === font.family
                          ? 'border-accent bg-accent/5 ring-1 ring-accent/20'
                          : 'border-border hover:border-accent/50 hover:bg-surface-hover'
                      }
                    `}
                  >
                    <p className="text-sm font-medium text-text-primary mb-2">{font.name}</p>
                    <p className="text-lg" style={{ fontFamily: font.family }}>
                      Custom font preview
                    </p>
                    {selectedFont === font.family && (
                      <div className="absolute top-2 left-2 w-5 h-5 bg-accent rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Upload custom font button */}
          {allowCustomUpload && onCustomFontUpload && (
            <div className="border-t border-border pt-4">
              <AppButton
                variant="outline"
                onClick={() => setIsUploadModalOpen(true)}
                leftIcon={<Upload className="w-4 h-4" />}
                className="w-full"
              >
                Upload Custom Font
              </AppButton>
            </div>
          )}
        </div>
      </AppModal>

      {/* Custom font upload modal */}
      <CustomFontUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={handleCustomFontUpload}
        isUploading={isUploading}
      />
    </div>
  );
};

export default InvitationFontSelector;
