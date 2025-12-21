/**
 * Font Service
 *
 * Service for managing typography in the Profile Editor.
 * Handles web fonts, custom font uploads, validation, and loading optimization.
 *
 * Requirements: 6.1, 6.3, 6.4, 6.8, 6.9, 6.10, 6.11
 */

import type {
  WebFont,
  FontPairing,
  CustomFont,
  FontFormat,
  TypographyConfig,
} from '@/types/profileEditor';
import {
  WEB_FONTS,
  FONT_PAIRINGS,
  getFontByFamily,
  getFontsByCategory,
  searchFonts,
  getPairingsForHeadingFont,
  getRecommendedPairings,
  buildGoogleFontsUrl,
  getFallbackFonts,
} from '@/constants/fonts';
import apiClient, { type ApiResponse } from '@/services/api';

// =============================================================================
// Types
// =============================================================================

export interface FontValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  format?: FontFormat;
  fileSize?: number;
}

export interface FontLoadingState {
  family: string;
  status: 'loading' | 'loaded' | 'error';
  error?: string;
}

export interface FontPreviewConfig {
  family: string;
  sampleText: string;
  weight: number;
  size: number;
}

type FontLoadListener = (state: FontLoadingState) => void;

// =============================================================================
// Constants
// =============================================================================

const MAX_FONT_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_FONT_FORMATS: FontFormat[] = ['woff2', 'ttf', 'woff'];
const FONT_MIME_TYPES: Record<FontFormat, string[]> = {
  woff2: ['font/woff2', 'application/font-woff2'],
  woff: ['font/woff', 'application/font-woff'],
  ttf: ['font/ttf', 'font/truetype', 'application/x-font-ttf'],
};

const SAMPLE_TEXTS = {
  default: 'The quick brown fox jumps over the lazy dog',
  heading: 'Beautiful Photography',
  body: 'Capturing moments that last a lifetime. Professional photography services for weddings, portraits, and events.',
  numbers: '0123456789',
  mixed: 'AaBbCcDdEeFfGg 123',
};

// =============================================================================
// Font Service Class
// =============================================================================

class FontService {
  private static instance: FontService;

  private loadedFonts: Set<string> = new Set();
  private loadingFonts: Map<string, Promise<void>> = new Map();
  private customFonts: Map<string, CustomFont> = new Map();
  private listeners: Map<string, Set<FontLoadListener>> = new Map();
  private workspaceId: string | null = null;

