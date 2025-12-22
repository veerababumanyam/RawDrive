/**
 * Theme Customization Component
 *
 * Provides UI for customizing theme colors, typography, and layout:
 * - Color picker for primary/secondary/accent colors
 * - Font selector for heading/body fonts
 * - Layout options (spacing, style)
 * - Real-time preview of changes
 * - Preset color palettes
 * - Color harmony suggestions
 * - WCAG contrast validation
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.7, 8.8, 8.9, 8.12
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Palette,
  Type,
  RefreshCw,
  Droplets,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';

import { AppButton } from '../../ui/AppButton';
import { fontService } from '../../../services/fontService';
import type {
  Theme,
  ThemeCustomization as ThemeCustomizationType,
  ColorPalette,
  TypographyConfig,
  LayoutPreferences,
} from '../../../types/profileEditor';

// =============================================================================
// Types
// =============================================================================

interface ThemeCustomizationProps {
  /** Base theme being customized */
  theme: Theme;
  /** Current customization values */
  customization: Partial<ThemeCustomizationType> | null;
  /** Callback when customization changes */
  onChange: (changes: Partial<ThemeCustomizationType>) => void;
  /** Callback to reset customization */
  onReset: () => void;
  /** Whether the customization is disabled */
  disabled?: boolean;
}

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

interface ContrastInfo {
  ratio: number;
  passesAA: boolean;
  passesAAA: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const PRESET_PALETTES = [
  {
    name: 'Ocean',
    primary: '#0EA5E9',
    secondary: '#0284C7',
    accent: '#06B6D4',
  },
  {
    name: 'Sunset',
    primary: '#F97316',
    secondary: '#EA580C',
    accent: '#FBBF24',
  },
  {
    name: 'Forest',
    primary: '#10B981',
    secondary: '#059669',
    accent: '#34D399',
  },
  {
    name: 'Lavender',
    primary: '#8B5CF6',
    secondary: '#7C3AED',
    accent: '#A78BFA',
  },
  {
    name: 'Rose',
    primary: '#EC4899',
    secondary: '#DB2777',
    accent: '#F472B6',
  },
  {
    name: 'Slate',
    primary: '#475569',
    secondary: '#334155',
    accent: '#64748B',
  },
];

const FONT_OPTIONS = [
  { family: 'Inter', category: 'sans-serif' },
  { family: 'Poppins', category: 'sans-serif' },
  { family: 'Plus Jakarta Sans', category: 'sans-serif' },
  { family: 'DM Sans', category: 'sans-serif' },
  { family: 'Playfair Display', category: 'serif' },
  { family: 'Lora', category: 'serif' },
  { family: 'Cormorant Garamond', category: 'serif' },
  { family: 'Space Grotesk', category: 'sans-serif' },
  { family: 'Crimson Pro', category: 'serif' },
  { family: 'Source Sans 3', category: 'sans-serif' },
];

const SPACING_OPTIONS: LayoutPreferences['spacing'][] = ['compact', 'normal', 'spacious'];
const HERO_OPTIONS: LayoutPreferences['hero_style'][] = ['card', 'full-bleed'];
const LAYOUT_OPTIONS: LayoutPreferences['section_layout'][] = ['single-column', 'two-column'];

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate contrast ratio between two colors
 */
function getContrastRatio(color1: string, color2: string): number {
  const getLuminance = (hex: string): number => {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;
    const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Check WCAG contrast compliance
 */
function checkContrast(foreground: string, background: string): ContrastInfo {
  const ratio = getContrastRatio(foreground, background);
  return {
    ratio: Math.round(ratio * 100) / 100,
    passesAA: ratio >= 4.5,
    passesAAA: ratio >= 7,
  };
}

// =============================================================================
// Color Picker Component
// =============================================================================

const ColorPicker: React.FC<ColorPickerProps> = ({
  label,
  value,
  onChange,
  disabled,
}) => {
  // Local state for intermediate typing (allows partial hex input)
  const [localValue, setLocalValue] = React.useState(value);

  // Sync local value when prop changes
  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Validate complete hex color
  const isValidHex = (hex: string): boolean => /^#[0-9A-Fa-f]{6}$/.test(hex);

  // Handle text input change
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.toUpperCase();

    // Ensure # prefix
    if (!val.startsWith('#')) {
      val = '#' + val.replace('#', '');
    }

    // Allow partial typing but validate format
    if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
      setLocalValue(val);

      // Only propagate complete, valid hex colors
      if (isValidHex(val)) {
        onChange(val);
      }
    }
  };

  // Handle blur - reset to last valid value if invalid
  const handleBlur = () => {
    if (!isValidHex(localValue)) {
      setLocalValue(value);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <label className="flex-1 text-sm text-text-secondary" id={`label-${label.replace(/\s/g, '-').toLowerCase()}`}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <div
          className="relative w-8 h-8 rounded-md border border-border overflow-hidden"
          style={{ backgroundColor: isValidHex(value) ? value : '#000000' }}
        >
          <input
            type="color"
            value={isValidHex(value) ? value : '#000000'}
            onChange={(e) => {
              const newVal = e.target.value.toUpperCase();
              setLocalValue(newVal);
              onChange(newVal);
            }}
            disabled={disabled}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            aria-label={`${label} color picker`}
          />
        </div>
        <input
          type="text"
          value={localValue}
          onChange={handleTextChange}
          onBlur={handleBlur}
          disabled={disabled}
          className={`w-20 px-2 py-1 text-xs font-mono rounded border bg-surface focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 ${
            isValidHex(localValue) ? 'border-border' : 'border-warning'
          }`}
          placeholder="#000000"
          maxLength={7}
          aria-labelledby={`label-${label.replace(/\s/g, '-').toLowerCase()}`}
          aria-invalid={!isValidHex(localValue)}
        />
      </div>
    </div>
  );
};

// =============================================================================
// Collapsible Section Component
// =============================================================================

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  defaultOpen = true,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-surface-hover hover:bg-surface transition-colors"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-text-primary">{title}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-text-tertiary" />
        ) : (
          <ChevronDown className="w-4 h-4 text-text-tertiary" />
        )}
      </button>
      {isOpen && <div className="p-4 border-t border-border">{children}</div>}
    </div>
  );
};

