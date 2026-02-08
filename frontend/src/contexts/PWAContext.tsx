import React, { createContext, useContext, useEffect, useMemo, useCallback } from 'react';
import { usePWA, UsePWAReturn } from '@/hooks/usePWA';
import { useTheme } from '@/hooks';

/* =============================================================================
   PWA Context Provider

   Provides PWA functionality across the application with theme-aware status bar
   integration and centralized PWA state management.
   ============================================================================= */

/**
 * PWA Context type - extends UsePWAReturn with additional functionality
 */
interface PWAContextType extends UsePWAReturn {
  /**
   * Update status bar to match current theme
   */
  syncStatusBarWithTheme: () => void;

  /**
   * Force dark status bar
   */
  setDarkStatusBar: () => void;

  /**
   * Force light status bar
   */
  setLightStatusBar: () => void;

  /**
   * Set status bar for immersive gallery viewing
   */
  setImmersiveStatusBar: () => void;

  /**
   * Vibrate the device (haptic feedback)
   */
  vibrate: (pattern?: number | number[]) => void;

  /**
   * Wake lock to prevent screen sleep during gallery viewing
   */
  requestWakeLock: () => Promise<void>;
  releaseWakeLock: () => Promise<void>;
  isWakeLocked: boolean;
}

const PWAContext = createContext<PWAContextType | undefined>(undefined);

/**
 * Status bar colors for different themes
 */
const STATUS_BAR_COLORS = {
  light: '#FFFFFF',
  dark: '#0F172A', // slate-900
  immersive: '#000000',
  gallery: '#000000',
} as const;

/**
 * PWA Provider Props
 */
interface PWAProviderProps {
  children: React.ReactNode;
}

/**
 * PWA Provider - Wraps the application with PWA context
 */
