/**
 * SlideshowSettings Component
 * Settings for gallery slideshow feature with audio support
 *
 * Feature: 027-gallery-feature-completion
 * User Story: US10 - Slideshow Background Music
 */

import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Music, Volume2, VolumeX, Upload, X, AlertCircle } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { Toggle, Select } from '../../ui/FormControls';
import type { SelectOption } from '../../ui/FormControls';
import type { GalleryDetailData, GalleryUpdateRequest, SlideshowConfig } from '../../../types/gallery';

const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/aac'];
const MAX_AUDIO_SIZE_MB = 50;

export interface SlideshowSettingsProps {
  gallery: GalleryDetailData;
  onUpdate: (updates: Partial<GalleryUpdateRequest>) => void;
  onAudioUpload?: (file: File) => Promise<string>; // Returns URL after upload
}

const transitionOptions: SelectOption[] = [
  { value: 'fade', label: 'Fade (Default)' },
  { value: 'slide', label: 'Slide' },
  { value: 'zoom', label: 'Ken Burns (Zoom)' },
  { value: 'none', label: 'None (Instant)' },
];

const intervalOptions: SelectOption[] = [
  { value: '3', label: '3 seconds (Quick)' },
  { value: '5', label: '5 seconds (Default)' },
  { value: '7', label: '7 seconds' },
  { value: '10', label: '10 seconds' },
  { value: '15', label: '15 seconds (Slow)' },
  { value: '20', label: '20 seconds' },
  { value: '30', label: '30 seconds (Very Slow)' },
];