  private constructor() {
    // Check for already loaded fonts
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => {
        document.fonts.forEach((font) => {
          this.loadedFonts.add(font.family);
        });
      });
    }
  }

  public static getInstance(): FontService {
    if (!FontService.instance) {
      FontService.instance = new FontService();
    }
    return FontService.instance;
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize service with workspace context
   */
  initialize(workspaceId: string): void {
    this.workspaceId = workspaceId;
  }

  // ===========================================================================
  // Web Font Methods
  // ===========================================================================

  /**
   * List all available web fonts
   */
  listWebFonts(): WebFont[] {
    return WEB_FONTS;
  }

  /**
   * Get a specific web font by family name
   */
  getWebFont(family: string): WebFont | undefined {
    return getFontByFamily(family);
  }

  /**
   * Get fonts by category
   */
  getWebFontsByCategory(category: WebFont['category']): WebFont[] {
    return getFontsByCategory(category);
  }

  /**
   * Search fonts by name
   */
  searchWebFonts(query: string): WebFont[] {
    return searchFonts(query);
  }

  /**
   * Get all font pairings
   */
  getFontPairings(): FontPairing[] {
    return FONT_PAIRINGS;
  }

  /**
   * Get pairings for a specific heading font
   */
  getPairingsForHeading(headingFont: string): FontPairing[] {
    return getPairingsForHeadingFont(headingFont);
  }

  /**
   * Get recommended font pairings
   */
  getRecommendedPairings(limit = 5): FontPairing[] {
    return getRecommendedPairings(limit);
  }

  /**
   * Suggest a body font for a given heading font
   */
  suggestBodyFont(headingFont: string): FontPairing | null {
    const pairings = getPairingsForHeadingFont(headingFont);
    if (pairings.length === 0) {
      // Fallback: suggest Inter for sans-serif, Lora for serif
      const headingInfo = getFontByFamily(headingFont);
      if (headingInfo?.category === 'serif') {
        return {
          heading_font: headingFont,
          body_font: 'Lora',
          reason: 'Complementary serif combination',
          compatibility_score: 80,
        };
      }
      return {
        heading_font: headingFont,
        body_font: 'Inter',
        reason: 'Universal body font pairing',
        compatibility_score: 80,
      };
    }
    return pairings.sort((a, b) => b.compatibility_score - a.compatibility_score)[0];
  }

  // ===========================================================================
  // Font Loading Methods
  // ===========================================================================

  /**
   * Load a font from Google Fonts
   */
  async loadFont(family: string, weights: number[] = [400, 500, 600, 700]): Promise<void> {
    // Already loaded
    if (this.loadedFonts.has(family)) {
      return;
    }

    // Already loading
    if (this.loadingFonts.has(family)) {
      return this.loadingFonts.get(family);
    }

    const loadPromise = new Promise<void>((resolve, reject) => {
      this.notifyListeners(family, { family, status: 'loading' });

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = buildGoogleFontsUrl([{ family, weights }]);

      link.onload = () => {
        this.loadedFonts.add(family);
        this.loadingFonts.delete(family);
        this.notifyListeners(family, { family, status: 'loaded' });
        resolve();
      };

      link.onerror = () => {
        this.loadingFonts.delete(family);
        const error = `Failed to load font: ${family}`;
        this.notifyListeners(family, { family, status: 'error', error });
        reject(new Error(error));
      };

      document.head.appendChild(link);
    });

    this.loadingFonts.set(family, loadPromise);
    return loadPromise;
  }

  /**
   * Load multiple fonts
   */
  async loadFonts(fonts: { family: string; weights?: number[] }[]): Promise<void> {
    await Promise.all(fonts.map((f) => this.loadFont(f.family, f.weights)));
  }

  /**
   * Preload fonts for optimal performance
   */
  preloadFont(family: string, weights: number[] = [400, 600]): void {
    const url = buildGoogleFontsUrl([{ family, weights }]);

    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'style';
    link.href = url;
    document.head.appendChild(link);
  }

  /**
   * Check if a font is loaded
   */
  isFontLoaded(family: string): boolean {
    return this.loadedFonts.has(family);
  }

  /**
   * Subscribe to font loading events
   */
  onFontLoad(family: string, listener: FontLoadListener): () => void {
    if (!this.listeners.has(family)) {
      this.listeners.set(family, new Set());
    }
    this.listeners.get(family)!.add(listener);

    // Notify immediately if already loaded
    if (this.loadedFonts.has(family)) {
      listener({ family, status: 'loaded' });
    }

    return () => {
      this.listeners.get(family)?.delete(listener);
    };
  }

  // ===========================================================================
  // Custom Font Upload Methods
  // ===========================================================================

  /**
   * Validate a font file before upload
   */
  validateFontFile(file: File): FontValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let format: FontFormat | undefined;

    // Check file size
    if (file.size > MAX_FONT_FILE_SIZE) {
      errors.push(`File size exceeds maximum of ${MAX_FONT_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Check file type
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'woff2') format = 'woff2';
    else if (extension === 'woff') format = 'woff';
    else if (extension === 'ttf') format = 'ttf';
    else {
      errors.push(`Unsupported font format. Allowed: ${ALLOWED_FONT_FORMATS.join(', ')}`);
    }

    // Check MIME type
    if (format && !FONT_MIME_TYPES[format].includes(file.type) && file.type !== '') {
      warnings.push(`Unexpected MIME type: ${file.type}. Expected: ${FONT_MIME_TYPES[format].join(' or ')}`);
    }

    // Recommend woff2
    if (format && format !== 'woff2') {
      warnings.push('For best performance, use WOFF2 format');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      format,
      fileSize: file.size,
    };
  }

  /**
   * Upload a custom font
   */
  async uploadCustomFont(
    file: File,
    fontFamily: string,
    weight: number = 400,
    style: 'normal' | 'italic' = 'normal'
  ): Promise<ApiResponse<CustomFont>> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    // Validate first
    const validation = this.validateFontFile(file);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    // Create form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('font_family', fontFamily);
    formData.append('weight', weight.toString());
    formData.append('style', style);
    formData.append('format', validation.format || 'woff2');

    // Upload to backend
    const response = await apiClient.upload<CustomFont>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/fonts`,
      formData
    );

    // Store locally
    if (response.data) {
      this.customFonts.set(response.data.custom_font_id, response.data);
    }

    return response;
  }

  /**
   * Delete a custom font
   */
  async deleteCustomFont(customFontId: string): Promise<void> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    await apiClient.delete(
      `/v1/workspaces/${this.workspaceId}/profile-editor/fonts/${customFontId}`
    );

    this.customFonts.delete(customFontId);
  }

  /**
   * List all custom fonts for the workspace
   */
  async listCustomFonts(): Promise<CustomFont[]> {
    if (!this.workspaceId) {
      return [];
    }

    try {
      const response = await apiClient.get<CustomFont[]>(
        `/v1/workspaces/${this.workspaceId}/profile-editor/fonts`
      );

      if (response.data) {
        this.customFonts.clear();
        for (const font of response.data) {
          this.customFonts.set(font.custom_font_id, font);
        }
        return response.data;
      }

      return [];
    } catch (error) {
      console.error('Failed to load custom fonts:', error);
      return [];
    }
  }

  /**
   * Get a custom font by ID
   */
  getCustomFont(customFontId: string): CustomFont | undefined {
    return this.customFonts.get(customFontId);
  }

  // ===========================================================================
  // Typography Configuration Methods
  // ===========================================================================

  /**
   * Create typography configuration
   */
  createTypographyConfig(
    headingFont: string,
    bodyFont: string,
    accentFont?: string
  ): TypographyConfig {
    const headingInfo = getFontByFamily(headingFont);
    const bodyInfo = getFontByFamily(bodyFont);
    const accentInfo = accentFont ? getFontByFamily(accentFont) : undefined;

    return {
      heading_font: {
        family: headingFont,
        source: headingInfo ? 'web' : 'custom',
        fallback: headingInfo ? getFallbackFonts(headingInfo.category) : ['sans-serif'],
        weights: headingInfo?.weights || [400, 500, 600, 700],
      },
      body_font: {
        family: bodyFont,
        source: bodyInfo ? 'web' : 'custom',
        fallback: bodyInfo ? getFallbackFonts(bodyInfo.category) : ['sans-serif'],
        weights: bodyInfo?.weights || [400, 500],
      },
      accent_font: accentInfo
        ? {
            family: accentFont!,
            source: 'web',
            fallback: getFallbackFonts(accentInfo.category),
            weights: accentInfo.weights,
          }
        : undefined,
    };
  }

  /**
   * Generate CSS for typography configuration
   */
  generateTypographyCss(config: TypographyConfig): string {
    const lines: string[] = [':root {'];

    // Heading font
    const headingFallback = config.heading_font.fallback.join(', ');
    lines.push(`  --font-heading: "${config.heading_font.family}", ${headingFallback};`);

    // Body font
    const bodyFallback = config.body_font.fallback.join(', ');
    lines.push(`  --font-body: "${config.body_font.family}", ${bodyFallback};`);

    // Accent font
    if (config.accent_font) {
      const accentFallback = config.accent_font.fallback.join(', ');
      lines.push(`  --font-accent: "${config.accent_font.family}", ${accentFallback};`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Generate @font-face CSS for custom fonts
   */
  generateFontFaceCss(customFont: CustomFont): string {
    const lines: string[] = [];

    for (const file of customFont.font_files) {
      const formatMap: Record<FontFormat, string> = {
        woff2: 'woff2',
        woff: 'woff',
        ttf: 'truetype',
      };

      lines.push(`@font-face {
  font-family: "${customFont.font_family}";
  src: url("${file.object_key}") format("${formatMap[file.format]}");
  font-weight: ${file.weight};
  font-style: ${file.style};
  font-display: swap;
}`);
    }

    return lines.join('\n\n');
  }

  // ===========================================================================
  // Font Preview Methods
  // ===========================================================================

  /**
   * Get sample text for font preview
   */
  getSampleText(type: keyof typeof SAMPLE_TEXTS = 'default'): string {
    return SAMPLE_TEXTS[type] || SAMPLE_TEXTS.default;
  }

  /**
   * Get inline styles for font preview
   */
  getFontPreviewStyles(config: FontPreviewConfig): React.CSSProperties {
    const fontInfo = getFontByFamily(config.family);
    const fallback = fontInfo ? getFallbackFonts(fontInfo.category).join(', ') : 'sans-serif';

    return {
      fontFamily: `"${config.family}", ${fallback}`,
      fontWeight: config.weight,
      fontSize: `${config.size}px`,
    };
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get CSS font-family value with fallbacks
   */
  getFontFamilyValue(family: string): string {
    const fontInfo = getFontByFamily(family);
    const fallback = fontInfo ? getFallbackFonts(fontInfo.category) : ['sans-serif'];
    return `"${family}", ${fallback.join(', ')}`;
  }

  /**
   * Check if a font is a web font (vs custom)
   */
  isWebFont(family: string): boolean {
    return getFontByFamily(family) !== undefined;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private notifyListeners(family: string, state: FontLoadingState): void {
    const listeners = this.listeners.get(family);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(state);
        } catch (error) {
          console.error('Font listener error:', error);
        }
      });
    }
  }

  /**
   * Reset service state (for testing)
   */
  reset(): void {
    this.loadedFonts.clear();
    this.loadingFonts.clear();
    this.customFonts.clear();
    this.listeners.clear();
    this.workspaceId = null;
  }
}

// =============================================================================
// Export Singleton Instance
// =============================================================================

export const fontService = FontService.getInstance();

// Export class for testing
export { FontService };