export function PWAProvider({ children }: PWAProviderProps) {
  const pwa = usePWA({
    onInstallAvailable: () => {
      console.log('[PWA] Install prompt available');
    },
    onInstalled: () => {
      console.log('[PWA] App installed successfully');
    },
    onNetworkChange: (online) => {
      console.log(`[PWA] Network status: ${online ? 'online' : 'offline'}`);
    },
    onDisplayModeChange: (mode) => {
      console.log(`[PWA] Display mode: ${mode}`);
    },
  });

  const { resolvedTheme } = useTheme();

  // Wake lock state
  const [wakeLock, setWakeLock] = React.useState<WakeLockSentinel | null>(null);
  const isWakeLocked = wakeLock !== null;

  // Sync status bar with current theme
  const syncStatusBarWithTheme = useCallback(() => {
    const color = resolvedTheme === 'dark' ? STATUS_BAR_COLORS.dark : STATUS_BAR_COLORS.light;
    pwa.setStatusBarColor(color);
  }, [resolvedTheme, pwa]);

  // Set dark status bar
  const setDarkStatusBar = useCallback(() => {
    pwa.setStatusBarColor(STATUS_BAR_COLORS.dark);
  }, [pwa]);

  // Set light status bar
  const setLightStatusBar = useCallback(() => {
    pwa.setStatusBarColor(STATUS_BAR_COLORS.light);
  }, [pwa]);

  // Set immersive status bar (for gallery fullscreen)
  const setImmersiveStatusBar = useCallback(() => {
    pwa.setStatusBarColor(STATUS_BAR_COLORS.immersive);
  }, [pwa]);

  // Vibrate device
  const vibrate = useCallback((pattern: number | number[] = 50) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }, []);

  // Wake lock to prevent screen sleep
  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) {
      console.warn('[PWA] Wake Lock API not supported');
      return;
    }

    try {
      const lock = await (navigator as Navigator & { wakeLock: { request: (type: 'screen') => Promise<WakeLockSentinel> } }).wakeLock.request('screen');
      setWakeLock(lock);
      console.log('[PWA] Wake lock acquired');

      // Handle visibility change
      lock.addEventListener('release', () => {
        setWakeLock(null);
        console.log('[PWA] Wake lock released');
      });
    } catch (error) {
      console.warn('[PWA] Wake lock request failed:', error);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLock) {
      await wakeLock.release();
      setWakeLock(null);
    }
  }, [wakeLock]);

  // Sync status bar color with theme on mount and theme change
  useEffect(() => {
    // Only sync if in standalone mode (installed PWA)
    if (pwa.displayMode !== 'browser') {
      syncStatusBarWithTheme();
    }
  }, [resolvedTheme, pwa.displayMode, syncStatusBarWithTheme]);

  // Re-acquire wake lock when visibility changes back
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isWakeLocked) {
        // Wake lock was released when page became invisible, re-acquire
        if (!wakeLock) {
          await requestWakeLock();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isWakeLocked, wakeLock, requestWakeLock]);

  // Set up mobile-specific meta tags on mount
  useEffect(() => {
    // Ensure viewport meta tag is set correctly for mobile
    let viewportMeta = document.querySelector('meta[name="viewport"]');
    if (!viewportMeta) {
      viewportMeta = document.createElement('meta');
      viewportMeta.setAttribute('name', 'viewport');
      document.head.appendChild(viewportMeta);
    }
    viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');

    // Apple-specific meta tags for iOS PWA
    if (pwa.platform.isIOS) {
      // Apple mobile web app capable
      let appleMeta = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
      if (!appleMeta) {
        appleMeta = document.createElement('meta');
        appleMeta.setAttribute('name', 'apple-mobile-web-app-capable');
        document.head.appendChild(appleMeta);
      }
      appleMeta.setAttribute('content', 'yes');

      // Apple mobile web app status bar style
      let appleStatusMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (!appleStatusMeta) {
        appleStatusMeta = document.createElement('meta');
        appleStatusMeta.setAttribute('name', 'apple-mobile-web-app-status-bar-style');
        document.head.appendChild(appleStatusMeta);
      }
      appleStatusMeta.setAttribute('content', resolvedTheme === 'dark' ? 'black-translucent' : 'default');

      // Apple mobile web app title
      let appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (!appleTitleMeta) {
        appleTitleMeta = document.createElement('meta');
        appleTitleMeta.setAttribute('name', 'apple-mobile-web-app-title');
        document.head.appendChild(appleTitleMeta);
      }
      appleTitleMeta.setAttribute('content', 'RawDrive');
    }

    // Android-specific meta tags
    if (pwa.platform.isAndroid) {
      // Mobile web app capable
      let mobileMeta = document.querySelector('meta[name="mobile-web-app-capable"]');
      if (!mobileMeta) {
        mobileMeta = document.createElement('meta');
        mobileMeta.setAttribute('name', 'mobile-web-app-capable');
        document.head.appendChild(mobileMeta);
      }
      mobileMeta.setAttribute('content', 'yes');
    }

    // Format detection to prevent auto-formatting of phone numbers, etc.
    let formatMeta = document.querySelector('meta[name="format-detection"]');
    if (!formatMeta) {
      formatMeta = document.createElement('meta');
      formatMeta.setAttribute('name', 'format-detection');
      document.head.appendChild(formatMeta);
    }
    formatMeta.setAttribute('content', 'telephone=no');

    // MS Application meta tags for Windows
    let msTileMeta = document.querySelector('meta[name="msapplication-TileColor"]');
    if (!msTileMeta) {
      msTileMeta = document.createElement('meta');
      msTileMeta.setAttribute('name', 'msapplication-TileColor');
      document.head.appendChild(msTileMeta);
    }
    msTileMeta.setAttribute('content', STATUS_BAR_COLORS.dark);

  }, [pwa.platform.isIOS, pwa.platform.isAndroid, resolvedTheme]);

  // Memoize context value
  const value = useMemo<PWAContextType>(() => ({
    ...pwa,
    syncStatusBarWithTheme,
    setDarkStatusBar,
    setLightStatusBar,
    setImmersiveStatusBar,
    vibrate,
    requestWakeLock,
    releaseWakeLock,
    isWakeLocked,
  }), [
    pwa,
    syncStatusBarWithTheme,
    setDarkStatusBar,
    setLightStatusBar,
    setImmersiveStatusBar,
    vibrate,
    requestWakeLock,
    releaseWakeLock,
    isWakeLocked,
  ]);

  return (
    <PWAContext.Provider value={value}>
      {children}
    </PWAContext.Provider>
  );
}

/**
 * Hook to access PWA context
 */
export function usePWAContext(): PWAContextType {
  const context = useContext(PWAContext);
  if (!context) {
    throw new Error('usePWAContext must be used within a PWAProvider');
  }
  return context;
}

/**
 * Wake Lock Sentinel interface
 */
interface WakeLockSentinel extends EventTarget {
  readonly released: boolean;
  readonly type: 'screen';
  release(): Promise<void>;
}

export default PWAProvider;
