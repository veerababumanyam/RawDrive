/**
 * FavoritesSettingsPanel Component
 *
 * Settings panel for photographers to configure favorites behavior per gallery.
 * Includes toggles for favorites, sharing, downloads, and limits.
 *
 * Feature: 012-client-favorites (US5)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Heart,
  Share2,
  Download,
  Users,
  Image,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { Toggle, Select } from '../../ui/FormControls';
import { AppInput } from '../../ui/AppInput';
import { useToast } from '../../ui/Toast';
import { galleryService } from '../../../services/galleryService';

/* =============================================================================
   Types
   ============================================================================= */

interface FavoritesSettings {
  favorites_enabled: boolean;
  sharing_enabled: boolean;
  download_enabled: boolean;
  max_lists_per_client: number;
  download_resolution: string;
  download_limit_per_client: number;
}

interface FavoritesSettingsPanelProps {
  workspaceId: string;
  galleryId: string;
  className?: string;
  onSettingsChange?: (settings: FavoritesSettings) => void;
}

/* =============================================================================
   Setting Row Component
   ============================================================================= */

interface SettingRowProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  disabled?: boolean;
}

const SettingRow: React.FC<SettingRowProps> = ({
  icon,
  title,
  description,
  children,
  disabled = false,
}) => (
  <div
    className={`flex items-start justify-between gap-4 py-4 border-b border-border/50 last:border-b-0 ${
      disabled ? 'opacity-50' : ''
    }`}
  >
    <div className="flex items-start gap-3 flex-1">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-text-primary">{title}</h4>
        <p className="text-xs text-text-tertiary mt-0.5">{description}</p>
      </div>
    </div>
    <div className="flex-shrink-0">{children}</div>
  </div>
);

/* =============================================================================
   Main Component
   ============================================================================= */

