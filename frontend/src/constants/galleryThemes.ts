/**
 * Gallery Themes - 9 Curated Themes for Gallery Design Studio
 *
 * Provides professional, production-ready gallery themes with:
 * - Light and dark mode color tokens
 * - Semantic CSS variables (--bg-primary, --text-primary, etc.)
 * - Curated accent swatches for color selection
 * - Sophisticated color palettes inspired by design trends
 *
 * Feature: Gallery Cover & Design System
 */

import { GalleryTheme, ThemeId } from '@/types/gallery-design';

// =============================================================================
// Theme 1: Brand (Deep Blue + Cyan) - RawDrive Default
// =============================================================================

const BRAND_THEME: GalleryTheme = {
  id: 'brand',
  name: 'Brand',
  description: 'RawDrive signature theme with deep blue and cyan accents',
  light: {
    bgPrimary: '#FFFFFF',
    bgSecondary: '#F8FAFB',
    bgTertiary: '#F0F4F7',
    textPrimary: '#1A202C',
    textSecondary: '#4A5568',
    textTertiary: '#718096',
    accentPrimary: '#0066CC',
    accentSecondary: '#00D4FF',
    borderDefault: '#E2E8F0',
    borderHover: '#CBD5E0',
  },
  dark: {
    bgPrimary: '#0F1419',
    bgSecondary: '#1A202C',
    bgTertiary: '#2D3748',
    textPrimary: '#F7FAFC',
    textSecondary: '#E2E8F0',
    textTertiary: '#CBD5E0',
    accentPrimary: '#3B82F6',
    accentSecondary: '#06B6D4',
    borderDefault: '#2D3748',
    borderHover: '#4A5568',
  },
  accentSwatches: [
    { name: 'Ocean', hex: '#0066CC', hover: '#0052A3', active: '#003D7A' },
    { name: 'Cyan', hex: '#00D4FF', hover: '#00ACCC', active: '#008799' },
    { name: 'Sky', hex: '#3B82F6', hover: '#2563EB', active: '#1D4ED8' },
    { name: 'Indigo', hex: '#4F46E5', hover: '#4338CA', active: '#3730A3' },
    { name: 'Navy', hex: '#1E3A8A', hover: '#1E40AF', active: '#1E3A8A' },
  ],
};

// =============================================================================
// Theme 2: Gold - Premium & Luxurious
// =============================================================================

const GOLD_THEME: GalleryTheme = {
  id: 'gold',
  name: 'Gold',
  description: 'Premium gold and champagne palette for luxury galleries',
  light: {
    bgPrimary: '#FFFBF5',
    bgSecondary: '#FFF8F0',
    bgTertiary: '#FFF5E6',
    textPrimary: '#2C1810',
    textSecondary: '#6B4423',
    textTertiary: '#9B7653',
    accentPrimary: '#D97706',
    accentSecondary: '#F59E0B',
    borderDefault: '#FED7AA',
    borderHover: '#FDBA74',
  },
  dark: {
    bgPrimary: '#1F1209',
    bgSecondary: '#332107',
    bgTertiary: '#4A2D0B',
    textPrimary: '#FEF3C7',
    textSecondary: '#FCD34D',
    textTertiary: '#F59E0B',
    accentPrimary: '#F59E0B',
    accentSecondary: '#FBBF24',
    borderDefault: '#92400E',
    borderHover: '#B45309',
  },
  accentSwatches: [
    { name: 'Gold', hex: '#F59E0B', hover: '#D97706', active: '#B45309' },
    { name: 'Amber', hex: '#FBBF24', hover: '#F59E0B', active: '#D97706' },
    { name: 'Champagne', hex: '#FCD34D', hover: '#FBBF24', active: '#F59E0B' },
    { name: 'Bronze', hex: '#D97706', hover: '#B45309', active: '#92400E' },
    { name: 'Copper', hex: '#EA580C', hover: '#C2410C', active: '#9A3412' },
  ],
};

// =============================================================================
// Theme 3: Neutral - Clean & Minimal
// =============================================================================

