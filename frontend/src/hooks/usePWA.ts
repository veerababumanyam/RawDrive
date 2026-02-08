import { useState, useEffect, useCallback, useRef } from 'react';

/* =============================================================================
   PWA Hook - Progressive Web App functionality

   Provides app install prompts, display mode detection, status bar integration,
   offline detection, and home screen shortcut management.
   ============================================================================= */

/**
 * BeforeInstallPromptEvent - Event fired when PWA install is available
 * This is a non-standard event supported by Chromium-based browsers
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

/**
 * Navigator with share/shortcuts API extensions
 */
interface NavigatorWithShare {
  share?: (data: ShareData) => Promise<void>;
  getInstalledRelatedApps?: () => Promise<Array<{
    platform: string;
    url: string;
    id?: string;
  }>>;
}

/**
 * Display mode for the PWA
 */
export type PWADisplayMode = 'browser' | 'standalone' | 'fullscreen' | 'minimal-ui' | 'window-controls-overlay';

/**
 * Platform detection result
 */
export interface PlatformInfo {
  isIOS: boolean;
  isAndroid: boolean;
  isChrome: boolean;
  isSafari: boolean;
  isFirefox: boolean;
  isEdge: boolean;
  isMobile: boolean;
  supportsInstallPrompt: boolean;
  supportsServiceWorker: boolean;
  supportsShare: boolean;
  supportsBadge: boolean;
}

/**
 * PWA Install state
 */
export interface PWAInstallState {
  canInstall: boolean;
  isInstalled: boolean;
  isInstalling: boolean;
  installOutcome: 'accepted' | 'dismissed' | null;
}

/**
 * PWA Network state
 */
export interface NetworkState {
  isOnline: boolean;
  isSlowConnection: boolean;
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';
  downlink: number | null;
  rtt: number | null;
}

/**
 * Shortcut for home screen
 */
export interface PWAShortcut {
  name: string;
  short_name: string;
  description?: string;
  url: string;
  icons?: Array<{
    src: string;
    sizes: string;
    type?: string;
    purpose?: 'any' | 'maskable' | 'monochrome';
  }>;
}

/**
 * UsePWA hook options
 */
export interface UsePWAOptions {
  /**
   * Auto-prompt for installation after delay (ms)
   * Set to 0 to disable auto-prompt
   * @default 0 (disabled)
   */
  autoPromptDelay?: number;

  /**
   * Callback when install prompt becomes available
   */
  onInstallAvailable?: () => void;

  /**
   * Callback when app is installed
   */
  onInstalled?: () => void;

  /**
   * Callback when network status changes
   */
  onNetworkChange?: (online: boolean) => void;

  /**
   * Callback when display mode changes
   */
  onDisplayModeChange?: (mode: PWADisplayMode) => void;
}

/**
 * UsePWA hook return type
 */
export interface UsePWAReturn {
  // Platform info
  platform: PlatformInfo;

  // Install state
  install: PWAInstallState;

  // Network state
  network: NetworkState;

  // Display mode
  displayMode: PWADisplayMode;

  // Actions
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  showIOSInstallInstructions: boolean;
  dismissIOSInstructions: () => void;

  // Status bar
  setStatusBarColor: (color: string) => void;

  // Shortcuts (for future implementation)
  shortcuts: PWAShortcut[];
  addShortcut: (shortcut: PWAShortcut) => void;
  removeShortcut: (url: string) => void;

  // Badge (for notification badges)
  setBadge: (count?: number) => Promise<void>;
  clearBadge: () => Promise<void>;

  // Share
  canShare: (data?: ShareData) => boolean;
  share: (data: ShareData) => Promise<void>;
}

// Storage keys
const STORAGE_KEYS = {
  INSTALL_DISMISSED: 'rawdrive_pwa_install_dismissed',
  INSTALL_DISMISSED_AT: 'rawdrive_pwa_install_dismissed_at',
  IOS_INSTRUCTIONS_DISMISSED: 'rawdrive_ios_install_dismissed',
  SHORTCUTS: 'rawdrive_pwa_shortcuts',
} as const;