// =============================================================================
// Theme Customization Component
// =============================================================================

export const ThemeCustomization: React.FC<ThemeCustomizationProps> = ({
  theme,
  customization,
  onChange,
  onReset,
  disabled = false,
}) => {
  // Get effective values (customization overrides theme defaults)
  const effectiveColors = useMemo((): ColorPalette => {
    return {
      primary: customization?.custom_colors?.primary || theme.base_colors.primary,
      secondary: customization?.custom_colors?.secondary || theme.base_colors.secondary,
      accent: customization?.custom_colors?.accent || theme.base_colors.accent,
      neutral: customization?.custom_colors?.neutral || theme.base_colors.neutral,
      gradients: customization?.custom_colors?.gradients || theme.base_colors.gradients,
    };
  }, [theme.base_colors, customization?.custom_colors]);

  const effectiveTypography = useMemo((): TypographyConfig => {
    return {
      heading_font: {
        ...theme.default_typography.heading_font,
        ...customization?.custom_typography?.heading_font,
      },
      body_font: {
        ...theme.default_typography.body_font,
        ...customization?.custom_typography?.body_font,
      },
      accent_font: customization?.custom_typography?.accent_font || theme.default_typography.accent_font,
    };
  }, [theme.default_typography, customization?.custom_typography]);

  const effectiveLayout = useMemo((): LayoutPreferences => {
    return {
      ...theme.layout_config,
      ...customization?.custom_layout,
    };
  }, [theme.layout_config, customization?.custom_layout]);

  // Check if any customizations have been made
  const hasChanges = useMemo(() => {
    return !!(
      customization?.custom_colors ||
      customization?.custom_typography ||
      customization?.custom_layout
    );
  }, [customization]);

  // Check contrast for accessibility
  const contrastCheck = useMemo((): ContrastInfo => {
    // Check primary color against white background
    return checkContrast(effectiveColors.primary, '#FFFFFF');
  }, [effectiveColors.primary]);

  // Handlers
  const handleColorChange = useCallback(
    (key: keyof ColorPalette, value: string) => {
      onChange({
        custom_colors: {
          ...customization?.custom_colors,
          [key]: value,
        },
      });
    },
    [customization, onChange]
  );

  const handleApplyPalette = useCallback(
    (palette: (typeof PRESET_PALETTES)[0]) => {
      onChange({
        custom_colors: {
          ...customization?.custom_colors,
          primary: palette.primary,
          secondary: palette.secondary,
          accent: palette.accent,
        },
      });
    },
    [customization, onChange]
  );

  const handleFontChange = useCallback(
    (role: 'heading_font' | 'body_font', family: string) => {
      onChange({
        custom_typography: {
          ...customization?.custom_typography,
          [role]: {
            ...(customization?.custom_typography?.[role] || theme.default_typography[role]),
            family,
            source: 'web',
          },
        },
      });
    },
    [customization, theme.default_typography, onChange]
  );

  const handleLayoutChange = useCallback(
    (key: keyof LayoutPreferences, value: string) => {
      onChange({
        custom_layout: {
          ...customization?.custom_layout,
          [key]: value,
        },
      });
    },
    [customization, onChange]
  );

  // Load all available fonts for the dropdown and preview
  useEffect(() => {
    // Load all fonts in the FONT_OPTIONS list
    for (const font of FONT_OPTIONS) {
      if (!fontService.isFontLoaded(font.family)) {
        fontService.loadFont(font.family).catch(console.error);
      }
    }
  }, []);

  // Load selected fonts when they change
  useEffect(() => {
    const headingFamily = effectiveTypography.heading_font.family;
    const bodyFamily = effectiveTypography.body_font.family;

    if (headingFamily && !fontService.isFontLoaded(headingFamily)) {
      fontService.loadFont(headingFamily).catch(console.error);
    }
    if (bodyFamily && !fontService.isFontLoaded(bodyFamily)) {
      fontService.loadFont(bodyFamily).catch(console.error);
    }
  }, [effectiveTypography.heading_font.family, effectiveTypography.body_font.family]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-text-primary">Customize Theme</h3>
          <p className="text-sm text-text-tertiary">
            Personalize the <strong>{theme.name}</strong> theme
          </p>
        </div>
        {hasChanges && (
          <AppButton
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={disabled}
            title="Reset to theme defaults"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Reset
          </AppButton>
        )}
      </div>

      {/* Colors Section */}
      <CollapsibleSection
        title="Colors"
        icon={<Palette className="w-4 h-4 text-primary" />}
        defaultOpen={true}
      >
        <div className="space-y-4">
          {/* Color pickers */}
          <div className="space-y-3">
            <ColorPicker
              label="Primary Color"
              value={effectiveColors.primary}
              onChange={(v) => handleColorChange('primary', v)}
              disabled={disabled}
            />
            <ColorPicker
              label="Secondary Color"
              value={effectiveColors.secondary}
              onChange={(v) => handleColorChange('secondary', v)}
              disabled={disabled}
            />
            <ColorPicker
              label="Accent Color"
              value={effectiveColors.accent}
              onChange={(v) => handleColorChange('accent', v)}
              disabled={disabled}
            />
          </div>

          {/* Contrast warning */}
          {!contrastCheck.passesAA && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-warning">Low contrast detected</p>
                <p className="text-text-secondary mt-0.5">
                  Primary color has a contrast ratio of {contrastCheck.ratio}:1.
                  WCAG AA requires at least 4.5:1 for text.
                </p>
              </div>
            </div>
          )}

          {contrastCheck.passesAA && (
            <div className="flex items-center gap-2 text-sm text-success">
              <Check className="w-4 h-4" />
              <span>
                Contrast ratio: {contrastCheck.ratio}:1
                {contrastCheck.passesAAA ? ' (AAA)' : ' (AA)'}
              </span>
            </div>
          )}

          {/* Preset palettes */}
          <div className="pt-2 border-t border-border">
            <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
              Quick Palettes
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PRESET_PALETTES.map((palette) => (
                <button
                  key={palette.name}
                  type="button"
                  onClick={() => handleApplyPalette(palette)}
                  disabled={disabled}
                  className="group flex items-center gap-2 p-2 rounded-lg border border-border hover:border-primary/50 transition-all disabled:opacity-50"
                  aria-label={`Apply ${palette.name} color palette`}
                >
                  <div className="flex -space-x-1">
                    <div
                      className="w-4 h-4 rounded-full border border-white"
                      style={{ backgroundColor: palette.primary }}
                    />
                    <div
                      className="w-4 h-4 rounded-full border border-white"
                      style={{ backgroundColor: palette.secondary }}
                    />
                    <div
                      className="w-4 h-4 rounded-full border border-white"
                      style={{ backgroundColor: palette.accent }}
                    />
                  </div>
                  <span className="text-xs text-text-secondary group-hover:text-text-primary">
                    {palette.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Typography Section */}
      <CollapsibleSection
        title="Typography"
        icon={<Type className="w-4 h-4 text-primary" />}
        defaultOpen={false}
      >
        <div className="space-y-4">
          {/* Heading font */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              Heading Font
            </label>
            <select
              value={effectiveTypography.heading_font.family}
              onChange={(e) => handleFontChange('heading_font', e.target.value)}
              disabled={disabled}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              style={{ fontFamily: effectiveTypography.heading_font.family }}
            >
              {FONT_OPTIONS.map((font) => (
                <option
                  key={font.family}
                  value={font.family}
                  style={{ fontFamily: font.family }}
                >
                  {font.family}
                </option>
              ))}
            </select>
          </div>

          {/* Body font */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              Body Font
            </label>
            <select
              value={effectiveTypography.body_font.family}
              onChange={(e) => handleFontChange('body_font', e.target.value)}
              disabled={disabled}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              style={{ fontFamily: effectiveTypography.body_font.family }}
            >
              {FONT_OPTIONS.map((font) => (
                <option
                  key={font.family}
                  value={font.family}
                  style={{ fontFamily: font.family }}
                >
                  {font.family}
                </option>
              ))}
            </select>
          </div>

          {/* Font preview */}
          <div className="p-3 rounded-lg bg-surface-hover">
            <p
              className="text-lg font-semibold mb-1"
              style={{ fontFamily: effectiveTypography.heading_font.family }}
            >
              Heading Preview
            </p>
            <p
              className="text-sm text-text-secondary"
              style={{ fontFamily: effectiveTypography.body_font.family }}
            >
              Body text preview with your selected font. The quick brown fox jumps over the lazy dog.
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Layout Section */}
      <CollapsibleSection
        title="Layout"
        icon={<Layers className="w-4 h-4 text-primary" />}
        defaultOpen={false}
      >
        <div className="space-y-4">
          {/* Spacing */}
          <div>
            <label className="block text-sm text-text-secondary mb-2">Spacing</label>
            <div className="flex gap-2">
              {SPACING_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleLayoutChange('spacing', option)}
                  disabled={disabled}
                  className={`
                    flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all capitalize
                    ${effectiveLayout.spacing === option
                      ? 'bg-primary text-white'
                      : 'bg-surface-hover text-text-secondary hover:bg-surface hover:text-text-primary'
                    }
                    disabled:opacity-50
                  `}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* Hero style */}
          <div>
            <label className="block text-sm text-text-secondary mb-2">Hero Style</label>
            <div className="flex gap-2">
              {HERO_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleLayoutChange('hero_style', option)}
                  disabled={disabled}
                  className={`
                    flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all
                    ${effectiveLayout.hero_style === option
                      ? 'bg-primary text-white'
                      : 'bg-surface-hover text-text-secondary hover:bg-surface hover:text-text-primary'
                    }
                    disabled:opacity-50
                  `}
                >
                  {option === 'card' ? 'Card' : 'Full Bleed'}
                </button>
              ))}
            </div>
          </div>

          {/* Section layout */}
          <div>
            <label className="block text-sm text-text-secondary mb-2">Section Layout</label>
            <div className="flex gap-2">
              {LAYOUT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleLayoutChange('section_layout', option)}
                  disabled={disabled}
                  className={`
                    flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all
                    ${effectiveLayout.section_layout === option
                      ? 'bg-primary text-white'
                      : 'bg-surface-hover text-text-secondary hover:bg-surface hover:text-text-primary'
                    }
                    disabled:opacity-50
                  `}
                >
                  {option === 'single-column' ? 'Single Column' : 'Two Column'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Changes indicator */}
      {hasChanges && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-accent/5 border border-accent/20">
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-accent" />
            <span className="text-sm text-text-primary">
              Theme customized
            </span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent font-medium">
            Modified
          </span>
        </div>
      )}
    </div>
  );
};

export default ThemeCustomization;
