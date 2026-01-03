/**
 * WCAG AA Contrast Validation for RSVP Dashboard UI Tokens
 *
 * Task: T055 - Validate WCAG AA contrast for RSVP UI tokens
 * Feature: 020-invitation-rsvp-hardening
 *
 * WCAG 2.1 AA Requirements:
 * - Normal text (< 18pt): 4.5:1 minimum contrast ratio
 * - Large text (>= 18pt or >= 14pt bold): 3:1 minimum
 * - UI components and graphical objects: 3:1 minimum
 *
 * Reference: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Color Utility Functions
// ---------------------------------------------------------------------------

/**
 * Convert hex color to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
  return {
    r: parseInt(cleanHex.substring(0, 2), 16),
    g: parseInt(cleanHex.substring(2, 4), 16),
    b: parseInt(cleanHex.substring(4, 6), 16),
  };
}

/**
 * Calculate relative luminance according to WCAG 2.1
 * https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);

  const toLinear = (c: number): number => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };

  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);

  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Calculate contrast ratio between two colors
 * Returns value between 1:1 and 21:1
 */
function getContrastRatio(color1: string, color2: string): number {
  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Design System Color Tokens
// ---------------------------------------------------------------------------

/**
 * Light theme color tokens from index.css
 */
const LIGHT_THEME = {
  // Text colors
  textPrimary: '#0F172A',     // neutral-900
  textSecondary: '#475569',   // neutral-600
  textTertiary: '#64748B',    // neutral-500
  textDisabled: '#94A3B8',    // neutral-400

  // Backgrounds
  background: '#F8FAFC',      // neutral-50
  surface: '#FFFFFF',
  surfaceHover: '#F1F5F9',    // neutral-100

  // Semantic colors
  primary: '#2563EB',         // primary-600
  success: '#16A34A',         // success-600
  warning: '#D97706',         // warning-600
  error: '#DC2626',           // error-600
  info: '#2563EB',            // info-600

  // Badge backgrounds (100 level for lighter tints)
  successBg: '#DCFCE7',       // success-100
  warningBg: '#FEF3C7',       // warning-100
  errorBg: '#FEE2E2',         // error-100
  infoBg: '#DBEAFE',          // info-100

  // Badge text (700 level for higher contrast)
  success700: '#15803D',
  warning700: '#B45309',
  error700: '#B91C1C',
  info700: '#1D4ED8',
};

/**
 * Dark theme color tokens from index.css
 */
const DARK_THEME = {
  // Text colors
  textPrimary: '#F8FAFC',     // neutral-50
  textSecondary: '#CBD5E1',   // neutral-300
  textTertiary: '#94A3B8',    // neutral-400
  textDisabled: '#64748B',    // neutral-500

  // Backgrounds
  background: '#020617',      // neutral-950
  surface: '#0F172A',         // neutral-900
  surfaceHover: '#1E293B',    // neutral-800

  // Semantic colors (adjusted for dark mode)
  primary: '#3B82F6',         // primary-500
  success: '#22C55E',         // success-500
  warning: '#F59E0B',         // warning-500
  error: '#EF4444',           // error-500
  info: '#3B82F6',            // info-500
};

// ---------------------------------------------------------------------------
// WCAG Contrast Thresholds
// ---------------------------------------------------------------------------

const WCAG_AA_NORMAL_TEXT = 4.5;      // Regular text < 18pt
const WCAG_AA_LARGE_TEXT = 3.0;       // Large text >= 18pt or bold >= 14pt
const WCAG_AA_UI_COMPONENTS = 3.0;    // Buttons, icons, graphical objects

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('WCAG AA Contrast Validation - RSVP Dashboard', () => {

  describe('Light Theme - Text Contrast', () => {

    it('text-primary on surface meets 4.5:1', () => {
      const ratio = getContrastRatio(LIGHT_THEME.textPrimary, LIGHT_THEME.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      // Expected: ~15.5:1
    });

    it('text-secondary on surface meets 4.5:1', () => {
      const ratio = getContrastRatio(LIGHT_THEME.textSecondary, LIGHT_THEME.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      // Expected: ~7.0:1
    });

    it('text-tertiary on surface meets 4.5:1', () => {
      const ratio = getContrastRatio(LIGHT_THEME.textTertiary, LIGHT_THEME.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      // Expected: ~4.6:1
    });

    it('text-primary on surface-hover meets 4.5:1', () => {
      const ratio = getContrastRatio(LIGHT_THEME.textPrimary, LIGHT_THEME.surfaceHover);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });

  });

  describe('Light Theme - Badge Contrast', () => {

    it('success badge text on success background meets 4.5:1', () => {
      const ratio = getContrastRatio(LIGHT_THEME.success700, LIGHT_THEME.successBg);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      // Expected: ~4.7:1
    });

    it('error badge text on error background meets 4.5:1', () => {
      const ratio = getContrastRatio(LIGHT_THEME.error700, LIGHT_THEME.errorBg);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      // Expected: ~4.9:1
    });

    it('warning badge text on warning background meets 4.5:1', () => {
      const ratio = getContrastRatio(LIGHT_THEME.warning700, LIGHT_THEME.warningBg);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      // Expected: ~4.5:1
    });

    it('info badge text on info background meets 4.5:1', () => {
      const ratio = getContrastRatio(LIGHT_THEME.info700, LIGHT_THEME.infoBg);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      // Expected: ~5.8:1
    });

  });

  describe('Light Theme - UI Component Contrast (Icons)', () => {

    it('primary icon on surface meets 3:1', () => {
      const ratio = getContrastRatio(LIGHT_THEME.primary, LIGHT_THEME.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_UI_COMPONENTS);
      // Expected: ~5.4:1
    });

    it('success icon on surface meets 3:1', () => {
      const ratio = getContrastRatio(LIGHT_THEME.success, LIGHT_THEME.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_UI_COMPONENTS);
      // Expected: ~4.5:1
    });

    it('error icon on surface meets 3:1', () => {
      const ratio = getContrastRatio(LIGHT_THEME.error, LIGHT_THEME.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_UI_COMPONENTS);
      // Expected: ~4.6:1
    });

    it('warning icon on surface meets 3:1', () => {
      const ratio = getContrastRatio(LIGHT_THEME.warning, LIGHT_THEME.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_UI_COMPONENTS);
      // Expected: ~3.7:1
    });

    it('info icon on surface meets 3:1', () => {
      const ratio = getContrastRatio(LIGHT_THEME.info, LIGHT_THEME.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_UI_COMPONENTS);
      // Expected: ~5.4:1
    });

  });

  describe('Dark Theme - Text Contrast', () => {

    it('text-primary on surface meets 4.5:1', () => {
      const ratio = getContrastRatio(DARK_THEME.textPrimary, DARK_THEME.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      // Expected: ~15.5:1
    });

    it('text-secondary on surface meets 4.5:1', () => {
      const ratio = getContrastRatio(DARK_THEME.textSecondary, DARK_THEME.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      // Expected: ~9.8:1
    });

    it('text-tertiary on surface meets 4.5:1', () => {
      const ratio = getContrastRatio(DARK_THEME.textTertiary, DARK_THEME.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      // Expected: ~6.1:1
    });

    it('text-primary on surface-hover meets 4.5:1', () => {
      const ratio = getContrastRatio(DARK_THEME.textPrimary, DARK_THEME.surfaceHover);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });

  });

  describe('Dark Theme - UI Component Contrast (Icons)', () => {

    it('primary icon on surface meets 3:1', () => {
      const ratio = getContrastRatio(DARK_THEME.primary, DARK_THEME.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_UI_COMPONENTS);
    });

    it('success icon on surface meets 3:1', () => {
      const ratio = getContrastRatio(DARK_THEME.success, DARK_THEME.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_UI_COMPONENTS);
    });

    it('error icon on surface meets 3:1', () => {
      const ratio = getContrastRatio(DARK_THEME.error, DARK_THEME.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_UI_COMPONENTS);
    });

    it('warning icon on surface meets 3:1', () => {
      const ratio = getContrastRatio(DARK_THEME.warning, DARK_THEME.surface);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_UI_COMPONENTS);
    });

  });

});

describe('Contrast Ratio Calculation Utility', () => {

  it('calculates correct ratio for black on white (21:1)', () => {
    const ratio = getContrastRatio('#000000', '#FFFFFF');
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('calculates correct ratio for white on white (1:1)', () => {
    const ratio = getContrastRatio('#FFFFFF', '#FFFFFF');
    expect(ratio).toBeCloseTo(1, 0);
  });

  it('calculates same ratio regardless of color order', () => {
    const ratio1 = getContrastRatio('#000000', '#FFFFFF');
    const ratio2 = getContrastRatio('#FFFFFF', '#000000');
    expect(ratio1).toEqual(ratio2);
  });

});
