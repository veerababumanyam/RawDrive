/**
 * Gallery Design Studio Type Definitions
 *
 * Comprehensive type definitions for the Gallery Design Studio feature,
 * including cover styles, typography, themes, and grid layouts.
 *
 * These types align with the backend Pydantic schemas in:
 * - services/gallery-service/src/schemas/gallery_design.py
 *
 * Feature: Gallery Cover & Design System
 */

// =============================================================================
// Cover Styles (25+ styles)
// =============================================================================

export type CoverStyleId =
  // Basic Layouts (3)
  | 'center'
  | 'left'
  | 'none'
  // Text Placement Variations (8)
  | 'vintage'
  | 'novel'
  | 'frame'
  | 'stripe'
  | 'divider'
  | 'journal'
  | 'stamp'
  | 'outline'
  // Advanced Styles (5)
  | 'classic'
  | 'split'
  | 'label'
  | 'border'
  | 'album'
  // Premium Styles (12)
  | 'cliff'
  | 'cedar'
  | 'breeze'
  | 'aero'
  | 'surf'
  | 'cosmos'
  | 'reef'
  | 'bondi'
  | 'west'
  | 'oakwood'
  | 'edge'
  | 'anchor'
  | 'joy';

export interface CoverStyle {
  id: CoverStyleId;
  name: string;
  description: string;
  category: 'basic' | 'text' | 'advanced' | 'premium';
  thumbnail: string;
  premium: boolean;
}

// =============================================================================
// Typography & Font Pairings (6 total)
// =============================================================================

export type FontPairingId = 'sans' | 'serif' | 'modern' | 'timeless' | 'bold' | 'subtle';

export interface FontPairing {
  id: FontPairingId;
  name: string;
  description: string;
  heading: {
    family: string;
    weights: number[];
    source: 'system' | 'google';
    googleFontUrl?: string;
    fallback: string[];
  };
  body: {
    family: string;
    weights: number[];
    source: 'system' | 'google';
    googleFontUrl?: string;
    fallback: string[];
  };
  typography: {
    headingTracking: string;
    bodyTracking: string;
    headingLineHeight: number;
    bodyLineHeight: number;
  };
}

// =============================================================================
// Gallery Themes (9 themes with light/dark modes)
// =============================================================================

export type ThemeId =
  | 'brand'      // Deep Blue + Cyan (RawDrive default)
  | 'gold'       // Premium Gold
  | 'neutral'    // Greyscale
  | 'cyan'       // Cyan / Turquoise
  | 'midnight'   // Dark Blue / Navy
  | 'rose'       // Pink / Rose
  | 'terracotta' // Earth / Orange
  | 'olive'      // Green / Olive
  | 'sea';       // Teal / Sea Green

export type ThemeMode = 'light' | 'dark' | 'system';

export interface GalleryThemeTokens {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  accentPrimary: string;
  accentSecondary: string;
  borderDefault: string;
  borderHover: string;
}

export interface GalleryThemeAccentSwatch {
  name: string;
  hex: string;
  hover: string;
  active: string;
}

export interface GalleryTheme {
  id: ThemeId;
  name: string;
  description: string;
  light: GalleryThemeTokens;
  dark: GalleryThemeTokens;
  accentSwatches: GalleryThemeAccentSwatch[];
  preview?: {
    gradient?: string;
    thumbnail: string;
  };
}

// =============================================================================
// Grid Layout Options
// =============================================================================

export type GridStyle = 'vertical' | 'horizontal';
export type GridSize = 'sm' | 'md' | 'lg';
export type GridSpacing = 'sm' | 'md' | 'lg';
export type NavigationStyle = 'icon-only' | 'icon-text';

// =============================================================================
// Focal Point for Cover Images
// =============================================================================

export interface FocalPoint {
  x: number;
  y: number;
}

// =============================================================================
// Cover Configuration
// =============================================================================

export interface CoverConfig {
  style: CoverStyleId;
  focalPoint: FocalPoint;
  titleVisible: boolean;
  overlayOpacity: number;
  assetId?: string; // If selected from gallery
  imageUrl?: string; // Cached preview URL
}

// =============================================================================
// Typography Configuration
// =============================================================================

export interface TypographyConfig {
  pairingId: FontPairingId;
  customHeadingsFont?: string;
}

// =============================================================================
// Theme Configuration
// =============================================================================

export interface ThemeConfig {
  id: ThemeId;
  mode: ThemeMode;
  accentColorOverride?: string;
}

// =============================================================================
// Grid Configuration
// =============================================================================

export interface GridConfig {
  style: GridStyle;
  size: GridSize;
  spacing: GridSpacing;
  navigationStyle: NavigationStyle;
}

// =============================================================================
// Complete Gallery Design Configuration
// =============================================================================

export interface GalleryDesignConfig {
  cover: CoverConfig;
  typography: TypographyConfig;
  theme: ThemeConfig;
  grid: GridConfig;
}

export interface GalleryDesignResponse {
  gallery_id: string;
  design_config: GalleryDesignConfig;
  last_published_at?: string;
}

