/**
 * Color Palette Builder Component
 *
 * Provides color customization with contrast validation,
 * palette extraction from logo, and accessibility warnings.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import React, { useState, useCallback, useMemo } from 'react';
import { RefreshCw, AlertTriangle, Wand2 } from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import type { ColorPalette } from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

interface ColorPaletteBuilderProps {
  currentPalette?: Partial<ColorPalette>;
  themePalette?: ColorPalette;
  onUpdate: (colors: Partial<ColorPalette>) => void;
  logoUrl?: string;
}

interface ColorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  contrastWith?: string;
  minContrastRatio?: number;
}

// =============================================================================
// Constants
// =============================================================================

const COLOR_FIELDS: {
  key: keyof Pick<ColorPalette, 'primary' | 'secondary' | 'accent'>;
  label: string;
  description: string;
}[] = [
  {
    key: 'primary',
    label: 'Primary',
    description: 'Main brand color for headings and key elements',
  },
  {
    key: 'secondary',
    label: 'Secondary',
    description: 'Supporting color for text and subtle elements',
  },
  {
    key: 'accent',
    label: 'Accent',
    description: 'Highlight color for buttons and interactive elements',
  },
];

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate relative luminance of a color
 */
function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors
 */
function getContrastRatio(color1: string, color2: string): number {
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Convert hex to RGB
 */
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
 * Check if a string is a valid hex color
 */
function isValidHex(hex: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(hex);
}

/**
 * Get accessibility rating
 */
function getAccessibilityRating(ratio: number): {
  rating: 'AAA' | 'AA' | 'fail';
  label: string;
  color: string;
} {
  if (ratio >= 7) {
    return { rating: 'AAA', label: 'Excellent contrast', color: 'text-success' };
  } else if (ratio >= 4.5) {
    return { rating: 'AA', label: 'Good contrast', color: 'text-accent' };
  } else {
    return { rating: 'fail', label: 'Poor contrast', color: 'text-error' };
  }
}

// =============================================================================
// Component
// =============================================================================

export const ColorPaletteBuilder: React.FC<ColorPaletteBuilderProps> = ({
  currentPalette,
  themePalette,
  onUpdate,
  logoUrl,
}) => {
  const [isExtracting, setIsExtracting] = useState(false);

  // Merged palette (current overrides theme)
  const effectivePalette = useMemo(
    () => ({
      primary: currentPalette?.primary || themePalette?.primary || '#2563EB',
      secondary: currentPalette?.secondary || themePalette?.secondary || '#64748B',
      accent: currentPalette?.accent || themePalette?.accent || '#06B6D4',
    }),
    [currentPalette, themePalette]
  );

  // Handle color change
  const handleColorChange = useCallback(
    (key: keyof Pick<ColorPalette, 'primary' | 'secondary' | 'accent'>, value: string) => {
      if (!isValidHex(value) && value !== '') return;
      onUpdate({ [key]: value });
    },
    [onUpdate]
  );

  // Reset to theme defaults
  const handleReset = useCallback(() => {
    onUpdate({
      primary: undefined,
      secondary: undefined,
      accent: undefined,
    });
  }, [onUpdate]);

  // Extract colors from logo (placeholder - would need server-side processing)
  const handleExtractFromLogo = useCallback(async () => {
    if (!logoUrl) return;

    setIsExtracting(true);
    try {
      // In a real implementation, this would call an API to extract colors
      // For now, we'll simulate the extraction
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Simulated extracted colors
      onUpdate({
        primary: '#3B82F6',
        accent: '#10B981',
      });
    } catch (err) {
      console.error('Failed to extract colors:', err);
    } finally {
      setIsExtracting(false);
    }
  }, [logoUrl, onUpdate]);

  // Calculate contrast ratio between primary and white (for text)
  const primaryContrast = useMemo(
    () => getContrastRatio(effectivePalette.primary, '#FFFFFF'),
    [effectivePalette.primary]
  );

  const accentContrast = useMemo(
    () => getContrastRatio(effectivePalette.accent, '#FFFFFF'),
    [effectivePalette.accent]
  );

  const hasCustomizations =
    currentPalette?.primary || currentPalette?.secondary || currentPalette?.accent;

  return (
    <div className="p-4 space-y-6">
      {/* Extract from Logo */}
      {logoUrl && (
        <div className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center overflow-hidden">
              <img
                src={logoUrl}
                alt="Logo"
                className="w-8 h-8 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">Extract from Logo</p>
              <p className="text-xs text-text-tertiary">
                Automatically suggest colors from your logo
              </p>
            </div>
          </div>
          <AppButton
            variant="outline"
            size="sm"
            onClick={handleExtractFromLogo}
            disabled={isExtracting}
          >
            {isExtracting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
          </AppButton>
        </div>
      )}

      {/* Color Inputs */}
      <div className="space-y-4">
        {COLOR_FIELDS.map((field) => (
          <ColorInput
            key={field.key}
            label={field.label}
            value={
              currentPalette?.[field.key] ||
              themePalette?.[field.key] ||
              effectivePalette[field.key]
            }
            onChange={(value) => handleColorChange(field.key, value)}
            description={field.description}
            contrastWith="#FFFFFF"
            minContrastRatio={field.key === 'primary' || field.key === 'accent' ? 4.5 : undefined}
          />
        ))}
      </div>

      {/* Color Preview */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-text-secondary">Preview</p>
        <div className="p-4 rounded-lg border border-border bg-white space-y-3">
          {/* Button Preview */}
          <div className="flex items-center gap-2">
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: effectivePalette.primary }}
            >
              Primary Button
            </button>
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: effectivePalette.accent }}
            >
              Accent Button
            </button>
          </div>

          {/* Text Preview */}
          <div>
            <p
              className="text-lg font-semibold"
              style={{ color: effectivePalette.primary }}
            >
              Heading Text
            </p>
            <p
              className="text-sm"
              style={{ color: effectivePalette.secondary }}
            >
              Secondary body text with your chosen colors.
            </p>
          </div>

          {/* Link Preview */}
          <p className="text-sm">
            Regular text with an{' '}
            <span
              className="underline cursor-pointer"
              style={{ color: effectivePalette.accent }}
            >
              accent link
            </span>
            .
          </p>
        </div>
      </div>

      {/* Contrast Warnings */}
      {(primaryContrast < 4.5 || accentContrast < 4.5) && (
        <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">Accessibility Warning</p>
              <p className="text-xs text-text-secondary mt-1">
                {primaryContrast < 4.5 && (
                  <span>
                    Primary color has low contrast ({primaryContrast.toFixed(1)}:1) with white
                    text.{' '}
                  </span>
                )}
                {accentContrast < 4.5 && (
                  <span>
                    Accent color has low contrast ({accentContrast.toFixed(1)}:1) with white text.
                  </span>
                )}
              </p>
              <p className="text-xs text-text-tertiary mt-1">
                WCAG AA requires a minimum 4.5:1 contrast ratio for normal text.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Reset Button */}
      {hasCustomizations && (
        <div className="pt-2 border-t border-border">
          <AppButton
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="w-full text-text-secondary"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset to theme defaults
          </AppButton>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Color Input Component
// =============================================================================

const ColorInput: React.FC<ColorInputProps> = ({
  label,
  value,
  onChange,
  description,
  contrastWith,
  minContrastRatio,
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);

  // Sync input value with prop value when not focused
  React.useEffect(() => {
    if (!isFocused) {
      setInputValue(value);
    }
  }, [value, isFocused]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    // Only update parent if valid hex
    if (isValidHex(newValue)) {
      onChange(newValue);
    }
  };

  const handleColorPickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
  };

  const contrastRatio = contrastWith ? getContrastRatio(value, contrastWith) : null;
  const accessibilityRating =
    contrastRatio && minContrastRatio ? getAccessibilityRating(contrastRatio) : null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-text-primary">{label}</label>
        {accessibilityRating && (
          <span
            className={`text-xs font-medium ${accessibilityRating.color}`}
            title={accessibilityRating.label}
          >
            {accessibilityRating.rating} ({contrastRatio?.toFixed(1)}:1)
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Color Swatch / Picker */}
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={handleColorPickerChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label={`Pick ${label.toLowerCase()} color`}
          />
          <div
            className="w-10 h-10 rounded-lg border border-border shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            style={{ backgroundColor: value }}
          />
        </div>

        {/* Hex Input */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="#000000"
            className={`w-full px-3 py-2 text-sm font-mono bg-surface border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
              isValidHex(inputValue) || inputValue === '' ? 'border-border' : 'border-error'
            }`}
            maxLength={7}
            aria-label={`${label} hex color`}
            aria-invalid={!isValidHex(inputValue) && inputValue !== ''}
          />
        </div>
      </div>

      {description && (
        <p className="text-xs text-text-tertiary">{description}</p>
      )}
    </div>
  );
};

export default ColorPaletteBuilder;
