/**
 * GallerySettingsPresets Component
 * One-click preset buttons for common gallery configurations
 * Configures access_level, download_policy, and watermark_enabled together
 */

import React from 'react';
import { Eye, Download, Share2, Crown } from 'lucide-react';

export interface PresetConfig {
  access_level: string;
  download_policy: string;
  watermark_enabled: boolean;
}

interface PresetDefinition {
  name: string;
  description: string;
  icon: React.ElementType;
  config: PresetConfig;
}

export const GALLERY_PRESETS: PresetDefinition[] = [
  {
    name: 'Proofing',
    description: 'Clients view and select, no downloads',
    icon: Eye,
    config: {
      access_level: 'password_protected',
      download_policy: 'view_only',
      watermark_enabled: true,
    },
  },
  {
    name: 'Delivery',
    description: 'Clients download full resolution',
    icon: Download,
    config: {
      access_level: 'password_protected',
      download_policy: 'original_allowed',
      watermark_enabled: false,
    },
  },
  {
    name: 'Sharing',
    description: 'Public viewing with watermarks',
    icon: Share2,
    config: {
      access_level: 'public',
      download_policy: 'web_only',
      watermark_enabled: true,
    },
  },
  {
    name: 'Premium Delivery',
    description: 'Full originals, private access',
    icon: Crown,
    config: {
      access_level: 'password_protected',
      download_policy: 'original_allowed',
      watermark_enabled: false,
    },
  },
];

export interface GallerySettingsPresetsProps {
  currentSettings: {
    access_level: string;
    download_policy: string;
    watermark_enabled: boolean;
  };
  onApplyPreset: (preset: PresetConfig) => void;
}

function isPresetActive(preset: PresetConfig, current: GallerySettingsPresetsProps['currentSettings']): boolean {
  return (
    preset.access_level === current.access_level &&
    preset.download_policy === current.download_policy &&
    preset.watermark_enabled === current.watermark_enabled
  );
}

export const GallerySettingsPresets: React.FC<GallerySettingsPresetsProps> = ({
  currentSettings,
  onApplyPreset,
}) => {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Quick Setup
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {GALLERY_PRESETS.map((preset) => {
          const active = isPresetActive(preset.config, currentSettings);
          const Icon = preset.icon;

          return (
            <button
              key={preset.name}
              data-preset={preset.name}
              onClick={() => onApplyPreset(preset.config)}
              className={`
                flex flex-col items-start gap-2
                p-4 rounded-lg border-2
                text-left
                transition-all duration-200
                hover:shadow-md
                ${active
                  ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                  : 'border-border hover:border-primary/40 bg-surface'
                }
              `}
            >
              <div className={`
                w-8 h-8 rounded-lg flex items-center justify-center
                ${active ? 'bg-primary text-white' : 'bg-surface-hover text-text-secondary'}
              `}>
                <Icon size={18} />
              </div>
              <div>
                <div className={`text-sm font-semibold ${active ? 'text-primary' : 'text-text-primary'}`}>
                  {preset.name}
                </div>
                <div className="text-xs text-text-secondary mt-0.5 leading-relaxed">
                  {preset.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