const NEUTRAL_THEME: GalleryTheme = {
  id: 'neutral',
  name: 'Neutral',
  description: 'Timeless grayscale palette for minimalist galleries',
  light: {
    bgPrimary: '#FFFFFF',
    bgSecondary: '#F9FAFB',
    bgTertiary: '#F3F4F6',
    textPrimary: '#111827',
    textSecondary: '#4B5563',
    textTertiary: '#9CA3AF',
    accentPrimary: '#374151',
    accentSecondary: '#6B7280',
    borderDefault: '#E5E7EB',
    borderHover: '#D1D5DB',
  },
  dark: {
    bgPrimary: '#111827',
    bgSecondary: '#1F2937',
    bgTertiary: '#374151',
    textPrimary: '#F9FAFB',
    textSecondary: '#E5E7EB',
    textTertiary: '#D1D5DB',
    accentPrimary: '#E5E7EB',
    accentSecondary: '#9CA3AF',
    borderDefault: '#4B5563',
    borderHover: '#6B7280',
  },
  accentSwatches: [
    { name: 'Charcoal', hex: '#1F2937', hover: '#111827', active: '#0F172A' },
    { name: 'Stone', hex: '#6B7280', hover: '#4B5563', active: '#374151' },
    { name: 'Slate', hex: '#9CA3AF', hover: '#6B7280', active: '#4B5563' },
    { name: 'Iron', hex: '#4B5563', hover: '#374151', active: '#1F2937' },
    { name: 'Graphite', hex: '#111827', hover: '#0F172A', active: '#030712' },
  ],
};

// =============================================================================
// Theme 4: Cyan - Modern & Tech-Forward
// =============================================================================

const CYAN_THEME: GalleryTheme = {
  id: 'cyan',
  name: 'Cyan',
  description: 'Vibrant cyan and teal palette for modern galleries',
  light: {
    bgPrimary: '#ECFDF5',
    bgSecondary: '#E0F2FE',
    bgTertiary: '#D0F0FE',
    textPrimary: '#0C4A6E',
    textSecondary: '#0E7490',
    textTertiary: '#155E75',
    accentPrimary: '#06B6D4',
    accentSecondary: '#14B8A6',
    borderDefault: '#67E8F9',
    borderHover: '#22D3EE',
  },
  dark: {
    bgPrimary: '#082F49',
    bgSecondary: '#0C2D44',
    bgTertiary: '#164E63',
    textPrimary: '#CFFAFE',
    textSecondary: '#67E8F9',
    textTertiary: '#22D3EE',
    accentPrimary: '#06B6D4',
    accentSecondary: '#14B8A6',
    borderDefault: '#164E63',
    borderHover: '#0E7490',
  },
  accentSwatches: [
    { name: 'Cyan', hex: '#06B6D4', hover: '#0891B2', active: '#0E7490' },
    { name: 'Teal', hex: '#14B8A6', hover: '#0D9488', active: '#0F766E' },
    { name: 'Turquoise', hex: '#1ABDE1', hover: '#0BA5C9', active: '#0682B1' },
    { name: 'Sky', hex: '#0EA5E9', hover: '#0284C7', active: '#0369A1' },
    { name: 'Aqua', hex: '#00D9FF', hover: '#00B8D4', active: '#0097AD' },
  ],
};

// =============================================================================
// Theme 5: Midnight - Dark & Sophisticated
// =============================================================================

const MIDNIGHT_THEME: GalleryTheme = {
  id: 'midnight',
  name: 'Midnight',
  description: 'Deep dark theme with purple accents for evening viewing',
  light: {
    bgPrimary: '#F3F4F6',
    bgSecondary: '#E5E7EB',
    bgTertiary: '#D1D5DB',
    textPrimary: '#1F2937',
    textSecondary: '#374151',
    textTertiary: '#6B7280',
    accentPrimary: '#7C3AED',
    accentSecondary: '#8B5CF6',
    borderDefault: '#C7D2E0',
    borderHover: '#A6ACBE',
  },
  dark: {
    bgPrimary: '#0F0E16',
    bgSecondary: '#1A1925',
    bgTertiary: '#2A2838',
    textPrimary: '#F5F3FF',
    textSecondary: '#E9D5FF',
    textTertiary: '#D8B4FE',
    accentPrimary: '#A78BFA',
    accentSecondary: '#C084FC',
    borderDefault: '#3A3647',
    borderHover: '#4A4659',
  },
  accentSwatches: [
    { name: 'Purple', hex: '#7C3AED', hover: '#6D28D9', active: '#5B21B6' },
    { name: 'Violet', hex: '#8B5CF6', hover: '#7C3AED', active: '#6D28D9' },
    { name: 'Indigo', hex: '#4F46E5', hover: '#4338CA', active: '#3730A3' },
    { name: 'Lavender', hex: '#A78BFA', hover: '#8B5CF6', active: '#7C3AED' },
    { name: 'Plum', hex: '#C084FC', hover: '#A78BFA', active: '#8B5CF6' },
  ],
};

