/**
 * DownloadSettings Component
 * Settings for gallery download policy
 * Property 21: Download Policy Options
 *
 * Includes:
 * - Download policy selection
 * - Bulk download options
 * - Download quality settings
 * - ZIP packaging options
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Package, FileArchive, Image, Info, Gauge } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { Select, Toggle } from '../../ui/FormControls';
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
    label: 'Web Only - Download optimized web images (2048px)',
  },
  {
    value: 'watermarked_only',
    label: 'Watermarked Only - Download with watermark overlay',
  },
  {
    value: 'original_allowed',
    label: 'Original Allowed - Download full-resolution images',
  },
];

const policyDescriptions: Record<string, string> = {
  view_only: 'Clients can only view photos in the gallery. No download buttons are shown.',
  web_only: 'Clients can download web-optimized versions (max 2048px, ~500KB-2MB). Good for social media sharing.',
  watermarked_only: 'Clients can download photos with your watermark overlay. Configure watermark in the Watermark tab.',
  original_allowed: 'Clients can download original high-resolution files. Best for print-ready deliverables.',
};

const dailyLimitOptions: SelectOption[] = [
  { value: '0', label: 'Unlimited' },
  { value: '5', label: '5 per day' },
  { value: '10', label: '10 per day' },
  { value: '25', label: '25 per day' },
  { value: '50', label: '50 per day' },
  { value: '100', label: '100 per day' },
];

export const DownloadSettings: React.FC<DownloadSettingsProps> = ({ gallery, onUpdate }) => {
  const { t } = useTranslation('gallery');
  const currentPolicy = gallery.download_policy || 'watermarked_only';
  const currentDailyLimit = gallery.daily_download_limit ?? 0;

  const handlePolicyChange = (value: string) => {
    onUpdate({ download_policy: value as DownloadPolicy });
  };

  const handleDailyLimitChange = (value: string) => {
    const limit = parseInt(value, 10);
    onUpdate({ daily_download_limit: limit > 0 ? limit : null });
  };

  return (
    <div className="space-y-6">
      {/* Main Download Policy */}
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
          <div className="flex items-start gap-3 p-4 bg-surface-hover rounded-lg border border-border">
            <Info size={18} className="text-text-tertiary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-text-secondary">
              {policyDescriptions[currentPolicy]}
            </p>
          </div>
        </div>
      </AppCard>

      {/* Daily Download Limit - Only show if downloads are allowed */}
      {currentPolicy !== 'view_only' && (
        <AppCard padding="md">
          <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Gauge size={20} />
            Daily Download Limit
          </h3>
          <div className="space-y-4">
            <Select
              label="Downloads per visitor per day"
              options={dailyLimitOptions}
              value={currentDailyLimit.toString()}
              onChange={(e) => handleDailyLimitChange(e.target.value)}
              helperText="Limit how many photos each visitor can download per day"
            />
            <div className="flex items-start gap-3 p-4 bg-surface-hover rounded-lg border border-border">
              <Info size={18} className="text-text-tertiary flex-shrink-0 mt-0.5" />
              <div className="text-sm text-text-secondary">
                {currentDailyLimit > 0 ? (
                  <>
                    <p className="font-medium text-text-primary mb-1">
                      Limit: {currentDailyLimit} downloads per day
                    </p>
                    <p>
                      Visitors will see their remaining download count. The limit resets at midnight UTC.
                      After reaching the limit, they'll see when they can download again.
                    </p>
                  </>
                ) : (
                  <p>
                    No limit set. Visitors can download unlimited photos.
                    Consider setting a limit to manage bandwidth and encourage selection.
                  </p>
                )}
              </div>
            </div>
          </div>
        </AppCard>
      )}

      {/* Bulk Download Options - Only show if downloads are allowed */}
      {currentPolicy !== 'view_only' && (
        <AppCard padding="md">
          <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Package size={20} />
            Bulk Download Options
          </h3>
          <div className="space-y-4">
            <Toggle
              label="Allow bulk downloads"
              checked={true}
              onChange={() => { }}
              description="Let clients download multiple photos at once"
            />
            <Toggle
              label="Allow full gallery download"
              checked={true}
              onChange={() => { }}
              description="Show 'Download All' button for entire gallery"
            />
            <Toggle
              label="Allow selection download"
              checked={true}
              onChange={() => { }}
              description="Let clients download only their selected photos"
            />
          </div>
        </AppCard>
      )}

      {/* ZIP Options - Only show if downloads are allowed */}
      {currentPolicy !== 'view_only' && (
        <AppCard padding="md">
          <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <FileArchive size={20} />
            ZIP Packaging
          </h3>
          <div className="space-y-4">
            <Toggle
              label="Include folder structure"
              checked={true}
              onChange={() => { }}
              description="Organize photos by sub-gallery in the ZIP file"
            />
            <Toggle
              label="Include metadata file"
              checked={false}
              onChange={() => { }}
              description="Add a text file with photo information (filename, date, camera info)"
            />
            <div className="p-4 bg-surface-hover rounded-lg border border-border">
              <p className="text-sm text-text-secondary">
                <strong className="text-text-primary">ZIP File Naming:</strong>{' '}
                {gallery.title.replace(/[^a-zA-Z0-9]/g, '_')}_photos.zip
              </p>
            </div>
          </div>
        </AppCard>
      )}

      {/* Image Quality Options */}
      {currentPolicy === 'web_only' && (
        <AppCard padding="md">
          <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Image size={20} />
            Web Quality Settings
          </h3>
          <div className="space-y-4">
            <Select
              label="Maximum Resolution"
              options={[
                { value: '1024', label: '1024px (Small - Social Media)' },
                { value: '1920', label: '1920px (Medium - HD)' },
                { value: '2048', label: '2048px (Large - Default)' },
                { value: '3000', label: '3000px (Extra Large)' },
              ]}
              value="2048"
              onChange={() => { }}
              helperText="Maximum dimension for web-quality downloads"
            />
            <Select
              label="JPEG Quality"
              options={[
                { value: '70', label: '70% (Smaller files, good quality)' },
                { value: '80', label: '80% (Balanced - Default)' },
                { value: '90', label: '90% (Larger files, best quality)' },
              ]}
              value="80"
              onChange={() => { }}
              helperText="Higher quality = larger file sizes"
            />
          </div>
        </AppCard>
      )}
    </div>
  );
};