export const SlideshowSettings: React.FC<SlideshowSettingsProps> = ({ gallery, onUpdate, onAudioUpload }) => {
  const { t } = useTranslation('gallery');
  const currentConfig = gallery.slideshow_config || { enabled: true };
  const [config, setConfig] = useState<SlideshowConfig>(currentConfig);
  const [isUploading, setIsUploading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleConfigChange = useCallback((updates: Partial<SlideshowConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onUpdate({ slideshow_config: newConfig });
  }, [config, onUpdate]);

  const handleToggle = useCallback((enabled: boolean) => {
    handleConfigChange({ enabled });
  }, [handleConfigChange]);

  const handleAudioFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAudioError(null);

    // Validate file type
    if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
      setAudioError(t('slideshow.audio.invalidType', 'Please select an MP3, WAV, OGG, or M4A file'));
      return;
    }

    // Validate file size
    if (file.size > MAX_AUDIO_SIZE_MB * 1024 * 1024) {
      setAudioError(t('slideshow.audio.fileTooLarge', `Audio file must be less than ${MAX_AUDIO_SIZE_MB}MB`));
      return;
    }

    if (!onAudioUpload) {
      // For now, create a local object URL (in production, would upload to storage)
      const url = URL.createObjectURL(file);
      handleConfigChange({
        audio_enabled: true,
        audio_url: url,
      });
      return;
    }

    setIsUploading(true);
    try {
      const audioUrl = await onAudioUpload(file);
      handleConfigChange({
        audio_enabled: true,
        audio_url: audioUrl,
      });
    } catch (err: any) {
      setAudioError(err.message || t('slideshow.audio.uploadFailed', 'Failed to upload audio'));
    } finally {
      setIsUploading(false);
    }
  }, [onAudioUpload, handleConfigChange, t]);

  const handleRemoveAudio = useCallback(() => {
    handleConfigChange({
      audio_enabled: false,
      audio_url: undefined,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleConfigChange]);

  return (
    <div className="space-y-6">
      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Play size={20} />
          Slideshow Settings
        </h3>
        <div className="space-y-4">
          <Toggle
            label="Enable slideshow mode"
            checked={config.enabled ?? true}
            onChange={(e) => handleToggle(e.target.checked)}
            description="Allow clients to view photos as an automatic slideshow"
          />

          {config.enabled !== false && (
            <div className="space-y-4 pt-4 border-t border-border">
              {/* Autoplay */}
              <Toggle
                label="Autoplay on open"
                checked={config.autoplay ?? false}
                onChange={(e) => handleConfigChange({ autoplay: e.target.checked })}
                description="Automatically start slideshow when lightbox opens"
              />

              {/* Interval */}
              <Select
                label="Slide Duration"
                options={intervalOptions}
                value={String(config.interval_seconds ?? 5)}
                onChange={(e) => handleConfigChange({ interval_seconds: parseInt(e.target.value) })}
                helperText="How long each photo is displayed"
              />

              {/* Transition */}
              <Select
                label="Transition Effect"
                options={transitionOptions}
                value={config.transition || 'fade'}
                onChange={(e) => handleConfigChange({ transition: e.target.value as SlideshowConfig['transition'] })}
                helperText="Animation between slides"
              />

              {/* Loop */}
              <Toggle
                label="Loop slideshow"
                checked={config.loop ?? true}
                onChange={(e) => handleConfigChange({ loop: e.target.checked })}
                description="Restart from beginning after reaching the last photo"
              />

              {/* Show Captions */}
              <Toggle
                label="Show captions"
                checked={config.show_captions ?? true}
                onChange={(e) => handleConfigChange({ show_captions: e.target.checked })}
                description="Display photo captions during slideshow"
              />
            </div>
          )}
        </div>
      </AppCard>

      {/* Preview Animation */}
      {config.enabled !== false && (
        <AppCard padding="md">
          <h4 className="text-sm font-medium text-text-primary mb-3">Transition Preview</h4>
          <div className="relative w-full aspect-video bg-gradient-to-br from-slate-700 to-slate-800 rounded-lg overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary/20 flex items-center justify-center">
                  {config.autoplay ? (
                    <Play size={24} className="text-primary ml-1" />
                  ) : (
                    <Pause size={24} className="text-primary" />
                  )}
                </div>
                <p className="text-sm text-text-secondary">
                  {config.transition === 'fade' && 'Smooth fade between photos'}
                  {config.transition === 'slide' && 'Horizontal slide transition'}
                  {config.transition === 'zoom' && 'Ken Burns zoom effect'}
                  {config.transition === 'none' && 'Instant transition'}
                </p>
                <p className="text-xs text-text-tertiary mt-1">
                  {config.interval_seconds ?? 5} seconds per slide
                  {config.loop && ' • Loops continuously'}
                </p>
              </div>
            </div>
          </div>
        </AppCard>
      )}

      {/* Background Music Settings */}
      {config.enabled !== false && (
        <AppCard padding="md">
          <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Music size={20} />
            {t('slideshow.audio.title', 'Background Music')}
          </h3>

          <div className="space-y-4">
            {/* Audio Enable Toggle */}
            <Toggle
              label={t('slideshow.audio.enable', 'Enable background music')}
              checked={config.audio_enabled ?? false}
              onChange={(e) => handleConfigChange({ audio_enabled: e.target.checked })}
              description={t('slideshow.audio.enableDesc', 'Play music during the slideshow')}
            />

            {config.audio_enabled && (
              <div className="space-y-4 pt-4 border-t border-border">
                {/* Audio Upload */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    {t('slideshow.audio.file', 'Audio File')}
                  </label>

                  {config.audio_url ? (
                    <div className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <Music size={20} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">
                          {t('slideshow.audio.uploaded', 'Audio file uploaded')}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          {t('slideshow.audio.ready', 'Ready to play during slideshow')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveAudio}
                        className="p-2 text-text-tertiary hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                        aria-label={t('slideshow.audio.remove', 'Remove audio')}
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={ALLOWED_AUDIO_TYPES.join(',')}
                        onChange={handleAudioFileSelect}
                        className="hidden"
                        id="audio-upload"
                      />
                      <label
                        htmlFor="audio-upload"
                        className={`flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors ${
                          isUploading ? 'opacity-50 pointer-events-none' : ''
                        }`}
                      >
                        <Upload size={20} className="text-text-secondary" />
                        <span className="text-sm text-text-secondary">
                          {isUploading
                            ? t('slideshow.audio.uploading', 'Uploading...')
                            : t('slideshow.audio.upload', 'Upload audio file')}
                        </span>
                      </label>
                      <p className="text-xs text-text-tertiary mt-2">
                        {t('slideshow.audio.formats', 'MP3, WAV, OGG, or M4A. Max {{size}}MB.', { size: MAX_AUDIO_SIZE_MB })}
                      </p>
                    </div>
                  )}

                  {audioError && (
                    <div className="flex items-center gap-2 mt-2 p-2 bg-error/10 rounded-lg">
                      <AlertCircle size={16} className="text-error flex-shrink-0" />
                      <p className="text-sm text-error">{audioError}</p>
                    </div>
                  )}
                </div>

                {/* Volume Control */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    {t('slideshow.audio.volume', 'Volume')}
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleConfigChange({ audio_volume: 0 })}
                      className="p-2 text-text-secondary hover:text-text-primary transition-colors"
                      aria-label={t('slideshow.audio.mute', 'Mute')}
                    >
                      <VolumeX size={18} />
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={(config.audio_volume ?? 0.7) * 100}
                      onChange={(e) => handleConfigChange({ audio_volume: parseInt(e.target.value) / 100 })}
                      className="flex-1 h-2 bg-surface-tertiary rounded-lg appearance-none cursor-pointer accent-primary"
                      aria-label={t('slideshow.audio.volumeSlider', 'Volume slider')}
                    />
                    <button
                      type="button"
                      onClick={() => handleConfigChange({ audio_volume: 1 })}
                      className="p-2 text-text-secondary hover:text-text-primary transition-colors"
                      aria-label={t('slideshow.audio.maxVolume', 'Max volume')}
                    >
                      <Volume2 size={18} />
                    </button>
                    <span className="text-sm text-text-secondary w-12 text-right">
                      {Math.round((config.audio_volume ?? 0.7) * 100)}%
                    </span>
                  </div>
                </div>

                {/* Audio Autoplay */}
                <Toggle
                  label={t('slideshow.audio.autoplay', 'Autoplay music')}
                  checked={config.audio_autoplay ?? true}
                  onChange={(e) => handleConfigChange({ audio_autoplay: e.target.checked })}
                  description={t('slideshow.audio.autoplayDesc', 'Start playing automatically when slideshow begins')}
                />

                {/* Audio Loop */}
                <Toggle
                  label={t('slideshow.audio.loop', 'Loop music')}
                  checked={config.audio_loop ?? true}
                  onChange={(e) => handleConfigChange({ audio_loop: e.target.checked })}
                  description={t('slideshow.audio.loopDesc', 'Repeat audio when it ends')}
                />

                {/* Crossfade */}
                <Toggle
                  label={t('slideshow.audio.crossfade', 'Crossfade on transitions')}
                  checked={config.audio_crossfade ?? false}
                  onChange={(e) => handleConfigChange({ audio_crossfade: e.target.checked })}
                  description={t('slideshow.audio.crossfadeDesc', 'Subtly adjust volume during slide transitions')}
                />
              </div>
            )}
          </div>
        </AppCard>
      )}
    </div>
  );
};