// =============================================================================
// Theme 6: Rose - Romantic & Warm
// =============================================================================

const ROSE_THEME: GalleryTheme = {
  id: 'rose',
  name: 'Rose',
  description: 'Soft rose and pink palette for romantic galleries',
  light: {
    bgPrimary: '#FFF7ED',
    bgSecondary: '#FFE4E6',
    bgTertiary: '#FBCFE8',
    textPrimary: '#831843',
    textSecondary: '#BE185D',
    textTertiary: '#DB2777',
    accentPrimary: '#EC4899',
    accentSecondary: '#F43F5E',
    borderDefault: '#F8BBD0',
    borderHover: '#F48FB1',
  },
  dark: {
    bgPrimary: '#500724',
    bgSecondary: '#6B1635',
    bgTertiary: '#831843',
    textPrimary: '#FCE7F3',
    textSecondary: '#F9A8D4',
    textTertiary: '#F472B6',
    accentPrimary: '#EC4899',
    accentSecondary: '#F43F5E',
    borderDefault: '#BE185D',
    borderHover: '#DB2777',
  },
  accentSwatches: [
    { name: 'Rose', hex: '#EC4899', hover: '#DB2777', active: '#BE185D' },
    { name: 'Pink', hex: '#F472B6', hover: '#F43F5E', active: '#E11D48' },
    { name: 'Coral', hex: '#FF6B6B', hover: '#FF5252', active: '#FF1744' },
    { name: 'Blush', hex: '#F9A8D4', hover: '#F472B6', active: '#EC4899' },
    { name: 'Magenta', hex: '#D946EF', hover: '#C026D3', active: '#A21CAF' },
  ],
};

// =============================================================================
// Theme 7: Terracotta - Earthy & Warm
// =============================================================================

const TERRACOTTA_THEME: GalleryTheme = {
  id: 'terracotta',
  name: 'Terracotta',
  description: 'Warm earthy palette inspired by natural clay and stone',
  light: {
    bgPrimary: '#FEF2F2',
    bgSecondary: '#FDE8E8',
    bgTertiary: '#FDDAD7',
    textPrimary: '#7C2D12',
    textSecondary: '#9A3412',
    textTertiary: '#B45309',
    accentPrimary: '#EA580C',
    accentSecondary: '#F97316',
    borderDefault: '#FDBA74',
    borderHover: '#FB923C',
  },
  dark: {
    bgPrimary: '#431407',
    bgSecondary: '#5A2D0C',
    bgTertiary: '#7C2D12',
    textPrimary: '#FED7AA',
    textSecondary: '#FDBA74',
    textTertiary: '#FB923C',
    accentPrimary: '#F97316',
    accentSecondary: '#FF8C42',
    borderDefault: '#92400E',
    borderHover: '#B45309',
  },
  accentSwatches: [
    { name: 'Terracotta', hex: '#EA580C', hover: '#C2410C', active: '#9A3412' },
    { name: 'Orange', hex: '#F97316', hover: '#EA580C', active: '#C2410C' },
    { name: 'Rust', hex: '#B45309', hover: '#92400E', active: '#7C2D12' },
    { name: 'Burnt', hex: '#7C2D12', hover: '#5A2D0C', active: '#431407' },
    { name: 'Clay', hex: '#C2410C', hover: '#9A3412', active: '#7C2D12' },
  ],
};

// =============================================================================
// Theme 8: Olive - Natural & Sophisticated
// =============================================================================

