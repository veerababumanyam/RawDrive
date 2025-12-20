/**
 * BrandingSettings Component
 * Settings for gallery branding and appearance
 */

import React from 'react';
import { Palette } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { AppButton } from '../../ui/AppButton';
import { Select } from '../../ui/FormControls';
import type { GalleryDetailData, GalleryUpdateRequest } from '../../../types/gallery';
import { ROUTE_PATHS } from '../../../constants/api';

export interface BrandingSettingsProps {
  gallery: GalleryDetailData;
  onUpdate: (updates: Partial<GalleryUpdateRequest>) => void;
}

export const BrandingSettings: React.FC<BrandingSettingsProps> = ({ gallery, onUpdate }) => {
  // We currently only support the workspace default profile (Company Profile).
  // In the future, we might support multiple branding profiles.

  return (
    <div className="space-y-6">
      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Palette size={20} />
          Branding & Appearance
        </h3>
        <div className="space-y-4">
          <div className="p-4 bg-surface-hover rounded-lg border border-border">
            <p className="text-sm text-text-secondary mb-3">
              This gallery uses your workspace's <strong>Company Profile</strong> for branding (Logo, Colors, Contact Info).
            </p>
            <AppButton
              variant="outline"
              size="sm"
              onClick={() => window.open(ROUTE_PATHS.workspace.profile, '_blank')}
            >
              Edit Company Profile
            </AppButton>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Layout Style */}
            <Select
              label="Layout Style"
              options={[
                { value: 'tabs', label: 'Tabs (Default)' },
                { value: 'continuous', label: 'Continuous Scroll' }
              ]}
              value={gallery.layout_style || 'tabs'}
              onChange={(e) => onUpdate({ layout_style: e.target.value as any })}
            />

            {/* Theme */}
            <Select
              label="Theme"
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System Default' }
              ]}
              value={gallery.theme || 'system'}
              onChange={(e) => onUpdate({ theme: e.target.value as any })}
            />
          </div>
        </div>
      </AppCard>
    </div>
  );
};

