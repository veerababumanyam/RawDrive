/**
 * DownloadSettings Component
 * Settings for gallery download policy
 * Property 21: Download Policy Options
 */

import React from 'react';
import { Download } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { Select } from '../../ui/FormControls';
import type { SelectOption } from '../../ui/FormControls';
import type { GalleryDetailData, GalleryUpdateRequest, DownloadPolicy } from '../../../types/gallery';

export interface DownloadSettingsProps {
  gallery: GalleryDetailData;
  onUpdate: (updates: Partial<GalleryUpdateRequest>) => void;
}

const downloadPolicyOptions: SelectOption[] = [
  {
    value: 'view_only',
    label: 'View Only - No downloads allowed',
  },
  {
    value: 'web_only',
    label: 'Web Only - Download optimized web images',
  },
  {
    value: 'watermarked_only',
    label: 'Watermarked Only - Download with watermark',
  },
  {
    value: 'original_allowed',
    label: 'Original Allowed - Download full-resolution images',
  },
];

export const DownloadSettings: React.FC<DownloadSettingsProps> = ({ gallery, onUpdate }) => {
  const currentPolicy = gallery.download_policy || 'view_only';

  const handlePolicyChange = (value: string) => {
    onUpdate({ download_policy: value as DownloadPolicy });
  };

  return (
    <AppCard padding="md">
      <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <Download size={20} />
        Download Policy
      </h3>
      <div className="space-y-4">
        <Select
          label="Allow Downloads"
          options={downloadPolicyOptions}
          value={currentPolicy}
          onChange={(e) => handlePolicyChange(e.target.value)}
          helperText="Control what visitors can download from this gallery"
        />
        <div className="p-4 bg-surface-hover rounded-lg border border-border">
          <p className="text-sm text-text-secondary">
            <strong className="text-text-primary">Current policy:</strong>{' '}
            {downloadPolicyOptions.find((opt) => opt.value === currentPolicy)?.label}
          </p>
        </div>
      </div>
    </AppCard>
  );
};

