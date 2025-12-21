/**
 * useFontLoader Hook
 *
 * React hook for optimized font loading with preloading,
 * performance monitoring, and fallback handling.
 *
 * Requirements: 6.8, 6.9, 6.10, 11.9
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fontService, type FontLoadingState } from '@/services/fontService';
import type { TypographyConfig } from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

export interface UseFontLoaderOptions {
  /** Typography configuration with fonts to load */
  typography?: TypographyConfig;
  /** Whether to preload fonts */
  preload?: boolean;
  /** Font weights to preload (subset for performance) */
  preloadWeights?: number[];
  /** Callback when fonts are loaded */
  onFontsLoaded?: () => void;
  /** Callback when a font fails to load */
  onFontError?: (family: string, error: string) => void;
  /** Performance monitoring */
  enablePerformanceTracking?: boolean;
}

export interface FontLoadStatus {
  family: string;
  status: 'pending' | 'loading' | 'loaded' | 'error';
  loadTime?: number;
  error?: string;
}

export interface UseFontLoaderReturn {
  /** Loading states for all fonts */
  fontStatuses: FontLoadStatus[];
  /** Whether all fonts are loaded */
  allFontsLoaded: boolean;
  /** Whether any fonts are currently loading */
  isLoading: boolean;
  /** Whether any fonts failed to load */
  hasErrors: boolean;
  /** Performance metrics */
  metrics: FontLoadMetrics;
  /** Manually load a font */
  loadFont: (family: string, weights?: number[]) => Promise<void>;
  /** Preload a font (non-blocking) */
  preloadFont: (family: string, weights?: number[]) => void;
  /** Retry failed font loads */
  retryFailed: () => Promise<void>;
}

export interface FontLoadMetrics {
  /** Total time to load all fonts (ms) */
  totalLoadTime: number;
  /** Individual font load times */
  fontLoadTimes: Record<string, number>;
  /** Number of fonts loaded */
  fontsLoaded: number;
  /** Number of fonts failed */
  fontsFailed: number;
  /** Whether metrics are complete */
  isComplete: boolean;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useFontLoader(options: UseFontLoaderOptions = {}): UseFontLoaderReturn {
  const {
    typography,
    preload = true,
    preloadWeights = [400, 600],
    onFontsLoaded,
    onFontError,
    enablePerformanceTracking = true,
  } = options;

  const [fontStatuses, setFontStatuses] = useState<FontLoadStatus[]>([]);
  const [metrics, setMetrics] = useState<FontLoadMetrics>({
    totalLoadTime: 0,
    fontLoadTimes: {},
    fontsLoaded: 0,
    fontsFailed: 0,
    isComplete: false,
  });

  const loadStartTimes = useRef<Record<string, number>>({});
  const overallStartTime = useRef<number | null>(null);
  const hasCalledOnLoaded = useRef(false);

  // Extract fonts from typography config
  const getFontsToLoad = useCallback((): { family: string; weights: number[] }[] => {
    if (!typography) return [];

    const fonts: { family: string; weights: number[] }[] = [];

    if (typography.heading_font) {
      fonts.push({
        family: typography.heading_font.family,
        weights: typography.heading_font.weights || preloadWeights,
      });
    }

    if (typography.body_font) {
      fonts.push({
        family: typography.body_font.family,
        weights: typography.body_font.weights || preloadWeights,
      });
    }

    if (typography.accent_font) {
      fonts.push({
        family: typography.accent_font.family,
        weights: typography.accent_font.weights || preloadWeights,
      });
    }

    return fonts;
  }, [typography, preloadWeights]);

  // Update font status
  const updateFontStatus = useCallback((family: string, update: Partial<FontLoadStatus>) => {
    setFontStatuses((prev) => {
      const existing = prev.find((f) => f.family === family);
      if (existing) {
        return prev.map((f) => (f.family === family ? { ...f, ...update } : f));
      }
      return [...prev, { family, status: 'pending', ...update }];
    });
  }, []);

  // Handle font load state changes
  const handleFontLoadState = useCallback(
    (state: FontLoadingState) => {
      const { family, status, error } = state;

      if (status === 'loading') {
        if (enablePerformanceTracking) {
          loadStartTimes.current[family] = performance.now();
        }
        updateFontStatus(family, { status: 'loading' });
      } else if (status === 'loaded') {
        const loadTime = enablePerformanceTracking && loadStartTimes.current[family]
          ? performance.now() - loadStartTimes.current[family]
          : undefined;

        updateFontStatus(family, { status: 'loaded', loadTime });

        if (enablePerformanceTracking && loadTime !== undefined) {
          setMetrics((prev) => ({
            ...prev,
            fontLoadTimes: { ...prev.fontLoadTimes, [family]: loadTime },
            fontsLoaded: prev.fontsLoaded + 1,
          }));
        }
      } else if (status === 'error') {
        updateFontStatus(family, { status: 'error', error });
        onFontError?.(family, error || 'Unknown error');

        if (enablePerformanceTracking) {
          setMetrics((prev) => ({
            ...prev,
            fontsFailed: prev.fontsFailed + 1,
          }));
        }
      }
    },
    [enablePerformanceTracking, updateFontStatus, onFontError]
  );

  // Load a single font
  const loadFont = useCallback(
    async (family: string, weights: number[] = preloadWeights) => {
      updateFontStatus(family, { status: 'loading' });

      // Subscribe to load events
      const unsubscribe = fontService.onFontLoad(family, handleFontLoadState);

      try {
        await fontService.loadFont(family, weights);
      } catch (error) {
        updateFontStatus(family, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to load font',
        });
      } finally {
        unsubscribe();
      }
    },
    [preloadWeights, updateFontStatus, handleFontLoadState]
  );