// Time constants
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Detect current platform and browser capabilities
 */
function detectPlatform(): PlatformInfo {
  const ua = navigator.userAgent.toLowerCase();

  const isIOS = /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(ua);
  const isChrome = /chrome/.test(ua) && !/edge|edg/.test(ua);
  const isSafari = /safari/.test(ua) && !/chrome/.test(ua);
  const isFirefox = /firefox/.test(ua);
  const isEdge = /edge|edg/.test(ua);
  const isMobile = /mobile|android|iphone|ipad|ipod/.test(ua) ||
    ('ontouchstart' in window && navigator.maxTouchPoints > 1);

  return {
    isIOS,
    isAndroid,
    isChrome,
    isSafari,
    isFirefox,
    isEdge,
    isMobile,
    supportsInstallPrompt: 'BeforeInstallPromptEvent' in window ||
      'onbeforeinstallprompt' in window,
    supportsServiceWorker: 'serviceWorker' in navigator,
    supportsShare: 'share' in navigator,
    supportsBadge: 'setAppBadge' in navigator,
  };
}

/**
 * Detect current display mode
 */
function detectDisplayMode(): PWADisplayMode {
  if (window.matchMedia('(display-mode: fullscreen)').matches) {
    return 'fullscreen';
  }
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return 'standalone';
  }
  if (window.matchMedia('(display-mode: minimal-ui)').matches) {
    return 'minimal-ui';
  }
  if (window.matchMedia('(display-mode: window-controls-overlay)').matches) {
    return 'window-controls-overlay';
  }
  // iOS Safari standalone mode
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) {
    return 'standalone';
  }
  return 'browser';
}

/**
 * Get network connection info
 */
function getNetworkInfo(): NetworkState {
  const connection = (navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
    };
  }).connection;

  const effectiveType = connection?.effectiveType as NetworkState['effectiveType'] || 'unknown';
  const isSlowConnection = ['slow-2g', '2g', '3g'].includes(effectiveType);

  return {
    isOnline: navigator.onLine,
    isSlowConnection,
    effectiveType,
    downlink: connection?.downlink ?? null,
    rtt: connection?.rtt ?? null,
  };
}

/**
 * Load shortcuts from local storage
 */
function loadShortcuts(): PWAShortcut[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SHORTCUTS);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save shortcuts to local storage
 */
function saveShortcuts(shortcuts: PWAShortcut[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SHORTCUTS, JSON.stringify(shortcuts));
  } catch (error) {
    console.warn('Failed to save shortcuts:', error);
  }
}

/**
 * Check if install was recently dismissed
 */
function wasRecentlyDismissed(): boolean {
  try {
    const dismissedAt = localStorage.getItem(STORAGE_KEYS.INSTALL_DISMISSED_AT);
    if (!dismissedAt) return false;

    const dismissedTime = parseInt(dismissedAt, 10);
    return Date.now() - dismissedTime < ONE_WEEK_MS;
  } catch {
    return false;
  }
}

/**
 * Mark install as dismissed
 */
function markDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.INSTALL_DISMISSED, 'true');
    localStorage.setItem(STORAGE_KEYS.INSTALL_DISMISSED_AT, Date.now().toString());
  } catch {
    // Ignore storage errors
  }
}

/**
 * PWA functionality hook
 */
