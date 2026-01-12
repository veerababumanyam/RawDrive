/**
 * WatermarkSettings Component
 * Settings for watermark configuration on gallery downloads
 */

import React, { useState, useCallback } from 'react';
import { Droplet, Upload, X } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { AppButton } from '../../ui/AppButton';
import { Toggle, Select } from '../../ui/FormControls';
import type { SelectOption } from '../../ui/FormControls';
import type { GalleryDetailData, GalleryUpdateRequest, WatermarkConfig, WatermarkPosition } from '../../../types/gallery';

export interface WatermarkSettingsProps {
  gallery: GalleryDetailData;
  onUpdate: (updates: Partial<GalleryUpdateRequest>) => void;
}

const positionOptions: SelectOption[] = [
  { value: 'bottom-right', label: 'Bottom Right (Default)' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'top-left', label: 'Top Left' },
  { value: 'center', label: 'Center' },
  { value: 'tiled', label: 'Tiled (Repeat Pattern)' },
];

export const WatermarkSettings: React.FC<WatermarkSettingsProps> = ({ gallery, onUpdate }) => {
  const currentConfig = gallery.watermark_config || { enabled: false };
  const [config, setConfig] = useState<WatermarkConfig>(currentConfig);

  const handleConfigChange = useCallback((updates: Partial<WatermarkConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onUpdate({ watermark_config: newConfig });
  }, [config, onUpdate]);

  const handleToggle = useCallback((enabled: boolean) => {
    handleConfigChange({ enabled });
  }, [handleConfigChange]);

  return (
    <div className="space-y-6">
      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Droplet size={20} />
          Watermark Settings
        </h3>
        <div className="space-y-4">
          <Toggle
            label="Enable watermarks on downloads"
            checked={config.enabled}
            onChange={(e) => handleToggle(e.target.checked)}
            description="Add a watermark to photos when clients download them"
          />

          {config.enabled && (
            <div className="space-y-4 pt-4 border-t border-border">
              {/* Position */}
              <Select
                label="Watermark Position"
                options={positionOptions}
                value={config.position || 'bottom-right'}
                onChange={(e) => handleConfigChange({ position: e.target.value as WatermarkPosition })}
              />

              {/* Opacity */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Opacity: {config.opacity ?? 50}%
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={config.opacity ?? 50}
                  onChange={(e) => handleConfigChange({ opacity: parseInt(e.target.value) })}
                  className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-text-tertiary mt-1">
                  <span>Subtle (10%)</span>
                  <span>Bold (100%)</span>
                </div>
              </div>

              {/* Scale */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Size: {config.scale ?? 20}% of image
                </label>
                <input
                  type="range"
                  min="10"
                  max="50"
                  step="5"
                  value={config.scale ?? 20}
                  onChange={(e) => handleConfigChange({ scale: parseInt(e.target.value) })}
                  className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-text-tertiary mt-1">
                  <span>Small (10%)</span>
                  <span>Large (50%)</span>
                </div>
              </div>

              {/* Custom Watermark Upload */}
              <div className="pt-4 border-t border-border">
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Custom Watermark Image
                </label>
                {config.custom_watermark_asset_id ? (
                  <div className="flex items-center gap-3 p-3 bg-surface-hover rounded-lg border border-border">
                    <div className="w-16 h-16 bg-surface rounded flex items-center justify-center">
                      <Droplet size={24} className="text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-text-primary">Custom watermark uploaded</p>
                      <p className="text-xs text-text-secondary">PNG with transparency recommended</p>
                    </div>
                    <AppButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleConfigChange({ custom_watermark_asset_id: undefined })}
                      leftIcon={<X size={14} />}
                    >
                      Remove
                    </AppButton>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer">
                    <Upload size={24} className="mx-auto text-text-tertiary mb-2" />
                    <p className="text-sm text-text-secondary">
                      Upload a custom watermark image
                    </p>
                    <p className="text-xs text-text-tertiary mt-1">
                      PNG with transparency recommended. Max 2MB.
                    </p>
                    <AppButton variant="outline" size="sm" className="mt-3">
                      Upload Image
                    </AppButton>
                  </div>
                )}
                <p className="text-xs text-text-tertiary mt-2">
                  If no custom watermark is uploaded, your workspace logo will be used.
                </p>
              </div>
            </div>
          )}
        </div>
      </AppCard>

      {/* Preview Card */}
      {config.enabled && (
        <AppCard padding="md">
          <h4 className="text-sm font-medium text-text-primary mb-3">Watermark Preview</h4>
          <div className="relative w-full aspect-video bg-gradient-to-br from-slate-700 to-slate-800 rounded-lg overflow-hidden">
            {/* Sample image placeholder */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-slate-500 text-sm">Sample Photo</span>
            </div>
            {/* Watermark position indicator */}
            <div
              className={`absolute p-2 ${
                config.position === 'top-left' ? 'top-2 left-2' :
                config.position === 'top-right' ? 'top-2 right-2' :
                config.position === 'bottom-left' ? 'bottom-2 left-2' :
                config.position === 'center' ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' :
                config.position === 'tiled' ? 'inset-0 flex items-center justify-center' :
                'bottom-2 right-2'
              }`}
              style={{ opacity: (config.opacity ?? 50) / 100 }}
            >
              <div className="bg-white/90 text-slate-800 px-3 py-1 rounded text-xs font-medium">
                {config.position === 'tiled' ? 'Tiled Pattern' : 'Your Logo'}
              </div>
            </div>
          </div>
          <p className="text-xs text-text-tertiary mt-2 text-center">
            Position: {positionOptions.find(o => o.value === (config.position || 'bottom-right'))?.label} |
            Opacity: {config.opacity ?? 50}% |
            Size: {config.scale ?? 20}%
          </p>
        </AppCard>
      )}
    </div>
  );
};
