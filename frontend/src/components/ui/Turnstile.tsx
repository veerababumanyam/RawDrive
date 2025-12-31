/**
 * Turnstile: Cloudflare Turnstile CAPTCHA component
 *
 * Provides bot protection via Cloudflare's privacy-focused CAPTCHA alternative.
 * Invisible or managed mode - most users won't see a challenge.
 *
 * Feature: 016-save-the-date (T124)
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TurnstileProps {
  /** Turnstile site key (from Cloudflare dashboard) */
  siteKey: string;
  /** Callback when verification succeeds */
  onVerify: (token: string) => void;
  /** Callback when verification fails */
  onError?: (error: Error) => void;
  /** Callback when token expires (user needs to re-verify) */
  onExpire?: () => void;
  /** Widget theme */
  theme?: 'light' | 'dark' | 'auto';
  /** Widget size */
  size?: 'normal' | 'compact' | 'invisible';
  /** Widget appearance mode */
  appearance?: 'always' | 'execute' | 'interaction-only';
  /** Additional CSS class */
  className?: string;
  /** Execution mode - if 'execute', call execute() to start verification */
  execution?: 'render' | 'execute';
  /** Action identifier for analytics */
  action?: string;
  /** Response field name (for form submission) */
  responseFieldName?: string;
}

// Turnstile script is loaded globally
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: TurnstileRenderOptions
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
      execute: (container: string | HTMLElement, options?: TurnstileRenderOptions) => void;
      getResponse: (widgetId: string) => string | undefined;
    };
  }
}

interface TurnstileRenderOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'error-callback'?: (error: Error) => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact' | 'invisible';
  appearance?: 'always' | 'execute' | 'interaction-only';
  execution?: 'render' | 'execute';
  action?: string;
  'response-field-name'?: string;
  'response-field'?: boolean;
}

// ---------------------------------------------------------------------------
// Script Loader
// ---------------------------------------------------------------------------

let scriptLoaded = false;
let scriptLoading = false;
const scriptLoadCallbacks: Array<() => void> = [];

function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (scriptLoaded && window.turnstile) {
      resolve();
      return;
    }

    scriptLoadCallbacks.push(resolve);

    if (scriptLoading) {
      return; // Script is already being loaded
    }

    scriptLoading = true;

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;

    script.onload = () => {
      scriptLoaded = true;
      scriptLoading = false;
      // Call all waiting callbacks
      scriptLoadCallbacks.forEach((cb) => cb());
      scriptLoadCallbacks.length = 0;
    };

    script.onerror = () => {
      scriptLoading = false;
      reject(new Error('Failed to load Turnstile script'));
    };

    document.head.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Turnstile: React.FC<TurnstileProps> = ({
  siteKey,
  onVerify,
  onError,
  onExpire,
  theme = 'auto',
  size = 'normal',
  appearance = 'always',
  execution = 'render',
  action,
  responseFieldName,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Render the Turnstile widget
  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || widgetIdRef.current) {
      return;
    }

    const options: TurnstileRenderOptions = {
      sitekey: siteKey,
      callback: onVerify,
      'error-callback': (error) => {
        onError?.(error);
      },
      'expired-callback': () => {
        onExpire?.();
      },
      theme,
      size,
      appearance,
      execution,
    };

    if (action) {
      options.action = action;
    }

    if (responseFieldName) {
      options['response-field-name'] = responseFieldName;
      options['response-field'] = true;
    }

    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, options);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Failed to render Turnstile'));
    }
  }, [siteKey, onVerify, onError, onExpire, theme, size, appearance, execution, action, responseFieldName]);

  // Load script and render widget
  useEffect(() => {
    loadTurnstileScript()
      .then(() => {
        setIsLoaded(true);
        renderWidget();
      })
      .catch((error) => {
        onError?.(error);
      });

    return () => {
      // Cleanup widget on unmount
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignore cleanup errors
        }
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget, onError]);

  // Re-render if siteKey changes
  useEffect(() => {
    if (isLoaded && !widgetIdRef.current) {
      renderWidget();
    }
  }, [isLoaded, renderWidget]);

  return (
    <div
      ref={containerRef}
      className={`turnstile-container ${className}`}
      aria-label="Security verification"
    />
  );
};

// ---------------------------------------------------------------------------
// Hook for managing Turnstile token
// ---------------------------------------------------------------------------

export interface UseTurnstileResult {
  /** Current verification token (null if not verified) */
  token: string | null;
  /** Whether token is loading/verifying */
  isVerifying: boolean;
  /** Error message if verification failed */
  error: string | null;
  /** Reset the verification state */
  reset: () => void;
  /** Callback for Turnstile onVerify */
  handleVerify: (token: string) => void;
  /** Callback for Turnstile onError */
  handleError: (error: Error) => void;
  /** Callback for Turnstile onExpire */
  handleExpire: () => void;
}

export function useTurnstile(): UseTurnstileResult {
  const [token, setToken] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = useCallback((newToken: string) => {
    setToken(newToken);
    setIsVerifying(false);
    setError(null);
  }, []);

  const handleError = useCallback((err: Error) => {
    setToken(null);
    setIsVerifying(false);
    setError(err.message || 'Verification failed');
  }, []);

  const handleExpire = useCallback(() => {
    setToken(null);
    setIsVerifying(true);
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setToken(null);
    setIsVerifying(true);
    setError(null);
  }, []);

  return {
    token,
    isVerifying,
    error,
    reset,
    handleVerify,
    handleError,
    handleExpire,
  };
}

export default Turnstile;
