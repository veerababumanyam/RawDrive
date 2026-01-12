/**
 * useUtmTracking - Hook to capture and persist UTM parameters
 *
 * Captures utm_source, utm_medium, utm_campaign, utm_content, and utm_term
 * from URL query parameters. Persists to sessionStorage for the duration
 * of the session, allowing attribution even after navigation.
 *
 * Feature: 027-gallery-feature-completion
 * User Story: US8 - UTM Tracking for Marketing Attribution
 */

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';

/**
 * UTM parameter data structure
 */
export interface UtmParameters {
  /** Traffic source (e.g., 'google', 'facebook', 'newsletter') */
  utm_source?: string;
  /** Marketing medium (e.g., 'cpc', 'email', 'social') */
  utm_medium?: string;
  /** Campaign name (e.g., 'spring_sale', 'wedding_promo') */
  utm_campaign?: string;
  /** Specific content/ad (e.g., 'banner_ad', 'text_link') */
  utm_content?: string;
  /** Paid search keywords */
  utm_term?: string;
  /** When UTM params were first captured */
  captured_at?: string;
  /** The landing page URL */
  landing_url?: string;
  /** Referrer URL */
  referrer?: string;
}

const UTM_STORAGE_KEY = 'rawdrive_utm_params';
const UTM_PARAM_NAMES = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

/**
 * Extract UTM parameters from URLSearchParams
 */
function extractUtmParams(searchParams: URLSearchParams): UtmParameters {
  const params: UtmParameters = {};

  UTM_PARAM_NAMES.forEach(paramName => {
    const value = searchParams.get(paramName);
    if (value) {
      params[paramName] = value;
    }
  });

  return params;
}

/**
 * Check if UTM params object has any values
 */
function hasUtmParams(params: UtmParameters): boolean {
  return UTM_PARAM_NAMES.some(name => !!params[name]);
}

/**
 * Load UTM params from session storage
 */
function loadStoredUtmParams(): UtmParameters | null {
  try {
    const stored = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load UTM params from storage:', e);
  }
  return null;
}

/**
 * Save UTM params to session storage
 */
function saveUtmParams(params: UtmParameters): void {
  try {
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(params));
  } catch (e) {
    console.warn('Failed to save UTM params to storage:', e);
  }
}

/**
 * Hook to capture and track UTM parameters for marketing attribution
 *
 * @returns Object with UTM parameters and utility functions
 *
 * @example
 * ```tsx
 * function GalleryPage() {
 *   const { utmParams, hasActiveUtm, clearUtm } = useUtmTracking();
 *
 *   // Include UTM params when registering visitor
 *   const handleRegister = async (data) => {
 *     await registerVisitor({
 *       ...data,
 *       ...utmParams,
 *     });
 *   };
 * }
 * ```
 */
export function useUtmTracking() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [utmParams, setUtmParams] = useState<UtmParameters>(() => {
    // Try to load from storage on initial render
    return loadStoredUtmParams() || {};
  });

  // Capture UTM params from URL on mount and navigation
  useEffect(() => {
    const urlParams = extractUtmParams(searchParams);

    if (hasUtmParams(urlParams)) {
      // New UTM params found in URL - capture with metadata
      const enrichedParams: UtmParameters = {
        ...urlParams,
        captured_at: new Date().toISOString(),
        landing_url: window.location.href,
        referrer: document.referrer || undefined,
      };

      setUtmParams(enrichedParams);
      saveUtmParams(enrichedParams);
    }
  }, [searchParams, location.pathname]);

  /**
   * Check if we have active UTM tracking
   */
  const hasActiveUtm = hasUtmParams(utmParams);

  /**
   * Clear stored UTM parameters (e.g., after conversion)
   */
  const clearUtm = useCallback(() => {
    setUtmParams({});
    try {
      sessionStorage.removeItem(UTM_STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear UTM params from storage:', e);
    }
  }, []);

  /**
   * Get UTM params formatted for API submission
   */
  const getUtmPayload = useCallback((): Record<string, string> => {
    const payload: Record<string, string> = {};

    UTM_PARAM_NAMES.forEach(name => {
      if (utmParams[name]) {
        payload[name] = utmParams[name]!;
      }
    });

    // Include referrer if available
    if (utmParams.referrer) {
      payload.referrer = utmParams.referrer;
    }

    return payload;
  }, [utmParams]);

  /**
   * Get the primary traffic source name for display
   */
  const getSourceName = useCallback((): string | null => {
    if (utmParams.utm_source) {
      return utmParams.utm_source;
    }
    if (utmParams.referrer) {
      try {
        const url = new URL(utmParams.referrer);
        return url.hostname.replace('www.', '');
      } catch {
        return null;
      }
    }
    return null;
  }, [utmParams]);

  return {
    /** Current UTM parameters */
    utmParams,
    /** Whether we have any UTM tracking data */
    hasActiveUtm,
    /** Clear stored UTM parameters */
    clearUtm,
    /** Get UTM params formatted for API submission */
    getUtmPayload,
    /** Get the primary traffic source name */
    getSourceName,
  };
}

export default useUtmTracking;
