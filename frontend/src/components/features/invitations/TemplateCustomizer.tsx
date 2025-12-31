/**
 * TemplateCustomizer: Customize template colors, fonts, and styles
 *
 * Features:
 * - Color picker for primary, secondary, accent, and background
 * - Font family selection
 * - Real-time preview updates
 * - Reset to template defaults
 *
 * Feature: 016-save-the-date
 */

import React, { useCallback } from 'react';
import { RotateCcw, Palette, Type, Sparkles } from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { Select } from '@/components/ui/FormControls';
import type { TemplateLayout } from '@/types/invitations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomizationData {
  colors: Record<string, string>;
  fonts: Record<string, string>;
}

interface TemplateCustomizerProps {
  /** Current customization values */
  customization: CustomizationData;
  /** Original template layout for reset functionality */
  templateDefaults?: TemplateLayout;
  /** Callback when customization changes */
  onChange: (customization: CustomizationData) => void;
  /** Optional className */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter (Sans)' },
  { value: 'Playfair Display', label: 'Playfair Display (Serif)' },
  { value: 'Lora', label: 'Lora (Serif)' },
  { value: 'Roboto', label: 'Roboto (Sans)' },
  { value: 'Poppins', label: 'Poppins (Sans)' },
  { value: 'Montserrat', label: 'Montserrat (Sans)' },
  { value: 'Dancing Script', label: 'Dancing Script (Script)' },
  { value: 'Great Vibes', label: 'Great Vibes (Script)' },
  { value: 'Cormorant Garamond', label: 'Cormorant Garamond (Serif)' },
];

const COLOR_PRESETS = [
  {
    name: 'Classic Gold',
    colors: {
      primary: '#D4AF37',
      secondary: '#8B7355',
      accent: '#F4E4B0',
      background: '#FFFEF7',
    },
  },
  {
    name: 'Elegant Blush',
    colors: {
      primary: '#E8B4B8',
      secondary: '#67595E',
      accent: '#A49393',
      background: '#FFF5F5',
    },
  },
  {
    name: 'Modern Slate',
    colors: {
      primary: '#475569',
      secondary: '#1E293B',
      accent: '#06B6D4',
      background: '#F8FAFC',
    },
  },
  {
    name: 'Forest Green',
    colors: {
      primary: '#2D5A27',
      secondary: '#4A7C59',
      accent: '#90B77D',
      background: '#F0F7EE',
    },
  },
  {
    name: 'Royal Purple',
    colors: {
      primary: '#6B21A8',
      secondary: '#7C3AED',
      accent: '#C4B5FD',
      background: '#FAF5FF',
    },
  },
  {
    name: 'Ocean Blue',
    colors: {
      primary: '#0369A1',
      secondary: '#0284C7',
      accent: '#38BDF8',
      background: '#F0F9FF',
    },
  },
];

// ---------------------------------------------------------------------------
// Color Input Component
// ---------------------------------------------------------------------------

interface ColorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const ColorInput: React.FC<ColorInputProps> = ({ label, value, onChange }) => {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-text-secondary">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded cursor-pointer border border-border"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-2 text-sm bg-surface border border-border rounded-input text-text-primary uppercase"
          pattern="^#[0-9A-Fa-f]{6}$"
          maxLength={7}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const TemplateCustomizer: React.FC<TemplateCustomizerProps> = ({
  customization,
  templateDefaults,
  onChange,
  className = '',
}) => {
  // Update a single color
  const updateColor = useCallback(
    (colorKey: string, value: string) => {
      onChange({
        ...customization,
        colors: {
          ...customization.colors,
          [colorKey]: value,
        },
      });
    },
    [customization, onChange]
  );

  // Update a font
  const updateFont = useCallback(
    (fontKey: string, value: string) => {
      onChange({
        ...customization,
        fonts: {
          ...customization.fonts,
          [fontKey]: value,
        },
      });
    },
    [customization, onChange]
  );

  // Apply a color preset
  const applyPreset = useCallback(
    (preset: (typeof COLOR_PRESETS)[0]) => {
      onChange({
        ...customization,
        colors: { ...preset.colors },
      });
    },
    [customization, onChange]
  );

  // Reset to template defaults
  const resetToDefaults = useCallback(() => {
    if (templateDefaults) {
      onChange({
        colors: { ...templateDefaults.colors },
        fonts: { ...templateDefaults.fonts },
      });
    }
  }, [templateDefaults, onChange]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Color Presets */}
      <section>
        <h4 className="text-base font-medium text-text-primary mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Color Presets
        </h4>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyPreset(preset)}
              className="group flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/50 transition-colors"
            >
              <div className="flex -space-x-1">
                {Object.values(preset.colors)
                  .slice(0, 3)
                  .map((color, i) => (
                    <div
                      key={i}
                      className="w-4 h-4 rounded-full border border-white"
                      style={{ backgroundColor: color }}
                    />
                  ))}
              </div>
              <span className="text-xs text-text-secondary group-hover:text-text-primary">
                {preset.name}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Custom Colors */}
      <section>
        <h4 className="text-base font-medium text-text-primary mb-3 flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          Custom Colors
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <ColorInput
            label="Primary"
            value={customization.colors?.primary || '#6366f1'}
            onChange={(v) => updateColor('primary', v)}
          />
          <ColorInput
            label="Secondary"
            value={customization.colors?.secondary || '#8b5cf6'}
            onChange={(v) => updateColor('secondary', v)}
          />
          <ColorInput
            label="Accent"
            value={customization.colors?.accent || '#f59e0b'}
            onChange={(v) => updateColor('accent', v)}
          />
          <ColorInput
            label="Background"
            value={customization.colors?.background || '#ffffff'}
            onChange={(v) => updateColor('background', v)}
          />
        </div>
      </section>

      {/* Fonts */}
      <section>
        <h4 className="text-base font-medium text-text-primary mb-3 flex items-center gap-2">
          <Type className="w-4 h-4 text-primary" />
          Typography
        </h4>
        <div className="space-y-4">
          <Select
            label="Heading Font"
            options={FONT_OPTIONS}
            value={customization.fonts?.heading || 'Playfair Display'}
            onChange={(e) => updateFont('heading', e.target.value)}
          />
          <Select
            label="Body Font"
            options={FONT_OPTIONS}
            value={customization.fonts?.body || 'Inter'}
            onChange={(e) => updateFont('body', e.target.value)}
          />
        </div>
      </section>

      {/* Font Preview */}
      <section className="p-4 bg-surface-hover rounded-lg">
        <p className="text-xs text-text-tertiary mb-2">Preview</p>
        <p
          className="text-2xl mb-2"
          style={{
            fontFamily: customization.fonts?.heading || 'Playfair Display',
            color: customization.colors?.primary || '#6366f1',
          }}
        >
          Your Event Title
        </p>
        <p
          className="text-sm"
          style={{
            fontFamily: customization.fonts?.body || 'Inter',
            color: customization.colors?.secondary || '#8b5cf6',
          }}
        >
          You&apos;re invited to celebrate this special occasion with us.
        </p>
      </section>

      {/* Reset Button */}
      {templateDefaults && (
        <div className="pt-4 border-t border-border">
          <AppButton
            variant="ghost"
            size="sm"
            onClick={resetToDefaults}
            className="text-text-secondary"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to Template Defaults
          </AppButton>
        </div>
      )}
    </div>
  );
};

export default TemplateCustomizer;
