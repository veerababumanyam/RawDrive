/**
 * BrandingSettings Component
 * Settings for gallery branding and appearance
 */

import React from 'react';
import { Palette } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { Select } from '../../ui/FormControls';
import type { SelectOption } from '../../ui/FormControls';
import type { GalleryDetailData, GalleryUpdateRequest } from '../../../types/gallery';

export interface BrandingSettingsProps {
  gallery: GalleryDetailData;
  onUpdate: (updates: Partial<GalleryUpdateRequest>) => void;
}

// TODO: Fetch branding profiles from workspace
const brandingProfileOptions: SelectOption[] = [
  {
    value: '',
    label: 'Default Branding',
  },
  // More options would come from workspace branding profiles
];

export const BrandingSettings: React.FC<BrandingSettingsProps> = ({ gallery, onUpdate }) => {
  const currentBranding = gallery.branding_profile_id || '';

  const handleBrandingChange = (value: string) => {
    onUpdate({ branding_profile_id: value || null });
  };

  return (
    <AppCard padding="md">
      <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <Palette size={20} />
        Branding Profile
      </h3>
      <div className="space-y-4">
        <Select
          label="Branding Profile"
          options={brandingProfileOptions}
          value={currentBranding}
          onChange={(e) => handleBrandingChange(e.target.value)}
          helperText="Select a branding profile to customize the gallery appearance"
        />
        <div className="p-4 bg-surface-hover rounded-lg border border-border">
          <p className="text-sm text-text-secondary">
            Branding profiles allow you to customize colors, logos, and styling for client-facing galleries.
          </p>
        </div>
      </div>
    </AppCard>
  );
};