export const FavoritesSettingsPanel: React.FC<FavoritesSettingsPanelProps> = ({
  workspaceId,
  galleryId,
  className = '',
  onSettingsChange,
}) => {
  const { addToast } = useToast();

  // State
  const [settings, setSettings] = useState<FavoritesSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track dirty state - used by auto-save feedback
  const [, setIsDirty] = useState(false);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await galleryService.getFavoritesSettings(workspaceId, galleryId);
      setSettings(data as unknown as FavoritesSettings);
    } catch (err) {
      setError('Failed to load settings');
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, galleryId]);

  // Initial load
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Update a single setting with auto-save
  const updateSetting = useCallback(
    async <K extends keyof FavoritesSettings>(key: K, value: FavoritesSettings[K]) => {
      if (!settings) return;

      const previousValue = settings[key];
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);
      setIsDirty(true);

      // Auto-save after a short delay
      setSaving(true);
      try {
        const updated = await galleryService.updateFavoritesSettings(
          workspaceId,
          galleryId,
          { [key]: value }
        );
        const typedUpdated = updated as unknown as FavoritesSettings;
        setSettings(typedUpdated);
        setIsDirty(false);
        onSettingsChange?.(typedUpdated);
        addToast({ variant: 'success', message: 'Setting saved' });
      } catch (err) {
        // Rollback on error
        setSettings({ ...settings, [key]: previousValue });
        addToast({ variant: 'error', message: 'Failed to save setting' });
        console.error('Failed to update setting:', err);
      } finally {
        setSaving(false);
      }
    },
    [settings, workspaceId, galleryId, onSettingsChange, addToast]
  );

  // Handle number input change with debounce
  const handleNumberChange = useCallback(
    (key: 'max_lists_per_client' | 'download_limit_per_client', value: string) => {
      const numValue = parseInt(value, 10);
      if (!isNaN(numValue)) {
        // Clamp to valid ranges
        let clampedValue = numValue;
        if (key === 'max_lists_per_client') {
          clampedValue = Math.max(1, Math.min(20, numValue));
        } else if (key === 'download_limit_per_client') {
          clampedValue = Math.max(1, Math.min(1000, numValue));
        }
        updateSetting(key, clampedValue);
      }
    },
    [updateSetting]
  );

  // Loading state
  if (loading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  // Error state
  if (error || !settings) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <AlertCircle className="w-12 h-12 text-error mx-auto mb-4" />
        <h3 className="text-lg font-medium text-text-primary mb-2">
          Unable to load settings
        </h3>
        <p className="text-text-secondary mb-4">{error}</p>
        <AppButton variant="outline" onClick={fetchSettings}>
          Try Again
        </AppButton>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <Settings className="w-5 h-5 text-text-secondary" />
          Favorites Settings
        </h2>
        {saving && (
          <div className="flex items-center gap-2 text-text-tertiary text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving...
          </div>
        )}
      </div>

      {/* Settings Card */}
      <div className="bg-surface rounded-xl border border-border">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium text-text-primary">Client Favorites</h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            Control how clients can interact with favorites in this gallery
          </p>
        </div>

        <div className="px-4">
          {/* Enable Favorites */}
          <SettingRow
            icon={<Heart className="w-4 h-4 text-primary" />}
            title="Enable Favorites"
            description="Allow clients to mark photos as favorites"
          >
            <Toggle
              checked={settings.favorites_enabled}
              onChange={(e) => updateSetting('favorites_enabled', e.target.checked)}
              aria-label="Enable favorites"
            />
          </SettingRow>

          {/* Enable Sharing */}
          <SettingRow
            icon={<Share2 className="w-4 h-4 text-primary" />}
            title="Enable Sharing"
            description="Allow clients to share their favorite lists via link"
            disabled={!settings.favorites_enabled}
          >
            <Toggle
              checked={settings.sharing_enabled}
              onChange={(e) => updateSetting('sharing_enabled', e.target.checked)}
              disabled={!settings.favorites_enabled}
              aria-label="Enable sharing"
            />
          </SettingRow>

          {/* Enable Downloads */}
          <SettingRow
            icon={<Download className="w-4 h-4 text-primary" />}
            title="Enable Downloads"
            description="Allow clients to download their favorites as a ZIP"
            disabled={!settings.favorites_enabled}
          >
            <Toggle
              checked={settings.download_enabled}
              onChange={(e) => updateSetting('download_enabled', e.target.checked)}
              disabled={!settings.favorites_enabled}
              aria-label="Enable downloads"
            />
          </SettingRow>

          {/* Download Resolution */}
          <SettingRow
            icon={<Image className="w-4 h-4 text-primary" />}
            title="Download Resolution"
            description="Quality of photos in downloaded ZIPs"
            disabled={!settings.favorites_enabled || !settings.download_enabled}
          >
            <Select
              options={[
                { value: 'web_only', label: 'Web Quality' },
                { value: 'original_allowed', label: 'Original Files' },
              ]}
              value={settings.download_resolution}
              onChange={(e) => updateSetting('download_resolution', e.target.value)}
              disabled={!settings.favorites_enabled || !settings.download_enabled}
              selectSize="sm"
              fullWidth={false}
              aria-label="Download resolution"
            />
          </SettingRow>

          {/* Max Lists per Client */}
          <SettingRow
            icon={<Users className="w-4 h-4 text-primary" />}
            title="Max Lists per Client"
            description="Maximum number of favorite lists each client can create (1-20)"
            disabled={!settings.favorites_enabled}
          >
            <AppInput
              type="number"
              min={1}
              max={20}
              value={settings.max_lists_per_client}
              onChange={(e) => handleNumberChange('max_lists_per_client', e.target.value)}
              disabled={!settings.favorites_enabled}
              inputSize="sm"
              fullWidth={false}
              className="w-20"
              aria-label="Maximum lists per client"
            />
          </SettingRow>

          {/* Download Limit per Client */}
          <SettingRow
            icon={<Download className="w-4 h-4 text-primary" />}
            title="Download Limit"
            description="Maximum photos per client download (1-1000)"
            disabled={!settings.favorites_enabled || !settings.download_enabled}
          >
            <AppInput
              type="number"
              min={1}
              max={1000}
              value={settings.download_limit_per_client}
              onChange={(e) => handleNumberChange('download_limit_per_client', e.target.value)}
              disabled={!settings.favorites_enabled || !settings.download_enabled}
              inputSize="sm"
              fullWidth={false}
              className="w-24"
              aria-label="Download limit per client"
            />
          </SettingRow>
        </div>
      </div>

      {/* Info Note */}
      <div className="flex items-start gap-3 p-4 bg-info/10 rounded-lg border border-info/20">
        <AlertCircle className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-text-primary font-medium">
            Changes apply immediately
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            Settings are saved automatically when changed. Clients will see the updated behavior on their next visit.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FavoritesSettingsPanel;