export function usePWA(options: UsePWAOptions = {}): UsePWAReturn {
  const {
    autoPromptDelay = 0,
    onInstallAvailable,
    onInstalled,
    onNetworkChange,
    onDisplayModeChange,
  } = options;

  // Refs for event handling
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const autoPromptTimerRef = useRef<number | null>(null);

  // Platform detection (stable)
  const [platform] = useState<PlatformInfo>(detectPlatform);

  // Install state
  const [install, setInstall] = useState<PWAInstallState>({
    canInstall: false,
    isInstalled: detectDisplayMode() !== 'browser',
    isInstalling: false,
    installOutcome: null,
  });

  // Network state
  const [network, setNetwork] = useState<NetworkState>(getNetworkInfo);

  // Display mode
  const [displayMode, setDisplayMode] = useState<PWADisplayMode>(detectDisplayMode);

  // iOS install instructions visibility
  const [showIOSInstallInstructions, setShowIOSInstallInstructions] = useState(false);

  // Shortcuts
  const [shortcuts, setShortcuts] = useState<PWAShortcut[]>(loadShortcuts);

  // Handle beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent default browser install prompt
      e.preventDefault();

      // Store the event for later use
      deferredPromptRef.current = e as BeforeInstallPromptEvent;

      // Check if recently dismissed
      if (wasRecentlyDismissed()) {
        return;
      }

      // Update state to show custom install UI
      setInstall(prev => ({
        ...prev,
        canInstall: true,
      }));

      // Notify callback
      onInstallAvailable?.();

      // Auto-prompt if configured
      if (autoPromptDelay > 0) {
        autoPromptTimerRef.current = window.setTimeout(() => {
          // Auto-trigger install prompt
          if (deferredPromptRef.current) {
            deferredPromptRef.current.prompt();
          }
        }, autoPromptDelay);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      if (autoPromptTimerRef.current) {
        clearTimeout(autoPromptTimerRef.current);
      }
    };
  }, [autoPromptDelay, onInstallAvailable]);

  // Handle appinstalled event
  useEffect(() => {
    const handleAppInstalled = () => {
      setInstall(prev => ({
        ...prev,
        canInstall: false,
        isInstalled: true,
        isInstalling: false,
        installOutcome: 'accepted',
      }));

      deferredPromptRef.current = null;
      onInstalled?.();
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [onInstalled]);

  // Handle network changes
  useEffect(() => {
    const handleOnline = () => {
      setNetwork(prev => ({ ...prev, isOnline: true }));
      onNetworkChange?.(true);
    };

    const handleOffline = () => {
      setNetwork(prev => ({ ...prev, isOnline: false }));
      onNetworkChange?.(false);
    };

    const handleConnectionChange = () => {
      setNetwork(getNetworkInfo());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const connection = (navigator as Navigator & { connection?: EventTarget }).connection;
    connection?.addEventListener('change', handleConnectionChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      connection?.removeEventListener('change', handleConnectionChange);
    };
  }, [onNetworkChange]);

  // Handle display mode changes
  useEffect(() => {
    const mediaQueries = [
      window.matchMedia('(display-mode: fullscreen)'),
      window.matchMedia('(display-mode: standalone)'),
      window.matchMedia('(display-mode: minimal-ui)'),
    ];

    const handleChange = () => {
      const newMode = detectDisplayMode();
      setDisplayMode(newMode);
      onDisplayModeChange?.(newMode);

      // Update installed state
      setInstall(prev => ({
        ...prev,
        isInstalled: newMode !== 'browser',
      }));
    };

    mediaQueries.forEach(mq => {
      mq.addEventListener('change', handleChange);
    });

    return () => {
      mediaQueries.forEach(mq => {
        mq.removeEventListener('change', handleChange);
      });
    };
  }, [onDisplayModeChange]);

  // Check for iOS install instructions on mount
  useEffect(() => {
    if (platform.isIOS && platform.isSafari && displayMode === 'browser') {
      // Check if not dismissed
      try {
        const dismissed = localStorage.getItem(STORAGE_KEYS.IOS_INSTRUCTIONS_DISMISSED);
        if (!dismissed) {
          // Show instructions after a delay
          const timer = setTimeout(() => {
            setShowIOSInstallInstructions(true);
          }, 3000);
          return () => clearTimeout(timer);
        }
      } catch {
        // Ignore storage errors
      }
    }
  }, [platform.isIOS, platform.isSafari, displayMode]);

  // Prompt install action
  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    // For iOS, show instructions instead
    if (platform.isIOS && !deferredPromptRef.current) {
      setShowIOSInstallInstructions(true);
      return 'unavailable';
    }

    // Check if prompt is available
    if (!deferredPromptRef.current) {
      return 'unavailable';
    }

    setInstall(prev => ({ ...prev, isInstalling: true }));

    try {
      // Show the install prompt
      await deferredPromptRef.current.prompt();

      // Wait for user choice
      const { outcome } = await deferredPromptRef.current.userChoice;

      setInstall(prev => ({
        ...prev,
        isInstalling: false,
        installOutcome: outcome,
        canInstall: outcome === 'dismissed',
      }));

      if (outcome === 'dismissed') {
        markDismissed();
      }

      // Clear the prompt reference if accepted
      if (outcome === 'accepted') {
        deferredPromptRef.current = null;
      }

      return outcome;
    } catch (error) {
      console.error('Install prompt error:', error);
      setInstall(prev => ({ ...prev, isInstalling: false }));
      return 'unavailable';
    }
  }, [platform.isIOS]);

  // Dismiss iOS instructions
  const dismissIOSInstructions = useCallback(() => {
    setShowIOSInstallInstructions(false);
    try {
      localStorage.setItem(STORAGE_KEYS.IOS_INSTRUCTIONS_DISMISSED, 'true');
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Set status bar color (for mobile browsers)
  const setStatusBarColor = useCallback((color: string) => {
    // Update meta theme-color
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute('content', color);

    // Update Apple status bar style
    let metaApple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (!metaApple) {
      metaApple = document.createElement('meta');
      metaApple.setAttribute('name', 'apple-mobile-web-app-status-bar-style');
      document.head.appendChild(metaApple);
    }
    // Determine if color is dark or light
    const isLightColor = isLightHex(color);
    metaApple.setAttribute('content', isLightColor ? 'default' : 'black-translucent');
  }, []);

  // Add shortcut
  const addShortcut = useCallback((shortcut: PWAShortcut) => {
    setShortcuts(prev => {
      const exists = prev.some(s => s.url === shortcut.url);
      if (exists) return prev;
      const updated = [...prev, shortcut].slice(-10); // Keep max 10 shortcuts
      saveShortcuts(updated);
      return updated;
    });
  }, []);

  // Remove shortcut
  const removeShortcut = useCallback((url: string) => {
    setShortcuts(prev => {
      const updated = prev.filter(s => s.url !== url);
      saveShortcuts(updated);
      return updated;
    });
  }, []);

  // Badge API
  const setBadge = useCallback(async (count?: number) => {
    if (!platform.supportsBadge) return;
    try {
      if (count === undefined || count === 0) {
        await (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();
      } else {
        await (navigator as Navigator & { setAppBadge: (count: number) => Promise<void> }).setAppBadge(count);
      }
    } catch (error) {
      console.warn('Badge API error:', error);
    }
  }, [platform.supportsBadge]);

  const clearBadge = useCallback(async () => {
    await setBadge(0);
  }, [setBadge]);

  // Share API
  const canShare = useCallback((data?: ShareData): boolean => {
    if (!platform.supportsShare) return false;
    if (!data) return true;
    return (navigator as NavigatorWithShare).share !== undefined;
  }, [platform.supportsShare]);

  const share = useCallback(async (data: ShareData): Promise<void> => {
    if (!platform.supportsShare) {
      throw new Error('Share API not supported');
    }
    await (navigator as NavigatorWithShare).share!(data);
  }, [platform.supportsShare]);

  return {
    platform,
    install,
    network,
    displayMode,
    promptInstall,
    showIOSInstallInstructions,
    dismissIOSInstructions,
    setStatusBarColor,
    shortcuts,
    addShortcut,
    removeShortcut,
    setBadge,
    clearBadge,
    canShare,
    share,
  };
}

/**
 * Helper to determine if a hex color is light
 */
function isLightHex(hex: string): boolean {
  const color = hex.replace('#', '');
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

export default usePWA;
