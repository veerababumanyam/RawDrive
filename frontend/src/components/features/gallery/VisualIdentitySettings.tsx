/**
 * VisualIdentitySettings Component
 * Settings for gallery visual identity (color, typography, EXIF visibility)
 */

import React from 'react';
import { Palette, Info } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { AppInput } from '../../ui/AppInput';
import { Select, Toggle } from '../../ui/FormControls';
import type { GalleryDetailData, GalleryUpdateRequest } from '../../../types/gallery';

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

export const VisualIdentitySettings: React.FC<VisualIdentitySettingsProps> = ({ gallery, onUpdate }) => {
  const handleColorChange = (value: string) => {
    onUpdate({ primary_color: value || null });
  };

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
      <div className="space-y-5">
        {/* Primary Color */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Primary Brand Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={gallery.primary_color || '#6366f1'}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-12 h-10 rounded-md cursor-pointer border border-border"
              />
              <AppInput
                type="text"
                value={gallery.primary_color || ''}
                onChange={(e) => handleColorChange(e.target.value)}
                placeholder="#6366f1"
                className="flex-1"
              />
            </div>
            <p className="text-xs text-text-tertiary mt-1">
              Overrides workspace color for this gallery
            </p>
          </div>

          {/* Font Family */}
          <div>
            <Select
              label="Typography"
              options={fontFamilyOptions}
              value={gallery.font_family || ''}
              onChange={(e) => handleFontChange(e.target.value)}
              helperText="Choose a font for gallery text"
            />
          </div>
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
            <strong>Tip:</strong> These settings will be applied to the public gallery view. 
            Changes are saved automatically when you modify settings.
          </p>
        </div>
      </div>
    </AppCard>
  );
};
