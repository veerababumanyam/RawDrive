/**
 * FindMeSettings Component
 * Settings for FindMe face recognition feature in galleries
 */

import React, { useState, useCallback } from 'react';
import { ScanFace, AlertTriangle, Info } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { Toggle } from '../../ui/FormControls';
import { AppInput } from '../../ui/AppInput';
import type { GalleryDetailData, GalleryUpdateRequest, FindMeConfig } from '../../../types/gallery';

export interface FindMeSettingsProps {
  gallery: GalleryDetailData;
  onUpdate: (updates: Partial<GalleryUpdateRequest>) => void;
}

export const FindMeSettings: React.FC<FindMeSettingsProps> = ({ gallery, onUpdate }) => {
  const currentConfig = gallery.findme_config || { enabled: false };
  const [config, setConfig] = useState<FindMeConfig>(currentConfig);

  const handleConfigChange = useCallback((updates: Partial<FindMeConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onUpdate({ findme_config: newConfig });
  }, [config, onUpdate]);

  const handleToggle = useCallback((enabled: boolean) => {
    handleConfigChange({ enabled });
  }, [handleConfigChange]);

  // Calculate threshold label
  const getThresholdLabel = (threshold: number) => {
    if (threshold >= 0.9) return 'Very Strict (fewer matches, higher accuracy)';
    if (threshold >= 0.8) return 'Strict (balanced)';
    if (threshold >= 0.7) return 'Moderate (recommended)';
    if (threshold >= 0.6) return 'Relaxed (more matches, may include false positives)';
    return 'Very Relaxed (most matches, less accurate)';
  };

  return (
    <div className="space-y-6">
      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <ScanFace size={20} />
          FindMe Face Recognition
        </h3>
        <div className="space-y-4">
          <Toggle
            label="Enable FindMe feature"
            checked={config.enabled}
            onChange={(e) => handleToggle(e.target.checked)}
            description="Allow clients to find themselves in photos using facial recognition"
          />

          {config.enabled && (
            <div className="space-y-4 pt-4 border-t border-border">
              {/* Privacy Notice */}
              <div className="flex items-start gap-3 p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <Info size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-text-primary font-medium">Privacy Notice</p>
                  <p className="text-xs text-text-secondary mt-1">
                    FindMe uses on-device face detection. Facial data is processed locally and never stored on our servers.
                    Clients must consent before using this feature.
                  </p>
                </div>
              </div>

              {/* Guest Access */}
              <Toggle
                label="Allow guest access"
                checked={config.allow_guest_search ?? true}
                onChange={(e) => handleConfigChange({ allow_guest_search: e.target.checked })}
                description="Allow visitors to use FindMe without registering their email"
              />

              {/* Confidence Threshold */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Match Sensitivity
                </label>
                <input
                  type="range"
                  min="50"
                  max="95"
                  step="5"
                  value={(config.confidence_threshold ?? 0.7) * 100}
                  onChange={(e) => handleConfigChange({ confidence_threshold: parseInt(e.target.value) / 100 })}
                  className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-text-tertiary mt-1">
                  <span>More Results</span>
                  <span>More Accurate</span>
                </div>
                <p className="text-xs text-text-secondary mt-2">
                  {getThresholdLabel(config.confidence_threshold ?? 0.7)}
                </p>
              </div>

              {/* Max Results */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Maximum Results
                </label>
                <AppInput
                  type="number"
                  value={String(config.max_results ?? 100)}
                  onChange={(e) => handleConfigChange({ max_results: parseInt(e.target.value) || 100 })}
                  min={10}
                  max={500}
                  helperText="Maximum number of photos to show per search (10-500)"
                />
              </div>

              {/* Usage Tips */}
              <div className="p-4 bg-surface-hover rounded-lg border border-border">
                <h4 className="text-sm font-medium text-text-primary mb-2">Tips for Best Results</h4>
                <ul className="text-xs text-text-secondary space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">&#x2022;</span>
                    <span>Ensure photos have good lighting and clear faces</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">&#x2022;</span>
                    <span>Higher threshold = fewer false positives but may miss some matches</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">&#x2022;</span>
                    <span>Works best with front-facing, unobstructed faces</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">&#x2022;</span>
                    <span>Sunglasses, masks, or heavy shadows may reduce accuracy</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {!config.enabled && (
            <div className="flex items-start gap-3 p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
              <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-text-primary">FindMe is disabled</p>
                <p className="text-xs text-text-secondary mt-1">
                  Clients won&apos;t be able to search for themselves in photos. Enable this feature to help guests quickly find their photos in large galleries.
                </p>
              </div>
            </div>
          )}
        </div>
      </AppCard>
    </div>
  );
};
