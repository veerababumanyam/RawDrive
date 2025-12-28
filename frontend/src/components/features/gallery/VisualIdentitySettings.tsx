/**
 * VisualIdentitySettings Component
 * Settings for gallery visual identity (gradient branding, typography, EXIF visibility)
 *
 * Updated: Replaced solid color picker with GradientPicker and live preview.
 * Added GradientEditor integration for custom gradient creation.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Palette, Info } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { Select, Toggle } from '../../ui/FormControls';
import { GradientPicker } from './GradientPicker';
import { GradientPreviewPanel } from './GradientPreviewPanel';
import { GradientEditor } from './GradientEditor';
import type { GalleryDetailData, GalleryUpdateRequest } from '../../../types/gallery';
import type { GradientConfiguration } from '../../../types/gradient';

export interface VisualIdentitySettingsProps {
  gallery: GalleryDetailData;
  onUpdate: (updates: Partial<GalleryUpdateRequest>) => void;
}

const fontFamilyOptions = [
  { value: '', label: 'Default (Workspace)' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Lato', label: 'Lato' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Merriweather', label: 'Merriweather' },
  { value: 'Raleway', label: 'Raleway' },
];

export const VisualIdentitySettings: React.FC<VisualIdentitySettingsProps> = ({
  gallery,
  onUpdate,
}) => {
  // Local state for gradient selection (synced with gallery on mount and external updates)
  const [selectedGradient, setSelectedGradient] = useState<GradientConfiguration | null>(
    gallery.gradient_config || null
  );

  // State for showing the gradient editor
  const [showEditor, setShowEditor] = useState(false);
  const [editorInitialGradient, setEditorInitialGradient] = useState<GradientConfiguration | null>(
    null
  );

  // Sync local state when gallery prop changes (e.g., from parent reset)
  useEffect(() => {
    setSelectedGradient(gallery.gradient_config || null);
  }, [gallery.gradient_config]);

  // Handle gradient selection changes
  const handleGradientChange = useCallback(
    (gradient: GradientConfiguration | null) => {
      setSelectedGradient(gradient);
      // Immediately propagate to parent for live updates
      onUpdate({ gradient_config: gradient });
    },
    [onUpdate]
  );

  // Handle customize button - open GradientEditor
  const handleCustomize = useCallback((gradient: GradientConfiguration) => {
    setEditorInitialGradient(gradient);
    setShowEditor(true);
  }, []);

  // Handle GradientEditor apply
  const handleEditorApply = useCallback(
    (gradient: GradientConfiguration) => {
      setSelectedGradient(gradient);
      onUpdate({ gradient_config: gradient });
      setShowEditor(false);
      setEditorInitialGradient(null);
    },
    [onUpdate]
  );

  // Handle GradientEditor cancel
  const handleEditorCancel = useCallback(() => {
    setShowEditor(false);
    setEditorInitialGradient(null);
  }, []);

  const handleFontChange = (value: string) => {
    onUpdate({ font_family: value || null });
  };

  const handleExifToggle = (enabled: boolean) => {
    onUpdate({ exif_visible: enabled });
  };

  return (
    <AppCard padding="md">
      <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <Palette size={20} />
        Visual Identity
      </h3>
      <div className="space-y-6">
        {/* Gradient Branding Section */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-3">
              Gallery Header Gradient
            </label>
            <p className="text-xs text-text-tertiary mb-4">
              Choose a gradient for your gallery header. This overrides the workspace default.
            </p>
          </div>

          {/* Show GradientEditor when customizing */}
          {showEditor && editorInitialGradient ? (
            <GradientEditor
              initialGradient={editorInitialGradient}
              onApply={handleEditorApply}
              onCancel={handleEditorCancel}
            />
          ) : (
            /* Two-column layout: Picker + Preview */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Gradient Picker */}
              <GradientPicker
                value={selectedGradient}
                onChange={handleGradientChange}
                onCustomize={handleCustomize}
                showCustomize={true}
                showRemove={true}
              />

              {/* Live Preview */}
              <GradientPreviewPanel
                gradient={selectedGradient}
                galleryName={gallery.title || 'Untitled Gallery'}
                showContrastWarning={true}
              />
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Typography Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Typography"
            options={fontFamilyOptions}
            value={gallery.font_family || ''}
            onChange={(e) => handleFontChange(e.target.value)}
            helperText="Choose a font for gallery text"
          />
        </div>

        {/* EXIF Visibility */}
        <div className="pt-3 border-t border-border">
          <div className="flex items-start gap-3">
            <Info size={20} className="text-text-tertiary mt-1" />
            <div className="flex-1">
              <Toggle
                label="Show Camera Metadata (EXIF)"
                checked={gallery.exif_visible || false}
                onChange={(e) => handleExifToggle(e.target.checked)}
                description="Display aperture, ISO, shutter speed, and other camera info in the photo info panel"
              />
            </div>
          </div>
        </div>

        {/* Preview Hint */}
        <div className="p-3 bg-surface-hover rounded-lg border border-border">
          <p className="text-sm text-text-secondary">
            <strong>Tip:</strong> Changes to gradient and settings will be applied to the public
            gallery view. Click &quot;Save Changes&quot; in the settings panel to persist your
            changes.
          </p>
        </div>
      </div>
    </AppCard>
  );
};