const OLIVE_THEME: GalleryTheme = {
  id: 'olive',
  name: 'Olive',
  description: 'Nature-inspired green and olive palette for organic feel',
  light: {
    bgPrimary: '#F7FEE7',
    bgSecondary: '#F0FDF4',
    bgTertiary: '#DBEAFE',
    textPrimary: '#365314',
    textSecondary: '#4B5320',
    textTertiary: '#6B7327',
    accentPrimary: '#84CC16',
    accentSecondary: '#22C55E',
    borderDefault: '#BBEF63',
    borderHover: '#A3E635',
  },
  dark: {
    bgPrimary: '#1B2E1C',
    bgSecondary: '#263C27',
    bgTertiary: '#34472A',
    textPrimary: '#F4F9F2',
    textSecondary: '#DCFCE7',
    textTertiary: '#BBF7D0',
    accentPrimary: '#84CC16',
    accentSecondary: '#4ADE80',
    borderDefault: '#365314',
    borderHover: '#4B5320',
  },
  accentSwatches: [
    { name: 'Lime', hex: '#84CC16', hover: '#65A30D', active: '#4B5320' },
    { name: 'Green', hex: '#22C55E', hover: '#16A34A', active: '#15803D' },
    { name: 'Emerald', hex: '#10B981', hover: '#059669', active: '#047857' },
    { name: 'Forest', hex: '#365314', hover: '#1B2E1C', active: '#0F172A' },
    { name: 'Sage', hex: '#78716C', hover: '#57534E', active: '#423F37' },
  ],
};

// =============================================================================
// Theme 9: Sea - Serene & Calming
// =============================================================================

const SEA_THEME: GalleryTheme = {
  id: 'sea',
  name: 'Sea',
  description: 'Serene ocean-inspired palette with teal and seafoam tones',
  light: {
    bgPrimary: '#F0FDFA',
    bgSecondary: '#CCFBF1',
    bgTertiary: '#99F6E4',
    textPrimary: '#0D3B37',
    textSecondary: '#134E4A',
    textTertiary: '#0F766E',
    accentPrimary: '#14B8A6',
    accentSecondary: '#06B6D4',
    borderDefault: '#5EEAD4',
    borderHover: '#2DD4BF',
  },
  dark: {
    bgPrimary: '#0D3B37',
    bgSecondary: '#134E4A',
    bgTertiary: '#0F766E',
    textPrimary: '#CCFBF1',
    textSecondary: '#99F6E4',
    textTertiary: '#5EEAD4',
    accentPrimary: '#14B8A6',
    accentSecondary: '#06B6D4',
    borderDefault: '#0F766E',
    borderHover: '#134E4A',
  },
  accentSwatches: [
    { name: 'Teal', hex: '#14B8A6', hover: '#0D9488', active: '#0F766E' },
    { name: 'Seafoam', hex: '#2DD4BF', hover: '#14B8A6', active: '#0D9488' },
    { name: 'Turquoise', hex: '#20C997', hover: '#12B886', active: '#0FA678' },
    { name: 'Cyan', hex: '#06B6D4', hover: '#0891B2', active: '#0E7490' },
    { name: 'Aquamarine', hex: '#0EA5E9', hover: '#0284C7', active: '#0369A1' },
  ],
};

// =============================================================================
// Theme Registry
// =============================================================================

export const GALLERY_THEMES: Record<ThemeId, GalleryTheme> = {
  brand: BRAND_THEME,
  gold: GOLD_THEME,
  neutral: NEUTRAL_THEME,
  cyan: CYAN_THEME,
  midnight: MIDNIGHT_THEME,
  rose: ROSE_THEME,
  terracotta: TERRACOTTA_THEME,
  olive: OLIVE_THEME,
  sea: SEA_THEME,
};

/**
 * Get theme by ID
 */
export const getTheme = (themeId: ThemeId): GalleryTheme => {
  return GALLERY_THEMES[themeId] || GALLERY_THEMES.brand;
};

/**
 * Get all theme IDs
 */
export const getAllThemeIds = (): ThemeId[] => {
  return Object.keys(GALLERY_THEMES) as ThemeId[];
};

/**
 * Get all themes
 */
export const getAllThemes = (): GalleryTheme[] => {
  return Object.values(GALLERY_THEMES);
};