  // Preload a font (non-blocking)
  const preloadFont = useCallback(
    (family: string, weights: number[] = preloadWeights) => {
      fontService.preloadFont(family, weights);
      updateFontStatus(family, { status: 'pending' });
    },
    [preloadWeights, updateFontStatus]
  );

  // Retry failed fonts
  const retryFailed = useCallback(async () => {
    const failedFonts = fontStatuses.filter((f) => f.status === 'error');
    await Promise.all(failedFonts.map((f) => loadFont(f.family)));
  }, [fontStatuses, loadFont]);

  // Load fonts when typography changes
  useEffect(() => {
    const fonts = getFontsToLoad();
    if (fonts.length === 0) return;

    hasCalledOnLoaded.current = false;

    if (enablePerformanceTracking) {
      overallStartTime.current = performance.now();
    }

    // Initialize statuses
    const initialStatuses: FontLoadStatus[] = fonts.map((f) => ({
      family: f.family,
      status: 'pending',
    }));
    setFontStatuses(initialStatuses);

    // Preload first, then load
    if (preload) {
      fonts.forEach((f) => fontService.preloadFont(f.family, f.weights.slice(0, 2)));
    }

    // Load all fonts
    const loadAllFonts = async () => {
      const unsubscribers: (() => void)[] = [];

      // Subscribe to all font load events
      fonts.forEach((f) => {
        const unsub = fontService.onFontLoad(f.family, handleFontLoadState);
        unsubscribers.push(unsub);
      });

      try {
        await fontService.loadFonts(fonts);
      } catch (error) {
        console.error('Font loading error:', error);
      }

      // Cleanup subscriptions
      unsubscribers.forEach((unsub) => unsub());
    };

    loadAllFonts();
  }, [typography, preload, getFontsToLoad, handleFontLoadState, enablePerformanceTracking]);

  // Calculate derived state
  const allFontsLoaded = fontStatuses.length > 0 && fontStatuses.every((f) => f.status === 'loaded');
  const isLoading = fontStatuses.some((f) => f.status === 'loading' || f.status === 'pending');
  const hasErrors = fontStatuses.some((f) => f.status === 'error');

  // Update final metrics and call onFontsLoaded when complete
  useEffect(() => {
    if (allFontsLoaded && !hasCalledOnLoaded.current) {
      hasCalledOnLoaded.current = true;

      if (enablePerformanceTracking && overallStartTime.current !== null) {
        const totalLoadTime = performance.now() - overallStartTime.current;
        setMetrics((prev) => ({
          ...prev,
          totalLoadTime,
          isComplete: true,
        }));
      }

      onFontsLoaded?.();
    }
  }, [allFontsLoaded, enablePerformanceTracking, onFontsLoaded]);

  return {
    fontStatuses,
    allFontsLoaded,
    isLoading,
    hasErrors,
    metrics,
    loadFont,
    preloadFont,
    retryFailed,
  };
}

// =============================================================================
// Font Display CSS Generator
// =============================================================================

/**
 * Generate CSS for font-display strategy
 */
export function generateFontDisplayCSS(
  fonts: Array<{
    family: string;
    url?: string;
    format?: string;
    weight?: number;
    style?: string;
  }>,
  displayStrategy: 'auto' | 'block' | 'swap' | 'fallback' | 'optional' = 'swap'
): string {
  return fonts
    .filter((font) => font.url)
    .map(
      (font) => `
@font-face {
  font-family: "${font.family}";
  src: url("${font.url}") format("${font.format || 'woff2'}");
  font-weight: ${font.weight || 400};
  font-style: ${font.style || 'normal'};
  font-display: ${displayStrategy};
}
`
    )
    .join('\n');
}

// =============================================================================
// Preload Link Generator
// =============================================================================

/**
 * Generate preload link elements for fonts
 */
export function createFontPreloadLinks(
  fonts: Array<{ family: string; weights?: number[] }>
): HTMLLinkElement[] {
  return fonts.flatMap((font) => {
    const weights = font.weights || [400, 600];
    return weights.map((weight) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'font';
      link.type = 'font/woff2';
      link.crossOrigin = 'anonymous';
      // Note: Real implementation would need actual font URLs
      // This is a placeholder structure
      link.href = `https://fonts.gstatic.com/s/${font.family.toLowerCase().replace(/\s/g, '')}/v1/${weight}.woff2`;
      return link;
    });
  });
}

export default useFontLoader;