export interface GalleryDesignUpdateRequest {
  design_config: GalleryDesignConfig;
}

// =============================================================================
// Design Studio State (for frontend draft management)
// =============================================================================

export type DesignDraftStatus = 'idle' | 'saving' | 'saved' | 'error';
export type PublishStatus = 'idle' | 'publishing' | 'published' | 'error';

export interface DesignDraftState {
  config: GalleryDesignConfig;
  isDirty: boolean;
  saveStatus: DesignDraftStatus;
  publishStatus: PublishStatus;
  lastSavedAt: Date | null;
  error?: string;
}

export interface DesignHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  historySize: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_GALLERY_DESIGN_CONFIG: GalleryDesignConfig = {
  cover: {
    style: 'classic',
    focalPoint: { x: 50, y: 50 },
    titleVisible: true,
    overlayOpacity: 0.3,
  },
  typography: {
    pairingId: 'modern',
    customHeadingsFont: undefined,
  },
  theme: {
    id: 'brand',
    mode: 'system',
    accentColorOverride: undefined,
  },
  grid: {
    style: 'vertical',
    size: 'md',
    spacing: 'md',
    navigationStyle: 'icon-text',
  },
};

// =============================================================================
// Type Guards
// =============================================================================

export const isCoverStyleId = (value: unknown): value is CoverStyleId => {
  const validStyles: CoverStyleId[] = [
    'center', 'left', 'none',
    'vintage', 'novel', 'frame', 'stripe', 'divider', 'journal', 'stamp', 'outline',
    'classic', 'split', 'label', 'border', 'album',
    'cliff', 'cedar', 'breeze', 'aero', 'surf', 'cosmos', 'reef', 'bondi', 'west', 'oakwood', 'edge', 'anchor', 'joy',
  ];
  return typeof value === 'string' && validStyles.includes(value as CoverStyleId);
};

export const isFontPairingId = (value: unknown): value is FontPairingId => {
  const validPairings: FontPairingId[] = ['sans', 'serif', 'modern', 'timeless', 'bold', 'subtle'];
  return typeof value === 'string' && validPairings.includes(value as FontPairingId);
};

export const isThemeId = (value: unknown): value is ThemeId => {
  const validThemes: ThemeId[] = ['brand', 'gold', 'neutral', 'cyan', 'midnight', 'rose', 'terracotta', 'olive', 'sea'];
  return typeof value === 'string' && validThemes.includes(value as ThemeId);
};

export const isThemeMode = (value: unknown): value is ThemeMode => {
  const validModes: ThemeMode[] = ['light', 'dark', 'system'];
  return typeof value === 'string' && validModes.includes(value as ThemeMode);
};

export const isGridStyle = (value: unknown): value is GridStyle => {
  const validStyles: GridStyle[] = ['vertical', 'horizontal'];
  return typeof value === 'string' && validStyles.includes(value as GridStyle);
};

export const isGridSize = (value: unknown): value is GridSize => {
  const validSizes: GridSize[] = ['sm', 'md', 'lg'];
  return typeof value === 'string' && validSizes.includes(value as GridSize);
};

export const isGridSpacing = (value: unknown): value is GridSpacing => {
  const validSpacings: GridSpacing[] = ['sm', 'md', 'lg'];
  return typeof value === 'string' && validSpacings.includes(value as GridSpacing);
};

export const isNavigationStyle = (value: unknown): value is NavigationStyle => {
  const validStyles: NavigationStyle[] = ['icon-only', 'icon-text'];
  return typeof value === 'string' && validStyles.includes(value as NavigationStyle);
};

export const isValidFocalPoint = (value: unknown): value is FocalPoint => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    'y' in value &&
    typeof (value as any).x === 'number' &&
    typeof (value as any).y === 'number' &&
    (value as any).x >= 0 &&
    (value as any).x <= 100 &&
    (value as any).y >= 0 &&
    (value as any).y <= 100
  );
};

export const isValidGalleryDesignConfig = (value: unknown): value is GalleryDesignConfig => {
  if (typeof value !== 'object' || value === null) return false;

  const config = value as any;

  return (
    config.cover &&
    typeof config.cover === 'object' &&
    isCoverStyleId(config.cover.style) &&
    isValidFocalPoint(config.cover.focalPoint) &&
    typeof config.cover.titleVisible === 'boolean' &&
    typeof config.cover.overlayOpacity === 'number' &&
    config.cover.overlayOpacity >= 0 &&
    config.cover.overlayOpacity <= 1 &&
    config.typography &&
    typeof config.typography === 'object' &&
    isFontPairingId(config.typography.pairingId) &&
    config.theme &&
    typeof config.theme === 'object' &&
    isThemeId(config.theme.id) &&
    isThemeMode(config.theme.mode) &&
    config.grid &&
    typeof config.grid === 'object' &&
    isGridStyle(config.grid.style) &&
    isGridSize(config.grid.size) &&
    isGridSpacing(config.grid.spacing) &&
    isNavigationStyle(config.grid.navigationStyle)
  );
};
