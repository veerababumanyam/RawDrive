
🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore existing PWA and ServiceWorker infrastructure",
      "status": "in_progress",
      "activeForm": "Exploring existing PWA and ServiceWorker infrastructure"
    },
    {
      "content": "Implement iOS/Android app install prompts with custom icons",
      "status": "pending",
      "activeForm": "Implementing iOS/Android app install prompts with custom icons"
    },
    {
      "content": "Add touch gesture support (pinch-zoom, swipe navigation)",
      "status": "pending",
      "activeForm": "Adding touch gesture support"
    },
    {
      "content": "Implement native status bar integration",
      "status": "pending",
      "activeForm": "Implementing native status bar integration"
    },
    {
      "content": "Add offline support for cached galleries",
      "status": "pending",
      "activeForm": "Adding offline support for cached galleries"
    },
    {
      "content": "Implement home screen shortcuts for frequent galleries",
      "status": "pending",
      "activeForm": "Implementing home screen shortcuts for frequent galleries"
    }
  ]
}

🔧 Tool: Task
Input: {
  "description": "Explore PWA infrastructure",
  "prompt": "Explore the RawDrive codebase to find:\n1. Existing ServiceWorker implementation (look for sw.js, service-worker.ts, or similar files)\n2. Current PWA manifest file (manifest.json or webmanifest)\n3. Existing PWA-related hooks or utilities\n4. Current mobile/touch gesture implementations\n5. Any existing install prompt handling\n6. Vite PWA plugin configuration if present\n\nSearch in frontend/src, frontend/public, and frontend configuration files (vite.config.ts). Be thorough and report all PWA-related files found.",
  "subagent_type": "Explore"
}

🔧 Tool: Glob
Input: {
  "pattern": "frontend/**/*.{js,ts,tsx,json}"
}

🔧 Tool: Bash
Input: {
  "command": "find \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\" -type f -iname \"*sw*\" -o -iname \"*service*worker*\" -o -iname \"*manifest*\" -o -iname \"*pwa*\" 2>/dev/null | head -20",
  "description": "Search for SW, service-worker, manifest, and PWA files"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\vite.config.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\components\\ui\\PWAUpdateNotification.tsx"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\public\\offline.html"
}

🔧 Tool: Bash
Input: {
  "command": "ls -la \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\public\" | grep -E \"manifest|offline|icon|apple\" 2>/dev/null",
  "description": "List public folder PWA-related files"
}

🔧 Tool: Glob
Input: {
  "pattern": "frontend/src/**/*PWA* frontend/src/**/*pwa* frontend/src/**/*offline* frontend/src/**/*gesture* frontend/src/**/*touch*"
}

🔧 Tool: Bash
Input: {
  "command": "grep -r \"installPrompt\\|beforeinstallprompt\\|pwa-\\|gesture\\|touch\" \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\" --include=\"*.ts\" --include=\"*.tsx\" -l 2>/dev/null | head -20",
  "description": "Find files with install prompt or gesture handling"
}

🔧 Tool: Bash
Input: {
  "command": "find \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\" -name \"*.ts\" -o -name \"*.tsx\" | xargs grep -l \"registerSW\\|unregister\" 2>/dev/null",
  "description": "Find service worker registration files"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\main.tsx"
}

🔧 Tool: Bash
Input: {
  "command": "ls -la \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\public\" | grep -E \"\\.png|\\.jpg|\\.svg|manifest|\\.webmanifest|\\.ico\" 2>/dev/null",
  "description": "List all icon and manifest files in public directory"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\dist\\manifest.webmanifest"
}

🔧 Tool: Bash
Input: {
  "command": "grep -r \"install\\|beforeinstallprompt\" \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\" --include=\"*.tsx\" --include=\"*.ts\" 2>/dev/null | head -10",
  "description": "Search for install prompt handling"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\index.html"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\App.tsx"
}

🔧 Tool: Bash
Input: {
  "command": "grep -r \"useSwipe\\|useTouchGesture\\|usePinch\\|useGesture\" \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\" --include=\"*.ts\" --include=\"*.tsx\" 2>/dev/null",
  "description": "Search for gesture hooks"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\useTouchGestures.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\lightbox\\useLightboxGestures.ts"
}

🔧 Tool: Bash
Input: {
  "command": "find \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\" -type f -name \"*.ts\" -o -name \"*.tsx\" | head -30",
  "description": "List all hook files"
}

🔧 Tool: Bash
Input: {
  "command": "grep -A 5 \"vite-plugin-pwa\\|@use-gesture\" \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\package.json\"",
  "description": "Check PWA and gesture dependencies"
}

🔧 Tool: Bash
Input: {
  "command": "ls -lh \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\public\" | grep -E \"png|jpg|svg|webp|ico\"",
  "description": "List all icon files with sizes"
}

🔧 Tool: Bash
Input: {
  "command": "find \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\dist\" -name \"*.js\" -path \"*/sw*\" 2>/dev/null",
  "description": "Find service worker JS files"
}

🔧 Tool: Bash
Input: {
  "command": "find \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\" -name \"sw.ts\" -o -name \"service-worker.ts\" -o -name \"service-worker.js\" 2>/dev/null | grep -v node_modules | grep -v dist",
  "description": "Find source service worker files"
}

🔧 Tool: Bash
Input: {
  "command": "head -50 \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\dist\\sw.js\"",
  "description": "View first part of generated service worker"
}

🔧 Tool: Bash
Input: {
  "command": "grep -r \"install\\|activate\\|fetch\" \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\" --include=\"*.html\" 2>/dev/null | head -5",
  "description": "Check for SW lifecycle in HTML"
}

🔧 Tool: Bash
Input: {
  "command": "grep -r \"onTouchStart\\|onTouchEnd\\|onTouchMove\\|ontouchstart\" \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\" --include=\"*.tsx\" --include=\"*.ts\" 2>/dev/null | head -15",
  "description": "Find touch event handlers"
}

🔧 Tool: Bash
Input: {
  "command": "ls -la \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\components\\ui\" | head -30",
  "description": "List UI components"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\index.css",
  "limit": 100
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\useLongPress.ts"
}

🔧 Tool: Bash
Input: {
  "command": "grep -r \"install\\|prompt\\|pwa\" \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\" --include=\"*.tsx\" --include=\"*.ts\" -i 2>/dev/null | grep -v \"node_modules\" | head -20",
  "description": "Find PWA-related code"
}

🔧 Tool: Bash
Input: {
  "command": "find \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\" -type f \\( -name \"*.tsx\" -o -name \"*.ts\" \\) | xargs grep -l \"PWA\\|pwa\" 2>/dev/null",
  "description": "Find files mentioning PWA"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\index.ts"
}

🔧 Tool: Bash
Input: {
  "command": "ls -la \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\" | head -40",
  "description": "List all hook files"
}

🔧 Tool: Bash
Input: {
  "command": "find \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\public\" -type f ! -path \"*/locales/*\" ! -path \"*/models/*\" 2>/dev/null",
  "description": "List non-locale/model public files"
}

🔧 Tool: Bash
Input: {
  "command": "wc -l \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\dist\\sw.js\"",
  "description": "Get service worker file size"
}

🔧 Tool: Bash
Input: {
  "command": "grep -r \"touch\\|gesture\\|pwa\" \"C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\lightbox\" --include=\"*.ts\" --include=\"*.tsx\" 2>/dev/null | head -3",
  "description": "Confirm lightbox gesture hooks"
}

Excellent! The exploration reveals RawDrive has a solid PWA foundation already. Now let me update my understanding and plan the enhancements needed:

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore existing PWA and ServiceWorker infrastructure",
      "status": "completed",
      "activeForm": "Exploring existing PWA and ServiceWorker infrastructure"
    },
    {
      "content": "Implement iOS/Android app install prompts with custom icons",
      "status": "in_progress",
      "activeForm": "Implementing iOS/Android app install prompts with custom icons"
    },
    {
      "content": "Add touch gesture support (pinch-zoom, swipe navigation)",
      "status": "pending",
      "activeForm": "Adding touch gesture support"
    },
    {
      "content": "Implement native status bar integration",
      "status": "pending",
      "activeForm": "Implementing native status bar integration"
    },
    {
      "content": "Add offline support for cached galleries",
      "status": "pending",
      "activeForm": "Adding offline support for cached galleries"
    },
    {
      "content": "Implement home screen shortcuts for frequent galleries",
      "status": "pending",
      "activeForm": "Implementing home screen shortcuts for frequent galleries"
    }
  ]
}

Let me read the existing PWA-related files to understand the current implementation better:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\vite.config.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\main.tsx"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\components\\ui\\PWAUpdateNotification.tsx"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\index.html"
}

Now let me check the existing hooks and the App.tsx to understand the integration points:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\App.tsx"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\index.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\public\\offline.html"
}

Now I have a complete picture of the existing infrastructure. Let me implement the enhanced PWA features. I'll start by creating a comprehensive PWA utilities hook that handles app install prompts and other PWA-related functionality:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\usePWA.ts",
  "content": "import { useState, useEffect, useCallback, useRef } from 'react';\n\n/* =============================================================================\n   PWA Hook - Progressive Web App functionality\n\n   Provides app install prompts, display mode detection, status bar integration,\n   offline detection, and home screen shortcut management.\n   ============================================================================= */\n\n/**\n * BeforeInstallPromptEvent - Event fired when PWA install is available\n * This is a non-standard event supported by Chromium-based browsers\n */\ninterface BeforeInstallPromptEvent extends Event {\n  readonly platforms: string[];\n  readonly userChoice: Promise<{\n    outcome: 'accepted' | 'dismissed';\n    platform: string;\n  }>;\n  prompt(): Promise<void>;\n}\n\n/**\n * Navigator with share/shortcuts API extensions\n */\ninterface NavigatorWithShare extends Navigator {\n  share?: (data: ShareData) => Promise<void>;\n  getInstalledRelatedApps?: () => Promise<Array<{\n    platform: string;\n    url: string;\n    id?: string;\n  }>>;\n}\n\n/**\n * Display mode for the PWA\n */\nexport type PWADisplayMode = 'browser' | 'standalone' | 'fullscreen' | 'minimal-ui' | 'window-controls-overlay';\n\n/**\n * Platform detection result\n */\nexport interface PlatformInfo {\n  isIOS: boolean;\n  isAndroid: boolean;\n  isChrome: boolean;\n  isSafari: boolean;\n  isFirefox: boolean;\n  isEdge: boolean;\n  isMobile: boolean;\n  supportsInstallPrompt: boolean;\n  supportsServiceWorker: boolean;\n  supportsShare: boolean;\n  supportsBadge: boolean;\n}\n\n/**\n * PWA Install state\n */\nexport interface PWAInstallState {\n  canInstall: boolean;\n  isInstalled: boolean;\n  isInstalling: boolean;\n  installOutcome: 'accepted' | 'dismissed' | null;\n}\n\n/**\n * PWA Network state\n */\nexport interface NetworkState {\n  isOnline: boolean;\n  isSlowConnection: boolean;\n  effectiveType: '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';\n  downlink: number | null;\n  rtt: number | null;\n}\n\n/**\n * Shortcut for home screen\n */\nexport interface PWAShortcut {\n  name: string;\n  short_name: string;\n  description?: string;\n  url: string;\n  icons?: Array<{\n    src: string;\n    sizes: string;\n    type?: string;\n    purpose?: 'any' | 'maskable' | 'monochrome';\n  }>;\n}\n\n/**\n * UsePWA hook options\n */\nexport interface UsePWAOptions {\n  /**\n   * Auto-prompt for installation after delay (ms)\n   * Set to 0 to disable auto-prompt\n   * @default 0 (disabled)\n   */\n  autoPromptDelay?: number;\n\n  /**\n   * Callback when install prompt becomes available\n   */\n  onInstallAvailable?: () => void;\n\n  /**\n   * Callback when app is installed\n   */\n  onInstalled?: () => void;\n\n  /**\n   * Callback when network status changes\n   */\n  onNetworkChange?: (online: boolean) => void;\n\n  /**\n   * Callback when display mode changes\n   */\n  onDisplayModeChange?: (mode: PWADisplayMode) => void;\n}\n\n/**\n * UsePWA hook return type\n */\nexport interface UsePWAReturn {\n  // Platform info\n  platform: PlatformInfo;\n\n  // Install state\n  install: PWAInstallState;\n\n  // Network state\n  network: NetworkState;\n\n  // Display mode\n  displayMode: PWADisplayMode;\n\n  // Actions\n  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;\n  showIOSInstallInstructions: boolean;\n  dismissIOSInstructions: () => void;\n\n  // Status bar\n  setStatusBarColor: (color: string) => void;\n\n  // Shortcuts (for future implementation)\n  shortcuts: PWAShortcut[];\n  addShortcut: (shortcut: PWAShortcut) => void;\n  removeShortcut: (url: string) => void;\n\n  // Badge (for notification badges)\n  setBadge: (count?: number) => Promise<void>;\n  clearBadge: () => Promise<void>;\n\n  // Share\n  canShare: (data?: ShareData) => boolean;\n  share: (data: ShareData) => Promise<void>;\n}\n\n// Storage keys\nconst STORAGE_KEYS = {\n  INSTALL_DISMISSED: 'rawdrive_pwa_install_dismissed',\n  INSTALL_DISMISSED_AT: 'rawdrive_pwa_install_dismissed_at',\n  IOS_INSTRUCTIONS_DISMISSED: 'rawdrive_ios_install_dismissed',\n  SHORTCUTS: 'rawdrive_pwa_shortcuts',\n} as const;\n\n// Time constants\nconst ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;\n\n/**\n * Detect current platform and browser capabilities\n */\nfunction detectPlatform(): PlatformInfo {\n  const ua = navigator.userAgent.toLowerCase();\n\n  const isIOS = /iphone|ipad|ipod/.test(ua) ||\n    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);\n  const isAndroid = /android/.test(ua);\n  const isChrome = /chrome/.test(ua) && !/edge|edg/.test(ua);\n  const isSafari = /safari/.test(ua) && !/chrome/.test(ua);\n  const isFirefox = /firefox/.test(ua);\n  const isEdge = /edge|edg/.test(ua);\n  const isMobile = /mobile|android|iphone|ipad|ipod/.test(ua) ||\n    ('ontouchstart' in window && navigator.maxTouchPoints > 1);\n\n  return {\n    isIOS,\n    isAndroid,\n    isChrome,\n    isSafari,\n    isFirefox,\n    isEdge,\n    isMobile,\n    supportsInstallPrompt: 'BeforeInstallPromptEvent' in window ||\n      'onbeforeinstallprompt' in window,\n    supportsServiceWorker: 'serviceWorker' in navigator,\n    supportsShare: 'share' in navigator,\n    supportsBadge: 'setAppBadge' in navigator,\n  };\n}\n\n/**\n * Detect current display mode\n */\nfunction detectDisplayMode(): PWADisplayMode {\n  if (window.matchMedia('(display-mode: fullscreen)').matches) {\n    return 'fullscreen';\n  }\n  if (window.matchMedia('(display-mode: standalone)').matches) {\n    return 'standalone';\n  }\n  if (window.matchMedia('(display-mode: minimal-ui)').matches) {\n    return 'minimal-ui';\n  }\n  if (window.matchMedia('(display-mode: window-controls-overlay)').matches) {\n    return 'window-controls-overlay';\n  }\n  // iOS Safari standalone mode\n  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) {\n    return 'standalone';\n  }\n  return 'browser';\n}\n\n/**\n * Get network connection info\n */\nfunction getNetworkInfo(): NetworkState {\n  const connection = (navigator as Navigator & {\n    connection?: {\n      effectiveType?: string;\n      downlink?: number;\n      rtt?: number;\n    };\n  }).connection;\n\n  const effectiveType = connection?.effectiveType as NetworkState['effectiveType'] || 'unknown';\n  const isSlowConnection = ['slow-2g', '2g', '3g'].includes(effectiveType);\n\n  return {\n    isOnline: navigator.onLine,\n    isSlowConnection,\n    effectiveType,\n    downlink: connection?.downlink ?? null,\n    rtt: connection?.rtt ?? null,\n  };\n}\n\n/**\n * Load shortcuts from local storage\n */\nfunction loadShortcuts(): PWAShortcut[] {\n  try {\n    const stored = localStorage.getItem(STORAGE_KEYS.SHORTCUTS);\n    return stored ? JSON.parse(stored) : [];\n  } catch {\n    return [];\n  }\n}\n\n/**\n * Save shortcuts to local storage\n */\nfunction saveShortcuts(shortcuts: PWAShortcut[]): void {\n  try {\n    localStorage.setItem(STORAGE_KEYS.SHORTCUTS, JSON.stringify(shortcuts));\n  } catch (error) {\n    console.warn('Failed to save shortcuts:', error);\n  }\n}\n\n/**\n * Check if install was recently dismissed\n */\nfunction wasRecentlyDismissed(): boolean {\n  try {\n    const dismissedAt = localStorage.getItem(STORAGE_KEYS.INSTALL_DISMISSED_AT);\n    if (!dismissedAt) return false;\n\n    const dismissedTime = parseInt(dismissedAt, 10);\n    return Date.now() - dismissedTime < ONE_WEEK_MS;\n  } catch {\n    return false;\n  }\n}\n\n/**\n * Mark install as dismissed\n */\nfunction markDismissed(): void {\n  try {\n    localStorage.setItem(STORAGE_KEYS.INSTALL_DISMISSED, 'true');\n    localStorage.setItem(STORAGE_KEYS.INSTALL_DISMISSED_AT, Date.now().toString());\n  } catch {\n    // Ignore storage errors\n  }\n}\n\n/**\n * PWA functionality hook\n */\nexport function usePWA(options: UsePWAOptions = {}): UsePWAReturn {\n  const {\n    autoPromptDelay = 0,\n    onInstallAvailable,\n    onInstalled,\n    onNetworkChange,\n    onDisplayModeChange,\n  } = options;\n\n  // Refs for event handling\n  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);\n  const autoPromptTimerRef = useRef<number | null>(null);\n\n  // Platform detection (stable)\n  const [platform] = useState<PlatformInfo>(detectPlatform);\n\n  // Install state\n  const [install, setInstall] = useState<PWAInstallState>({\n    canInstall: false,\n    isInstalled: detectDisplayMode() !== 'browser',\n    isInstalling: false,\n    installOutcome: null,\n  });\n\n  // Network state\n  const [network, setNetwork] = useState<NetworkState>(getNetworkInfo);\n\n  // Display mode\n  const [displayMode, setDisplayMode] = useState<PWADisplayMode>(detectDisplayMode);\n\n  // iOS install instructions visibility\n  const [showIOSInstallInstructions, setShowIOSInstallInstructions] = useState(false);\n\n  // Shortcuts\n  const [shortcuts, setShortcuts] = useState<PWAShortcut[]>(loadShortcuts);\n\n  // Handle beforeinstallprompt event\n  useEffect(() => {\n    const handleBeforeInstallPrompt = (e: Event) => {\n      // Prevent default browser install prompt\n      e.preventDefault();\n\n      // Store the event for later use\n      deferredPromptRef.current = e as BeforeInstallPromptEvent;\n\n      // Check if recently dismissed\n      if (wasRecentlyDismissed()) {\n        return;\n      }\n\n      // Update state to show custom install UI\n      setInstall(prev => ({\n        ...prev,\n        canInstall: true,\n      }));\n\n      // Notify callback\n      onInstallAvailable?.();\n\n      // Auto-prompt if configured\n      if (autoPromptDelay > 0) {\n        autoPromptTimerRef.current = window.setTimeout(() => {\n          // Auto-trigger install prompt\n          if (deferredPromptRef.current) {\n            deferredPromptRef.current.prompt();\n          }\n        }, autoPromptDelay);\n      }\n    };\n\n    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);\n\n    return () => {\n      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);\n      if (autoPromptTimerRef.current) {\n        clearTimeout(autoPromptTimerRef.current);\n      }\n    };\n  }, [autoPromptDelay, onInstallAvailable]);\n\n  // Handle appinstalled event\n  useEffect(() => {\n    const handleAppInstalled = () => {\n      setInstall(prev => ({\n        ...prev,\n        canInstall: false,\n        isInstalled: true,\n        isInstalling: false,\n        installOutcome: 'accepted',\n      }));\n\n      deferredPromptRef.current = null;\n      onInstalled?.();\n    };\n\n    window.addEventListener('appinstalled', handleAppInstalled);\n\n    return () => {\n      window.removeEventListener('appinstalled', handleAppInstalled);\n    };\n  }, [onInstalled]);\n\n  // Handle network changes\n  useEffect(() => {\n    const handleOnline = () => {\n      setNetwork(prev => ({ ...prev, isOnline: true }));\n      onNetworkChange?.(true);\n    };\n\n    const handleOffline = () => {\n      setNetwork(prev => ({ ...prev, isOnline: false }));\n      onNetworkChange?.(false);\n    };\n\n    const handleConnectionChange = () => {\n      setNetwork(getNetworkInfo());\n    };\n\n    window.addEventListener('online', handleOnline);\n    window.addEventListener('offline', handleOffline);\n\n    const connection = (navigator as Navigator & { connection?: EventTarget }).connection;\n    connection?.addEventListener('change', handleConnectionChange);\n\n    return () => {\n      window.removeEventListener('online', handleOnline);\n      window.removeEventListener('offline', handleOffline);\n      connection?.removeEventListener('change', handleConnectionChange);\n    };\n  }, [onNetworkChange]);\n\n  // Handle display mode changes\n  useEffect(() => {\n    const mediaQueries = [\n      window.matchMedia('(display-mode: fullscreen)'),\n      window.matchMedia('(display-mode: standalone)'),\n      window.matchMedia('(display-mode: minimal-ui)'),\n    ];\n\n    const handleChange = () => {\n      const newMode = detectDisplayMode();\n      setDisplayMode(newMode);\n      onDisplayModeChange?.(newMode);\n\n      // Update installed state\n      setInstall(prev => ({\n        ...prev,\n        isInstalled: newMode !== 'browser',\n      }));\n    };\n\n    mediaQueries.forEach(mq => {\n      mq.addEventListener('change', handleChange);\n    });\n\n    return () => {\n      mediaQueries.forEach(mq => {\n        mq.removeEventListener('change', handleChange);\n      });\n    };\n  }, [onDisplayModeChange]);\n\n  // Check for iOS install instructions on mount\n  useEffect(() => {\n    if (platform.isIOS && platform.isSafari && displayMode === 'browser') {\n      // Check if not dismissed\n      try {\n        const dismissed = localStorage.getItem(STORAGE_KEYS.IOS_INSTRUCTIONS_DISMISSED);\n        if (!dismissed) {\n          // Show instructions after a delay\n          const timer = setTimeout(() => {\n            setShowIOSInstallInstructions(true);\n          }, 3000);\n          return () => clearTimeout(timer);\n        }\n      } catch {\n        // Ignore storage errors\n      }\n    }\n  }, [platform.isIOS, platform.isSafari, displayMode]);\n\n  // Prompt install action\n  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {\n    // For iOS, show instructions instead\n    if (platform.isIOS && !deferredPromptRef.current) {\n      setShowIOSInstallInstructions(true);\n      return 'unavailable';\n    }\n\n    // Check if prompt is available\n    if (!deferredPromptRef.current) {\n      return 'unavailable';\n    }\n\n    setInstall(prev => ({ ...prev, isInstalling: true }));\n\n    try {\n      // Show the install prompt\n      await deferredPromptRef.current.prompt();\n\n      // Wait for user choice\n      const { outcome } = await deferredPromptRef.current.userChoice;\n\n      setInstall(prev => ({\n        ...prev,\n        isInstalling: false,\n        installOutcome: outcome,\n        canInstall: outcome === 'dismissed',\n      }));\n\n      if (outcome === 'dismissed') {\n        markDismissed();\n      }\n\n      // Clear the prompt reference if accepted\n      if (outcome === 'accepted') {\n        deferredPromptRef.current = null;\n      }\n\n      return outcome;\n    } catch (error) {\n      console.error('Install prompt error:', error);\n      setInstall(prev => ({ ...prev, isInstalling: false }));\n      return 'unavailable';\n    }\n  }, [platform.isIOS]);\n\n  // Dismiss iOS instructions\n  const dismissIOSInstructions = useCallback(() => {\n    setShowIOSInstallInstructions(false);\n    try {\n      localStorage.setItem(STORAGE_KEYS.IOS_INSTRUCTIONS_DISMISSED, 'true');\n    } catch {\n      // Ignore storage errors\n    }\n  }, []);\n\n  // Set status bar color (for mobile browsers)\n  const setStatusBarColor = useCallback((color: string) => {\n    // Update meta theme-color\n    let metaThemeColor = document.querySelector('meta[name=\"theme-color\"]');\n    if (!metaThemeColor) {\n      metaThemeColor = document.createElement('meta');\n      metaThemeColor.setAttribute('name', 'theme-color');\n      document.head.appendChild(metaThemeColor);\n    }\n    metaThemeColor.setAttribute('content', color);\n\n    // Update Apple status bar style\n    let metaApple = document.querySelector('meta[name=\"apple-mobile-web-app-status-bar-style\"]');\n    if (!metaApple) {\n      metaApple = document.createElement('meta');\n      metaApple.setAttribute('name', 'apple-mobile-web-app-status-bar-style');\n      document.head.appendChild(metaApple);\n    }\n    // Determine if color is dark or light\n    const isLightColor = isLightHex(color);\n    metaApple.setAttribute('content', isLightColor ? 'default' : 'black-translucent');\n  }, []);\n\n  // Add shortcut\n  const addShortcut = useCallback((shortcut: PWAShortcut) => {\n    setShortcuts(prev => {\n      const exists = prev.some(s => s.url === shortcut.url);\n      if (exists) return prev;\n      const updated = [...prev, shortcut].slice(-10); // Keep max 10 shortcuts\n      saveShortcuts(updated);\n      return updated;\n    });\n  }, []);\n\n  // Remove shortcut\n  const removeShortcut = useCallback((url: string) => {\n    setShortcuts(prev => {\n      const updated = prev.filter(s => s.url !== url);\n      saveShortcuts(updated);\n      return updated;\n    });\n  }, []);\n\n  // Badge API\n  const setBadge = useCallback(async (count?: number) => {\n    if (!platform.supportsBadge) return;\n    try {\n      if (count === undefined || count === 0) {\n        await (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();\n      } else {\n        await (navigator as Navigator & { setAppBadge: (count: number) => Promise<void> }).setAppBadge(count);\n      }\n    } catch (error) {\n      console.warn('Badge API error:', error);\n    }\n  }, [platform.supportsBadge]);\n\n  const clearBadge = useCallback(async () => {\n    await setBadge(0);\n  }, [setBadge]);\n\n  // Share API\n  const canShare = useCallback((data?: ShareData): boolean => {\n    if (!platform.supportsShare) return false;\n    if (!data) return true;\n    return (navigator as NavigatorWithShare).share !== undefined;\n  }, [platform.supportsShare]);\n\n  const share = useCallback(async (data: ShareData): Promise<void> => {\n    if (!platform.supportsShare) {\n      throw new Error('Share API not supported');\n    }\n    await (navigator as NavigatorWithShare).share!(data);\n  }, [platform.supportsShare]);\n\n  return {\n    platform,\n    install,\n    network,\n    displayMode,\n    promptInstall,\n    showIOSInstallInstructions,\n    dismissIOSInstructions,\n    setStatusBarColor,\n    shortcuts,\n    addShortcut,\n    removeShortcut,\n    setBadge,\n    clearBadge,\n    canShare,\n    share,\n  };\n}\n\n/**\n * Helper to determine if a hex color is light\n */\nfunction isLightHex(hex: string): boolean {\n  const color = hex.replace('#', '');\n  const r = parseInt(color.substr(0, 2), 16);\n  const g = parseInt(color.substr(2, 2), 16);\n  const b = parseInt(color.substr(4, 2), 16);\n  // Calculate relative luminance\n  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;\n  return luminance > 0.5;\n}\n\nexport default usePWA;\n"
}

Now let me create the PWA Install Prompt component:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\components\\ui\\PWAInstallPrompt.tsx",
  "content": "import React, { useState, useCallback } from 'react';\nimport { motion, AnimatePresence } from 'framer-motion';\nimport {\n  Download,\n  X,\n  Smartphone,\n  Share,\n  Plus,\n  ChevronDown,\n  Wifi,\n  Clock,\n  Image,\n  Zap,\n} from 'lucide-react';\nimport { usePWA } from '@/hooks/usePWA';\n\n/* =============================================================================\n   PWA Install Prompt Component\n\n   Custom install prompt for iOS/Android with platform-specific instructions.\n   ============================================================================= */\n\ninterface PWAInstallPromptProps {\n  /**\n   * Whether to show the prompt automatically when available\n   * @default true\n   */\n  autoShow?: boolean;\n\n  /**\n   * Custom class name for the container\n   */\n  className?: string;\n\n  /**\n   * Callback when install is triggered\n   */\n  onInstall?: () => void;\n\n  /**\n   * Callback when prompt is dismissed\n   */\n  onDismiss?: () => void;\n}\n\n/**\n * PWA Install Prompt - Shows custom install UI for iOS and Android\n */\nexport function PWAInstallPrompt({\n  autoShow = true,\n  className,\n  onInstall,\n  onDismiss,\n}: PWAInstallPromptProps) {\n  const {\n    platform,\n    install,\n    displayMode,\n    promptInstall,\n    showIOSInstallInstructions,\n    dismissIOSInstructions,\n  } = usePWA();\n\n  const [isVisible, setIsVisible] = useState(false);\n  const [showFeatures, setShowFeatures] = useState(false);\n\n  // Determine if we should show the prompt\n  const shouldShow = autoShow && (\n    (install.canInstall && !install.isInstalled) ||\n    showIOSInstallInstructions\n  );\n\n  // Don't show if already installed or not on supported platform\n  if (displayMode !== 'browser' || install.isInstalled) {\n    return null;\n  }\n\n  // Show prompt after initial render\n  React.useEffect(() => {\n    if (shouldShow) {\n      const timer = setTimeout(() => setIsVisible(true), 500);\n      return () => clearTimeout(timer);\n    }\n  }, [shouldShow]);\n\n  const handleInstall = useCallback(async () => {\n    const outcome = await promptInstall();\n    onInstall?.();\n    if (outcome === 'accepted') {\n      setIsVisible(false);\n    }\n  }, [promptInstall, onInstall]);\n\n  const handleDismiss = useCallback(() => {\n    setIsVisible(false);\n    dismissIOSInstructions();\n    onDismiss?.();\n  }, [dismissIOSInstructions, onDismiss]);\n\n  // PWA features list\n  const features = [\n    { icon: Zap, text: 'Faster loading times' },\n    { icon: Wifi, text: 'Works offline' },\n    { icon: Image, text: 'Full screen galleries' },\n    { icon: Clock, text: 'Background sync' },\n  ];\n\n  // iOS-specific instructions\n  if (platform.isIOS && showIOSInstallInstructions) {\n    return (\n      <AnimatePresence>\n        {isVisible && (\n          <motion.div\n            initial={{ opacity: 0, y: 100 }}\n            animate={{ opacity: 1, y: 0 }}\n            exit={{ opacity: 0, y: 100 }}\n            transition={{ type: 'spring', damping: 25, stiffness: 300 }}\n            className={`fixed bottom-0 left-0 right-0 z-50 ${className || ''}`}\n          >\n            <div className=\"bg-slate-800 border-t border-slate-700 rounded-t-2xl shadow-2xl mx-auto max-w-lg\">\n              {/* Header */}\n              <div className=\"flex items-center justify-between p-4 border-b border-slate-700\">\n                <div className=\"flex items-center gap-3\">\n                  <div className=\"w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center\">\n                    <span className=\"text-xl font-bold text-white\">R</span>\n                  </div>\n                  <div>\n                    <h3 className=\"text-white font-semibold\">Install RawDrive</h3>\n                    <p className=\"text-sm text-slate-400\">Add to home screen</p>\n                  </div>\n                </div>\n                <button\n                  onClick={handleDismiss}\n                  className=\"p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700\"\n                  aria-label=\"Close\"\n                >\n                  <X className=\"w-5 h-5\" />\n                </button>\n              </div>\n\n              {/* iOS Instructions */}\n              <div className=\"p-4 space-y-4\">\n                <p className=\"text-slate-300 text-sm\">\n                  Install RawDrive on your {platform.isIOS ? 'iPhone' : 'device'} for the best experience:\n                </p>\n\n                <div className=\"space-y-3\">\n                  {/* Step 1 */}\n                  <div className=\"flex items-start gap-3\">\n                    <div className=\"w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0\">\n                      <span className=\"text-sm font-medium\">1</span>\n                    </div>\n                    <div className=\"flex-1\">\n                      <div className=\"flex items-center gap-2\">\n                        <p className=\"text-white text-sm\">\n                          Tap the <span className=\"font-semibold\">Share</span> button\n                        </p>\n                        <Share className=\"w-5 h-5 text-blue-400\" />\n                      </div>\n                      <p className=\"text-slate-400 text-xs mt-1\">\n                        At the bottom of your Safari browser\n                      </p>\n                    </div>\n                  </div>\n\n                  {/* Step 2 */}\n                  <div className=\"flex items-start gap-3\">\n                    <div className=\"w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0\">\n                      <span className=\"text-sm font-medium\">2</span>\n                    </div>\n                    <div className=\"flex-1\">\n                      <div className=\"flex items-center gap-2\">\n                        <p className=\"text-white text-sm\">\n                          Scroll and tap <span className=\"font-semibold\">\"Add to Home Screen\"</span>\n                        </p>\n                        <Plus className=\"w-5 h-5 text-blue-400\" />\n                      </div>\n                    </div>\n                  </div>\n\n                  {/* Step 3 */}\n                  <div className=\"flex items-start gap-3\">\n                    <div className=\"w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0\">\n                      <span className=\"text-sm font-medium\">3</span>\n                    </div>\n                    <div className=\"flex-1\">\n                      <p className=\"text-white text-sm\">\n                        Tap <span className=\"font-semibold\">\"Add\"</span> in the top right\n                      </p>\n                    </div>\n                  </div>\n                </div>\n\n                {/* Features collapsible */}\n                <button\n                  onClick={() => setShowFeatures(!showFeatures)}\n                  className=\"w-full flex items-center justify-between text-slate-400 text-sm py-2\"\n                >\n                  <span>Why install?</span>\n                  <ChevronDown\n                    className={`w-4 h-4 transition-transform ${showFeatures ? 'rotate-180' : ''}`}\n                  />\n                </button>\n\n                <AnimatePresence>\n                  {showFeatures && (\n                    <motion.div\n                      initial={{ height: 0, opacity: 0 }}\n                      animate={{ height: 'auto', opacity: 1 }}\n                      exit={{ height: 0, opacity: 0 }}\n                      className=\"overflow-hidden\"\n                    >\n                      <div className=\"grid grid-cols-2 gap-2 pb-2\">\n                        {features.map(({ icon: Icon, text }) => (\n                          <div\n                            key={text}\n                            className=\"flex items-center gap-2 text-xs text-slate-400 bg-slate-700/50 rounded-lg px-3 py-2\"\n                          >\n                            <Icon className=\"w-4 h-4 text-blue-400\" />\n                            {text}\n                          </div>\n                        ))}\n                      </div>\n                    </motion.div>\n                  )}\n                </AnimatePresence>\n              </div>\n\n              {/* Arrow pointing to share button */}\n              <div className=\"relative pb-8\">\n                <motion.div\n                  animate={{ y: [0, 5, 0] }}\n                  transition={{ duration: 1.5, repeat: Infinity }}\n                  className=\"absolute bottom-2 left-1/2 -translate-x-1/2\"\n                >\n                  <ChevronDown className=\"w-6 h-6 text-blue-400\" />\n                </motion.div>\n              </div>\n            </div>\n          </motion.div>\n        )}\n      </AnimatePresence>\n    );\n  }\n\n  // Android/Chrome install prompt\n  if (install.canInstall && !platform.isIOS) {\n    return (\n      <AnimatePresence>\n        {isVisible && (\n          <motion.div\n            initial={{ opacity: 0, y: 100 }}\n            animate={{ opacity: 1, y: 0 }}\n            exit={{ opacity: 0, y: 100 }}\n            transition={{ type: 'spring', damping: 25, stiffness: 300 }}\n            className={`fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm ${className || ''}`}\n          >\n            <div className=\"bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden\">\n              {/* Header */}\n              <div className=\"flex items-center gap-3 p-4\">\n                <div className=\"w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0\">\n                  <span className=\"text-xl font-bold text-white\">R</span>\n                </div>\n                <div className=\"flex-1 min-w-0\">\n                  <h3 className=\"text-white font-semibold\">Install RawDrive</h3>\n                  <p className=\"text-sm text-slate-400 truncate\">\n                    Get the full app experience\n                  </p>\n                </div>\n                <button\n                  onClick={handleDismiss}\n                  className=\"p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700 shrink-0\"\n                  aria-label=\"Close\"\n                >\n                  <X className=\"w-5 h-5\" />\n                </button>\n              </div>\n\n              {/* Features */}\n              <div className=\"px-4 pb-4 space-y-3\">\n                <div className=\"grid grid-cols-2 gap-2\">\n                  {features.map(({ icon: Icon, text }) => (\n                    <div\n                      key={text}\n                      className=\"flex items-center gap-2 text-xs text-slate-400 bg-slate-700/50 rounded-lg px-3 py-2\"\n                    >\n                      <Icon className=\"w-4 h-4 text-blue-400 shrink-0\" />\n                      <span className=\"truncate\">{text}</span>\n                    </div>\n                  ))}\n                </div>\n\n                {/* Actions */}\n                <div className=\"flex gap-2 pt-2\">\n                  <button\n                    onClick={handleDismiss}\n                    className=\"flex-1 px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-colors\"\n                  >\n                    Not now\n                  </button>\n                  <button\n                    onClick={handleInstall}\n                    disabled={install.isInstalling}\n                    className=\"flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors\"\n                  >\n                    {install.isInstalling ? (\n                      <>\n                        <span className=\"w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin\" />\n                        Installing...\n                      </>\n                    ) : (\n                      <>\n                        <Download className=\"w-4 h-4\" />\n                        Install\n                      </>\n                    )}\n                  </button>\n                </div>\n              </div>\n            </div>\n          </motion.div>\n        )}\n      </AnimatePresence>\n    );\n  }\n\n  return null;\n}\n\n/* =============================================================================\n   Mini Install Banner - Compact banner for header/footer placement\n   ============================================================================= */\n\ninterface PWAInstallBannerProps {\n  className?: string;\n  onInstall?: () => void;\n  onDismiss?: () => void;\n}\n\nexport function PWAInstallBanner({\n  className,\n  onInstall,\n  onDismiss,\n}: PWAInstallBannerProps) {\n  const {\n    platform,\n    install,\n    displayMode,\n    promptInstall,\n    showIOSInstallInstructions,\n    dismissIOSInstructions,\n  } = usePWA();\n\n  const [dismissed, setDismissed] = useState(false);\n\n  // Don't show if already installed or dismissed\n  if (\n    dismissed ||\n    displayMode !== 'browser' ||\n    install.isInstalled ||\n    (!install.canInstall && !showIOSInstallInstructions && !platform.isIOS)\n  ) {\n    return null;\n  }\n\n  const handleInstall = async () => {\n    if (platform.isIOS) {\n      // iOS doesn't support programmatic install, but we can trigger the modal\n      dismissIOSInstructions();\n    } else {\n      await promptInstall();\n    }\n    onInstall?.();\n  };\n\n  const handleDismiss = () => {\n    setDismissed(true);\n    dismissIOSInstructions();\n    onDismiss?.();\n  };\n\n  return (\n    <AnimatePresence>\n      <motion.div\n        initial={{ opacity: 0, height: 0 }}\n        animate={{ opacity: 1, height: 'auto' }}\n        exit={{ opacity: 0, height: 0 }}\n        className={`bg-gradient-to-r from-blue-600 to-purple-600 ${className || ''}`}\n      >\n        <div className=\"flex items-center justify-between px-4 py-2 max-w-7xl mx-auto\">\n          <div className=\"flex items-center gap-2 text-white text-sm\">\n            <Smartphone className=\"w-4 h-4\" />\n            <span className=\"hidden sm:inline\">Install RawDrive for faster access and offline support</span>\n            <span className=\"sm:hidden\">Install RawDrive app</span>\n          </div>\n          <div className=\"flex items-center gap-2\">\n            <button\n              onClick={handleInstall}\n              className=\"px-3 py-1 text-sm font-medium text-blue-600 bg-white hover:bg-blue-50 rounded-full transition-colors\"\n            >\n              Install\n            </button>\n            <button\n              onClick={handleDismiss}\n              className=\"p-1 text-white/70 hover:text-white transition-colors\"\n              aria-label=\"Dismiss\"\n            >\n              <X className=\"w-4 h-4\" />\n            </button>\n          </div>\n        </div>\n      </motion.div>\n    </AnimatePresence>\n  );\n}\n\nexport default PWAInstallPrompt;\n"
}

Now let me create the touch gestures hook for enhanced gallery viewing:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\useGalleryGestures.ts",
  "content": "import { useCallback, useRef, useState, useEffect } from 'react';\nimport { useGesture } from '@use-gesture/react';\n\n/* =============================================================================\n   Gallery Gestures Hook\n\n   Enhanced touch gesture support for gallery viewing including:\n   - Pinch-to-zoom with momentum\n   - Swipe navigation between images\n   - Double-tap to zoom\n   - Pan when zoomed\n   - Pull-to-refresh\n   - Edge swipe to go back\n   ============================================================================= */\n\n/**\n * Gesture state for the gallery\n */\nexport interface GestureState {\n  zoom: number;\n  pan: { x: number; y: number };\n  isDragging: boolean;\n  isPinching: boolean;\n  isAnimating: boolean;\n  velocity: { x: number; y: number };\n}\n\n/**\n * Configuration options for gallery gestures\n */\nexport interface UseGalleryGesturesOptions {\n  /**\n   * Whether gestures are enabled\n   * @default true\n   */\n  enabled?: boolean;\n\n  /**\n   * Minimum zoom level\n   * @default 1\n   */\n  minZoom?: number;\n\n  /**\n   * Maximum zoom level\n   * @default 5\n   */\n  maxZoom?: number;\n\n  /**\n   * Double-tap zoom level\n   * @default 2\n   */\n  doubleTapZoom?: number;\n\n  /**\n   * Swipe threshold in pixels\n   * @default 50\n   */\n  swipeThreshold?: number;\n\n  /**\n   * Swipe velocity threshold\n   * @default 0.5\n   */\n  swipeVelocity?: number;\n\n  /**\n   * Enable edge swipe to navigate back\n   * @default true\n   */\n  enableEdgeSwipe?: boolean;\n\n  /**\n   * Edge swipe threshold in pixels\n   * @default 20\n   */\n  edgeSwipeThreshold?: number;\n\n  /**\n   * Enable pull-to-refresh gesture\n   * @default false\n   */\n  enablePullToRefresh?: boolean;\n\n  /**\n   * Pull distance to trigger refresh\n   * @default 100\n   */\n  pullToRefreshThreshold?: number;\n\n  /**\n   * Callback when navigating to previous item\n   */\n  onPrevious?: () => void;\n\n  /**\n   * Callback when navigating to next item\n   */\n  onNext?: () => void;\n\n  /**\n   * Callback when pull-to-refresh is triggered\n   */\n  onRefresh?: () => Promise<void>;\n\n  /**\n   * Callback when edge swipe back is triggered\n   */\n  onEdgeSwipeBack?: () => void;\n\n  /**\n   * Callback when zoom changes\n   */\n  onZoomChange?: (zoom: number) => void;\n\n  /**\n   * Callback when pan changes\n   */\n  onPanChange?: (pan: { x: number; y: number }) => void;\n\n  /**\n   * Reference to the container element\n   */\n  containerRef?: React.RefObject<HTMLElement>;\n\n  /**\n   * Whether there's a previous item\n   */\n  hasPrevious?: boolean;\n\n  /**\n   * Whether there's a next item\n   */\n  hasNext?: boolean;\n\n  /**\n   * Image dimensions for pan boundary calculation\n   */\n  imageDimensions?: {\n    width: number;\n    height: number;\n  };\n}\n\n/**\n * Return type for useGalleryGestures hook\n */\nexport interface UseGalleryGesturesReturn {\n  /**\n   * Current gesture state\n   */\n  state: GestureState;\n\n  /**\n   * Bind props to apply to the target element\n   */\n  bind: ReturnType<typeof useGesture>;\n\n  /**\n   * Reset zoom and pan to default\n   */\n  resetTransform: () => void;\n\n  /**\n   * Set zoom level programmatically\n   */\n  setZoom: (zoom: number) => void;\n\n  /**\n   * Set pan position programmatically\n   */\n  setPan: (pan: { x: number; y: number }) => void;\n\n  /**\n   * Zoom to a specific point\n   */\n  zoomToPoint: (zoom: number, point: { x: number; y: number }) => void;\n\n  /**\n   * Whether currently zoomed in\n   */\n  isZoomed: boolean;\n\n  /**\n   * Pull-to-refresh state\n   */\n  pullToRefresh: {\n    isPulling: boolean;\n    isRefreshing: boolean;\n    pullProgress: number;\n  };\n}\n\n/**\n * Default state\n */\nconst DEFAULT_STATE: GestureState = {\n  zoom: 1,\n  pan: { x: 0, y: 0 },\n  isDragging: false,\n  isPinching: false,\n  isAnimating: false,\n  velocity: { x: 0, y: 0 },\n};\n\n/**\n * Clamp a value between min and max\n */\nfunction clamp(value: number, min: number, max: number): number {\n  return Math.min(Math.max(value, min), max);\n}\n\n/**\n * Calculate pan boundaries based on zoom level and container/image dimensions\n */\nfunction calculatePanBoundaries(\n  zoom: number,\n  containerWidth: number,\n  containerHeight: number,\n  imageWidth?: number,\n  imageHeight?: number\n): { minX: number; maxX: number; minY: number; maxY: number } {\n  // If image dimensions are provided, use them\n  const effectiveWidth = imageWidth || containerWidth;\n  const effectiveHeight = imageHeight || containerHeight;\n\n  // Calculate the extra space when zoomed\n  const extraWidth = (effectiveWidth * zoom - containerWidth) / 2;\n  const extraHeight = (effectiveHeight * zoom - containerHeight) / 2;\n\n  return {\n    minX: -Math.max(0, extraWidth),\n    maxX: Math.max(0, extraWidth),\n    minY: -Math.max(0, extraHeight),\n    maxY: Math.max(0, extraHeight),\n  };\n}\n\n/**\n * Gallery Gestures Hook\n */\nexport function useGalleryGestures(options: UseGalleryGesturesOptions = {}): UseGalleryGesturesReturn {\n  const {\n    enabled = true,\n    minZoom = 1,\n    maxZoom = 5,\n    doubleTapZoom = 2,\n    swipeThreshold = 50,\n    swipeVelocity = 0.5,\n    enableEdgeSwipe = true,\n    edgeSwipeThreshold = 20,\n    enablePullToRefresh = false,\n    pullToRefreshThreshold = 100,\n    onPrevious,\n    onNext,\n    onRefresh,\n    onEdgeSwipeBack,\n    onZoomChange,\n    onPanChange,\n    containerRef,\n    hasPrevious = true,\n    hasNext = true,\n    imageDimensions,\n  } = options;\n\n  // State\n  const [state, setState] = useState<GestureState>(DEFAULT_STATE);\n  const [pullToRefreshState, setPullToRefreshState] = useState({\n    isPulling: false,\n    isRefreshing: false,\n    pullProgress: 0,\n  });\n\n  // Refs for gesture handling\n  const lastTapTimeRef = useRef(0);\n  const lastTapPositionRef = useRef({ x: 0, y: 0 });\n  const startPositionRef = useRef({ x: 0, y: 0 });\n  const isEdgeSwipeRef = useRef(false);\n  const isPullStartRef = useRef(false);\n\n  // Reset transform\n  const resetTransform = useCallback(() => {\n    setState({\n      ...DEFAULT_STATE,\n      isAnimating: true,\n    });\n    onZoomChange?.(1);\n    onPanChange?.({ x: 0, y: 0 });\n\n    // Clear animating flag\n    setTimeout(() => {\n      setState(prev => ({ ...prev, isAnimating: false }));\n    }, 300);\n  }, [onZoomChange, onPanChange]);\n\n  // Set zoom level\n  const setZoom = useCallback((newZoom: number) => {\n    const clampedZoom = clamp(newZoom, minZoom, maxZoom);\n    setState(prev => ({\n      ...prev,\n      zoom: clampedZoom,\n      // Reset pan if zooming out to min\n      pan: clampedZoom === minZoom ? { x: 0, y: 0 } : prev.pan,\n    }));\n    onZoomChange?.(clampedZoom);\n  }, [minZoom, maxZoom, onZoomChange]);\n\n  // Set pan position\n  const setPan = useCallback((newPan: { x: number; y: number }) => {\n    setState(prev => ({\n      ...prev,\n      pan: newPan,\n    }));\n    onPanChange?.(newPan);\n  }, [onPanChange]);\n\n  // Zoom to a specific point\n  const zoomToPoint = useCallback((newZoom: number, point: { x: number; y: number }) => {\n    const clampedZoom = clamp(newZoom, minZoom, maxZoom);\n\n    setState(prev => {\n      // Calculate new pan to keep the point centered\n      const zoomDelta = clampedZoom / prev.zoom;\n      const newPan = {\n        x: point.x - (point.x - prev.pan.x) * zoomDelta,\n        y: point.y - (point.y - prev.pan.y) * zoomDelta,\n      };\n\n      return {\n        ...prev,\n        zoom: clampedZoom,\n        pan: clampedZoom === minZoom ? { x: 0, y: 0 } : newPan,\n        isAnimating: true,\n      };\n    });\n\n    onZoomChange?.(clampedZoom);\n\n    // Clear animating flag\n    setTimeout(() => {\n      setState(prev => ({ ...prev, isAnimating: false }));\n    }, 300);\n  }, [minZoom, maxZoom, onZoomChange]);\n\n  // Gesture bindings\n  const bind = useGesture(\n    {\n      // Drag gesture (pan when zoomed, swipe when not)\n      onDrag: ({ offset: [ox, oy], velocity: [vx, vy], direction: [dx, dy], first, last, cancel, memo, event }) => {\n        if (!enabled) return;\n\n        // Get container dimensions\n        const container = containerRef?.current;\n        const containerWidth = container?.clientWidth || window.innerWidth;\n        const containerHeight = container?.clientHeight || window.innerHeight;\n\n        // On first touch\n        if (first) {\n          startPositionRef.current = { x: event instanceof TouchEvent ? event.touches[0].clientX : (event as MouseEvent).clientX, y: event instanceof TouchEvent ? event.touches[0].clientY : (event as MouseEvent).clientY };\n          isEdgeSwipeRef.current = enableEdgeSwipe && startPositionRef.current.x < edgeSwipeThreshold;\n          isPullStartRef.current = enablePullToRefresh && startPositionRef.current.y < 50 && state.zoom === 1;\n\n          setState(prev => ({ ...prev, isDragging: true }));\n        }\n\n        // Edge swipe handling\n        if (isEdgeSwipeRef.current && dx > 0 && vx > swipeVelocity) {\n          onEdgeSwipeBack?.();\n          cancel();\n          return;\n        }\n\n        // Pull-to-refresh handling\n        if (isPullStartRef.current && dy > 0 && state.zoom === 1) {\n          const pullDistance = Math.max(0, oy);\n          setPullToRefreshState({\n            isPulling: pullDistance > 0,\n            isRefreshing: false,\n            pullProgress: Math.min(pullDistance / pullToRefreshThreshold, 1),\n          });\n\n          if (last && pullDistance >= pullToRefreshThreshold) {\n            setPullToRefreshState(prev => ({ ...prev, isRefreshing: true }));\n            onRefresh?.().finally(() => {\n              setPullToRefreshState({ isPulling: false, isRefreshing: false, pullProgress: 0 });\n            });\n          } else if (last) {\n            setPullToRefreshState({ isPulling: false, isRefreshing: false, pullProgress: 0 });\n          }\n          return;\n        }\n\n        // If zoomed, handle panning\n        if (state.zoom > 1) {\n          const boundaries = calculatePanBoundaries(\n            state.zoom,\n            containerWidth,\n            containerHeight,\n            imageDimensions?.width,\n            imageDimensions?.height\n          );\n\n          const newPan = {\n            x: clamp(ox, boundaries.minX, boundaries.maxX),\n            y: clamp(oy, boundaries.minY, boundaries.maxY),\n          };\n\n          setState(prev => ({\n            ...prev,\n            pan: newPan,\n            velocity: { x: vx, y: vy },\n          }));\n\n          onPanChange?.(newPan);\n\n          if (last) {\n            setState(prev => ({ ...prev, isDragging: false }));\n          }\n\n          return memo ?? state.pan;\n        }\n\n        // Not zoomed - handle swipe navigation\n        if (last) {\n          setState(prev => ({ ...prev, isDragging: false }));\n\n          // Check for swipe\n          const isSwipe = Math.abs(ox) > swipeThreshold || Math.abs(vx) > swipeVelocity;\n\n          if (isSwipe && Math.abs(dx) > Math.abs(dy)) {\n            if (dx < 0 && hasNext) {\n              onNext?.();\n            } else if (dx > 0 && hasPrevious) {\n              onPrevious?.();\n            }\n          }\n        }\n\n        return memo;\n      },\n\n      // Pinch gesture (zoom)\n      onPinch: ({ offset: [scale], origin: [ox, oy], first, last }) => {\n        if (!enabled) return;\n\n        if (first) {\n          setState(prev => ({ ...prev, isPinching: true }));\n        }\n\n        const newZoom = clamp(scale, minZoom, maxZoom);\n\n        // Get container position for origin calculation\n        const container = containerRef?.current;\n        const rect = container?.getBoundingClientRect();\n        const centerX = (ox - (rect?.left || 0)) - (rect?.width || window.innerWidth) / 2;\n        const centerY = (oy - (rect?.top || 0)) - (rect?.height || window.innerHeight) / 2;\n\n        setState(prev => {\n          // Calculate pan adjustment to zoom toward pinch point\n          const zoomDelta = newZoom / prev.zoom;\n          const newPan = {\n            x: centerX - (centerX - prev.pan.x) * zoomDelta,\n            y: centerY - (centerY - prev.pan.y) * zoomDelta,\n          };\n\n          return {\n            ...prev,\n            zoom: newZoom,\n            pan: newZoom === minZoom ? { x: 0, y: 0 } : newPan,\n          };\n        });\n\n        onZoomChange?.(newZoom);\n\n        if (last) {\n          setState(prev => ({ ...prev, isPinching: false }));\n\n          // Snap to min zoom if close\n          if (newZoom < minZoom + 0.1) {\n            setState(prev => ({\n              ...prev,\n              zoom: minZoom,\n              pan: { x: 0, y: 0 },\n              isAnimating: true,\n            }));\n            onZoomChange?.(minZoom);\n            onPanChange?.({ x: 0, y: 0 });\n\n            setTimeout(() => {\n              setState(prev => ({ ...prev, isAnimating: false }));\n            }, 300);\n          }\n        }\n      },\n\n      // Wheel gesture (zoom with mouse wheel)\n      onWheel: ({ event, delta: [, dy], ctrlKey }) => {\n        if (!enabled) return;\n\n        // Only zoom on ctrl+wheel (trackpad pinch) or shift+wheel\n        if (!ctrlKey && !event.shiftKey) return;\n\n        event.preventDefault();\n\n        const zoomDelta = -dy * 0.01;\n        const newZoom = clamp(state.zoom + zoomDelta, minZoom, maxZoom);\n\n        // Get pointer position for zoom origin\n        const container = containerRef?.current;\n        const rect = container?.getBoundingClientRect();\n        const centerX = event.clientX - (rect?.left || 0) - (rect?.width || window.innerWidth) / 2;\n        const centerY = event.clientY - (rect?.top || 0) - (rect?.height || window.innerHeight) / 2;\n\n        setState(prev => {\n          const zoomRatio = newZoom / prev.zoom;\n          const newPan = {\n            x: centerX - (centerX - prev.pan.x) * zoomRatio,\n            y: centerY - (centerY - prev.pan.y) * zoomRatio,\n          };\n\n          return {\n            ...prev,\n            zoom: newZoom,\n            pan: newZoom === minZoom ? { x: 0, y: 0 } : newPan,\n          };\n        });\n\n        onZoomChange?.(newZoom);\n      },\n    },\n    {\n      target: containerRef,\n      drag: {\n        from: () => [state.pan.x, state.pan.y],\n        bounds: state.zoom > 1 ? undefined : { left: -100, right: 100, top: -50, bottom: 50 },\n        rubberband: true,\n        filterTaps: true,\n        threshold: 10,\n      },\n      pinch: {\n        scaleBounds: { min: minZoom, max: maxZoom },\n        rubberband: true,\n      },\n      wheel: {\n        eventOptions: { passive: false },\n      },\n    }\n  );\n\n  // Double-tap handling (separate from drag/pinch)\n  useEffect(() => {\n    if (!enabled) return;\n\n    const container = containerRef?.current;\n    if (!container) return;\n\n    const handleDoubleTap = (event: TouchEvent | MouseEvent) => {\n      const now = Date.now();\n      const timeDelta = now - lastTapTimeRef.current;\n\n      const clientX = event instanceof TouchEvent ? event.touches[0]?.clientX || event.changedTouches[0]?.clientX : event.clientX;\n      const clientY = event instanceof TouchEvent ? event.touches[0]?.clientY || event.changedTouches[0]?.clientY : event.clientY;\n\n      const distanceX = Math.abs(clientX - lastTapPositionRef.current.x);\n      const distanceY = Math.abs(clientY - lastTapPositionRef.current.y);\n\n      // Check for double tap (within 300ms and 50px)\n      if (timeDelta < 300 && distanceX < 50 && distanceY < 50) {\n        event.preventDefault();\n\n        const rect = container.getBoundingClientRect();\n        const point = {\n          x: clientX - rect.left - rect.width / 2,\n          y: clientY - rect.top - rect.height / 2,\n        };\n\n        // Toggle between min zoom and double-tap zoom\n        if (state.zoom > minZoom + 0.1) {\n          resetTransform();\n        } else {\n          zoomToPoint(doubleTapZoom, point);\n        }\n\n        lastTapTimeRef.current = 0;\n      } else {\n        lastTapTimeRef.current = now;\n        lastTapPositionRef.current = { x: clientX, y: clientY };\n      }\n    };\n\n    container.addEventListener('touchend', handleDoubleTap, { passive: false });\n    container.addEventListener('dblclick', handleDoubleTap);\n\n    return () => {\n      container.removeEventListener('touchend', handleDoubleTap);\n      container.removeEventListener('dblclick', handleDoubleTap);\n    };\n  }, [enabled, containerRef, state.zoom, minZoom, doubleTapZoom, resetTransform, zoomToPoint]);\n\n  return {\n    state,\n    bind,\n    resetTransform,\n    setZoom,\n    setPan,\n    zoomToPoint,\n    isZoomed: state.zoom > minZoom + 0.1,\n    pullToRefresh: pullToRefreshState,\n  };\n}\n\nexport default useGalleryGestures;\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore existing PWA and ServiceWorker infrastructure",
      "status": "completed",
      "activeForm": "Exploring existing PWA and ServiceWorker infrastructure"
    },
    {
      "content": "Implement iOS/Android app install prompts with custom icons",
      "status": "completed",
      "activeForm": "Implementing iOS/Android app install prompts with custom icons"
    },
    {
      "content": "Add touch gesture support (pinch-zoom, swipe navigation)",
      "status": "completed",
      "activeForm": "Adding touch gesture support"
    },
    {
      "content": "Implement native status bar integration",
      "status": "in_progress",
      "activeForm": "Implementing native status bar integration"
    },
    {
      "content": "Add offline support for cached galleries",
      "status": "pending",
      "activeForm": "Adding offline support for cached galleries"
    },
    {
      "content": "Implement home screen shortcuts for frequent galleries",
      "status": "pending",
      "activeForm": "Implementing home screen shortcuts for frequent galleries"
    }
  ]
}

Now let me create the PWAProvider context that will manage status bar integration and provide PWA context across the app:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\contexts\\PWAContext.tsx",
  "content": "import React, { createContext, useContext, useEffect, useMemo, useCallback } from 'react';\nimport { usePWA, UsePWAReturn } from '@/hooks/usePWA';\nimport { useTheme } from '@/hooks';\n\n/* =============================================================================\n   PWA Context Provider\n\n   Provides PWA functionality across the application with theme-aware status bar\n   integration and centralized PWA state management.\n   ============================================================================= */\n\n/**\n * PWA Context type - extends UsePWAReturn with additional functionality\n */\ninterface PWAContextType extends UsePWAReturn {\n  /**\n   * Update status bar to match current theme\n   */\n  syncStatusBarWithTheme: () => void;\n\n  /**\n   * Force dark status bar\n   */\n  setDarkStatusBar: () => void;\n\n  /**\n   * Force light status bar\n   */\n  setLightStatusBar: () => void;\n\n  /**\n   * Set status bar for immersive gallery viewing\n   */\n  setImmersiveStatusBar: () => void;\n\n  /**\n   * Vibrate the device (haptic feedback)\n   */\n  vibrate: (pattern?: number | number[]) => void;\n\n  /**\n   * Wake lock to prevent screen sleep during gallery viewing\n   */\n  requestWakeLock: () => Promise<void>;\n  releaseWakeLock: () => Promise<void>;\n  isWakeLocked: boolean;\n}\n\nconst PWAContext = createContext<PWAContextType | undefined>(undefined);\n\n/**\n * Status bar colors for different themes\n */\nconst STATUS_BAR_COLORS = {\n  light: '#FFFFFF',\n  dark: '#0F172A', // slate-900\n  immersive: '#000000',\n  gallery: '#000000',\n} as const;\n\n/**\n * PWA Provider Props\n */\ninterface PWAProviderProps {\n  children: React.ReactNode;\n}\n\n/**\n * PWA Provider - Wraps the application with PWA context\n */\nexport function PWAProvider({ children }: PWAProviderProps) {\n  const pwa = usePWA({\n    onInstallAvailable: () => {\n      console.log('[PWA] Install prompt available');\n    },\n    onInstalled: () => {\n      console.log('[PWA] App installed successfully');\n    },\n    onNetworkChange: (online) => {\n      console.log(`[PWA] Network status: ${online ? 'online' : 'offline'}`);\n    },\n    onDisplayModeChange: (mode) => {\n      console.log(`[PWA] Display mode: ${mode}`);\n    },\n  });\n\n  const { resolvedTheme } = useTheme();\n\n  // Wake lock state\n  const [wakeLock, setWakeLock] = React.useState<WakeLockSentinel | null>(null);\n  const isWakeLocked = wakeLock !== null;\n\n  // Sync status bar with current theme\n  const syncStatusBarWithTheme = useCallback(() => {\n    const color = resolvedTheme === 'dark' ? STATUS_BAR_COLORS.dark : STATUS_BAR_COLORS.light;\n    pwa.setStatusBarColor(color);\n  }, [resolvedTheme, pwa]);\n\n  // Set dark status bar\n  const setDarkStatusBar = useCallback(() => {\n    pwa.setStatusBarColor(STATUS_BAR_COLORS.dark);\n  }, [pwa]);\n\n  // Set light status bar\n  const setLightStatusBar = useCallback(() => {\n    pwa.setStatusBarColor(STATUS_BAR_COLORS.light);\n  }, [pwa]);\n\n  // Set immersive status bar (for gallery fullscreen)\n  const setImmersiveStatusBar = useCallback(() => {\n    pwa.setStatusBarColor(STATUS_BAR_COLORS.immersive);\n  }, [pwa]);\n\n  // Vibrate device\n  const vibrate = useCallback((pattern: number | number[] = 50) => {\n    if ('vibrate' in navigator) {\n      navigator.vibrate(pattern);\n    }\n  }, []);\n\n  // Wake lock to prevent screen sleep\n  const requestWakeLock = useCallback(async () => {\n    if (!('wakeLock' in navigator)) {\n      console.warn('[PWA] Wake Lock API not supported');\n      return;\n    }\n\n    try {\n      const lock = await (navigator as Navigator & { wakeLock: { request: (type: 'screen') => Promise<WakeLockSentinel> } }).wakeLock.request('screen');\n      setWakeLock(lock);\n      console.log('[PWA] Wake lock acquired');\n\n      // Handle visibility change\n      lock.addEventListener('release', () => {\n        setWakeLock(null);\n        console.log('[PWA] Wake lock released');\n      });\n    } catch (error) {\n      console.warn('[PWA] Wake lock request failed:', error);\n    }\n  }, []);\n\n  const releaseWakeLock = useCallback(async () => {\n    if (wakeLock) {\n      await wakeLock.release();\n      setWakeLock(null);\n    }\n  }, [wakeLock]);\n\n  // Sync status bar color with theme on mount and theme change\n  useEffect(() => {\n    // Only sync if in standalone mode (installed PWA)\n    if (pwa.displayMode !== 'browser') {\n      syncStatusBarWithTheme();\n    }\n  }, [resolvedTheme, pwa.displayMode, syncStatusBarWithTheme]);\n\n  // Re-acquire wake lock when visibility changes back\n  useEffect(() => {\n    const handleVisibilityChange = async () => {\n      if (document.visibilityState === 'visible' && isWakeLocked) {\n        // Wake lock was released when page became invisible, re-acquire\n        if (!wakeLock) {\n          await requestWakeLock();\n        }\n      }\n    };\n\n    document.addEventListener('visibilitychange', handleVisibilityChange);\n    return () => {\n      document.removeEventListener('visibilitychange', handleVisibilityChange);\n    };\n  }, [isWakeLocked, wakeLock, requestWakeLock]);\n\n  // Set up mobile-specific meta tags on mount\n  useEffect(() => {\n    // Ensure viewport meta tag is set correctly for mobile\n    let viewportMeta = document.querySelector('meta[name=\"viewport\"]');\n    if (!viewportMeta) {\n      viewportMeta = document.createElement('meta');\n      viewportMeta.setAttribute('name', 'viewport');\n      document.head.appendChild(viewportMeta);\n    }\n    viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');\n\n    // Apple-specific meta tags for iOS PWA\n    if (pwa.platform.isIOS) {\n      // Apple mobile web app capable\n      let appleMeta = document.querySelector('meta[name=\"apple-mobile-web-app-capable\"]');\n      if (!appleMeta) {\n        appleMeta = document.createElement('meta');\n        appleMeta.setAttribute('name', 'apple-mobile-web-app-capable');\n        document.head.appendChild(appleMeta);\n      }\n      appleMeta.setAttribute('content', 'yes');\n\n      // Apple mobile web app status bar style\n      let appleStatusMeta = document.querySelector('meta[name=\"apple-mobile-web-app-status-bar-style\"]');\n      if (!appleStatusMeta) {\n        appleStatusMeta = document.createElement('meta');\n        appleStatusMeta.setAttribute('name', 'apple-mobile-web-app-status-bar-style');\n        document.head.appendChild(appleStatusMeta);\n      }\n      appleStatusMeta.setAttribute('content', resolvedTheme === 'dark' ? 'black-translucent' : 'default');\n\n      // Apple mobile web app title\n      let appleTitleMeta = document.querySelector('meta[name=\"apple-mobile-web-app-title\"]');\n      if (!appleTitleMeta) {\n        appleTitleMeta = document.createElement('meta');\n        appleTitleMeta.setAttribute('name', 'apple-mobile-web-app-title');\n        document.head.appendChild(appleTitleMeta);\n      }\n      appleTitleMeta.setAttribute('content', 'RawDrive');\n    }\n\n    // Android-specific meta tags\n    if (pwa.platform.isAndroid) {\n      // Mobile web app capable\n      let mobileMeta = document.querySelector('meta[name=\"mobile-web-app-capable\"]');\n      if (!mobileMeta) {\n        mobileMeta = document.createElement('meta');\n        mobileMeta.setAttribute('name', 'mobile-web-app-capable');\n        document.head.appendChild(mobileMeta);\n      }\n      mobileMeta.setAttribute('content', 'yes');\n    }\n\n    // Format detection to prevent auto-formatting of phone numbers, etc.\n    let formatMeta = document.querySelector('meta[name=\"format-detection\"]');\n    if (!formatMeta) {\n      formatMeta = document.createElement('meta');\n      formatMeta.setAttribute('name', 'format-detection');\n      document.head.appendChild(formatMeta);\n    }\n    formatMeta.setAttribute('content', 'telephone=no');\n\n    // MS Application meta tags for Windows\n    let msTileMeta = document.querySelector('meta[name=\"msapplication-TileColor\"]');\n    if (!msTileMeta) {\n      msTileMeta = document.createElement('meta');\n      msTileMeta.setAttribute('name', 'msapplication-TileColor');\n      document.head.appendChild(msTileMeta);\n    }\n    msTileMeta.setAttribute('content', STATUS_BAR_COLORS.dark);\n\n  }, [pwa.platform.isIOS, pwa.platform.isAndroid, resolvedTheme]);\n\n  // Memoize context value\n  const value = useMemo<PWAContextType>(() => ({\n    ...pwa,\n    syncStatusBarWithTheme,\n    setDarkStatusBar,\n    setLightStatusBar,\n    setImmersiveStatusBar,\n    vibrate,\n    requestWakeLock,\n    releaseWakeLock,\n    isWakeLocked,\n  }), [\n    pwa,\n    syncStatusBarWithTheme,\n    setDarkStatusBar,\n    setLightStatusBar,\n    setImmersiveStatusBar,\n    vibrate,\n    requestWakeLock,\n    releaseWakeLock,\n    isWakeLocked,\n  ]);\n\n  return (\n    <PWAContext.Provider value={value}>\n      {children}\n    </PWAContext.Provider>\n  );\n}\n\n/**\n * Hook to access PWA context\n */\nexport function usePWAContext(): PWAContextType {\n  const context = useContext(PWAContext);\n  if (!context) {\n    throw new Error('usePWAContext must be used within a PWAProvider');\n  }\n  return context;\n}\n\n/**\n * Wake Lock Sentinel interface\n */\ninterface WakeLockSentinel extends EventTarget {\n  readonly released: boolean;\n  readonly type: 'screen';\n  release(): Promise<void>;\n}\n\nexport default PWAProvider;\n"
}

Now let me create the offline gallery cache hook:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\useOfflineGallery.ts",
  "content": "import { useState, useEffect, useCallback, useMemo } from 'react';\n\n/* =============================================================================\n   Offline Gallery Hook\n\n   Manages offline caching of galleries for PWA offline support.\n   Uses IndexedDB for structured data and Cache API for assets.\n   ============================================================================= */\n\n/**\n * Cached gallery metadata\n */\nexport interface CachedGallery {\n  id: string;\n  slug: string;\n  name: string;\n  description?: string;\n  coverImageUrl?: string;\n  thumbnailUrl?: string;\n  assetCount: number;\n  cachedAt: number;\n  lastAccessedAt: number;\n  syncedAssets: number;\n  totalSize: number;\n  workspaceId?: string;\n  workspaceName?: string;\n}\n\n/**\n * Cached asset metadata\n */\nexport interface CachedAsset {\n  id: string;\n  galleryId: string;\n  thumbnailUrl: string;\n  previewUrl?: string;\n  originalUrl?: string;\n  filename: string;\n  mimeType: string;\n  width?: number;\n  height?: number;\n  cachedAt: number;\n  size: number;\n}\n\n/**\n * Cache sync status\n */\nexport interface CacheSyncStatus {\n  galleryId: string;\n  totalAssets: number;\n  cachedAssets: number;\n  pendingAssets: number;\n  failedAssets: number;\n  progress: number;\n  status: 'idle' | 'syncing' | 'complete' | 'error';\n  error?: string;\n}\n\n/**\n * UseOfflineGallery options\n */\nexport interface UseOfflineGalleryOptions {\n  /**\n   * Maximum number of galleries to cache\n   * @default 10\n   */\n  maxCachedGalleries?: number;\n\n  /**\n   * Maximum cache size in bytes\n   * @default 500 * 1024 * 1024 (500MB)\n   */\n  maxCacheSize?: number;\n\n  /**\n   * Cache expiration time in milliseconds\n   * @default 7 * 24 * 60 * 60 * 1000 (7 days)\n   */\n  cacheExpiration?: number;\n\n  /**\n   * Auto-clean expired caches on mount\n   * @default true\n   */\n  autoClean?: boolean;\n}\n\n/**\n * UseOfflineGallery return type\n */\nexport interface UseOfflineGalleryReturn {\n  /**\n   * List of cached galleries\n   */\n  cachedGalleries: CachedGallery[];\n\n  /**\n   * Current cache sync status for each gallery\n   */\n  syncStatus: Map<string, CacheSyncStatus>;\n\n  /**\n   * Total cache size in bytes\n   */\n  totalCacheSize: number;\n\n  /**\n   * Whether cache is available (browser supports required APIs)\n   */\n  isAvailable: boolean;\n\n  /**\n   * Whether currently syncing any gallery\n   */\n  isSyncing: boolean;\n\n  /**\n   * Whether a specific gallery is cached\n   */\n  isGalleryCached: (galleryId: string) => boolean;\n\n  /**\n   * Get cached gallery data\n   */\n  getCachedGallery: (galleryId: string) => CachedGallery | undefined;\n\n  /**\n   * Cache a gallery for offline use\n   */\n  cacheGallery: (gallery: {\n    id: string;\n    slug: string;\n    name: string;\n    description?: string;\n    coverImageUrl?: string;\n    assets: Array<{\n      id: string;\n      thumbnailUrl: string;\n      previewUrl?: string;\n      filename: string;\n      mimeType: string;\n      width?: number;\n      height?: number;\n    }>;\n  }) => Promise<void>;\n\n  /**\n   * Remove a gallery from cache\n   */\n  removeCachedGallery: (galleryId: string) => Promise<void>;\n\n  /**\n   * Clear all cached galleries\n   */\n  clearAllCaches: () => Promise<void>;\n\n  /**\n   * Get cached assets for a gallery\n   */\n  getCachedAssets: (galleryId: string) => Promise<CachedAsset[]>;\n\n  /**\n   * Check if an asset URL is cached\n   */\n  isAssetCached: (url: string) => Promise<boolean>;\n\n  /**\n   * Update gallery access time (for LRU cleanup)\n   */\n  touchGallery: (galleryId: string) => Promise<void>;\n\n  /**\n   * Manually trigger cache cleanup\n   */\n  cleanup: () => Promise<void>;\n}\n\n// IndexedDB database name and version\nconst DB_NAME = 'rawdrive_offline';\nconst DB_VERSION = 1;\nconst GALLERY_STORE = 'galleries';\nconst ASSET_STORE = 'assets';\n\n// Cache name for service worker\nconst CACHE_NAME = 'rawdrive-offline-galleries';\n\n/**\n * Default options\n */\nconst DEFAULT_OPTIONS: Required<UseOfflineGalleryOptions> = {\n  maxCachedGalleries: 10,\n  maxCacheSize: 500 * 1024 * 1024, // 500MB\n  cacheExpiration: 7 * 24 * 60 * 60 * 1000, // 7 days\n  autoClean: true,\n};\n\n/**\n * Open IndexedDB database\n */\nasync function openDatabase(): Promise<IDBDatabase> {\n  return new Promise((resolve, reject) => {\n    const request = indexedDB.open(DB_NAME, DB_VERSION);\n\n    request.onerror = () => reject(request.error);\n    request.onsuccess = () => resolve(request.result);\n\n    request.onupgradeneeded = (event) => {\n      const db = (event.target as IDBOpenDBRequest).result;\n\n      // Create galleries store\n      if (!db.objectStoreNames.contains(GALLERY_STORE)) {\n        const galleryStore = db.createObjectStore(GALLERY_STORE, { keyPath: 'id' });\n        galleryStore.createIndex('slug', 'slug', { unique: true });\n        galleryStore.createIndex('cachedAt', 'cachedAt', { unique: false });\n        galleryStore.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });\n      }\n\n      // Create assets store\n      if (!db.objectStoreNames.contains(ASSET_STORE)) {\n        const assetStore = db.createObjectStore(ASSET_STORE, { keyPath: 'id' });\n        assetStore.createIndex('galleryId', 'galleryId', { unique: false });\n        assetStore.createIndex('cachedAt', 'cachedAt', { unique: false });\n      }\n    };\n  });\n}\n\n/**\n * Get all records from a store\n */\nasync function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {\n  return new Promise((resolve, reject) => {\n    const transaction = db.transaction(storeName, 'readonly');\n    const store = transaction.objectStore(storeName);\n    const request = store.getAll();\n\n    request.onerror = () => reject(request.error);\n    request.onsuccess = () => resolve(request.result);\n  });\n}\n\n/**\n * Get record by key\n */\nasync function getByKey<T>(db: IDBDatabase, storeName: string, key: string): Promise<T | undefined> {\n  return new Promise((resolve, reject) => {\n    const transaction = db.transaction(storeName, 'readonly');\n    const store = transaction.objectStore(storeName);\n    const request = store.get(key);\n\n    request.onerror = () => reject(request.error);\n    request.onsuccess = () => resolve(request.result);\n  });\n}\n\n/**\n * Put record into store\n */\nasync function putInStore<T>(db: IDBDatabase, storeName: string, data: T): Promise<void> {\n  return new Promise((resolve, reject) => {\n    const transaction = db.transaction(storeName, 'readwrite');\n    const store = transaction.objectStore(storeName);\n    const request = store.put(data);\n\n    request.onerror = () => reject(request.error);\n    request.onsuccess = () => resolve();\n  });\n}\n\n/**\n * Delete record from store\n */\nasync function deleteFromStore(db: IDBDatabase, storeName: string, key: string): Promise<void> {\n  return new Promise((resolve, reject) => {\n    const transaction = db.transaction(storeName, 'readwrite');\n    const store = transaction.objectStore(storeName);\n    const request = store.delete(key);\n\n    request.onerror = () => reject(request.error);\n    request.onsuccess = () => resolve();\n  });\n}\n\n/**\n * Get records by index\n */\nasync function getByIndex<T>(\n  db: IDBDatabase,\n  storeName: string,\n  indexName: string,\n  value: IDBValidKey\n): Promise<T[]> {\n  return new Promise((resolve, reject) => {\n    const transaction = db.transaction(storeName, 'readonly');\n    const store = transaction.objectStore(storeName);\n    const index = store.index(indexName);\n    const request = index.getAll(value);\n\n    request.onerror = () => reject(request.error);\n    request.onsuccess = () => resolve(request.result);\n  });\n}\n\n/**\n * Delete records by index\n */\nasync function deleteByIndex(\n  db: IDBDatabase,\n  storeName: string,\n  indexName: string,\n  value: IDBValidKey\n): Promise<void> {\n  const records = await getByIndex<{ id: string }>(db, storeName, indexName, value);\n  const transaction = db.transaction(storeName, 'readwrite');\n  const store = transaction.objectStore(storeName);\n\n  for (const record of records) {\n    store.delete(record.id);\n  }\n\n  return new Promise((resolve, reject) => {\n    transaction.oncomplete = () => resolve();\n    transaction.onerror = () => reject(transaction.error);\n  });\n}\n\n/**\n * Offline Gallery Hook\n */\nexport function useOfflineGallery(options: UseOfflineGalleryOptions = {}): UseOfflineGalleryReturn {\n  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };\n\n  // State\n  const [cachedGalleries, setCachedGalleries] = useState<CachedGallery[]>([]);\n  const [syncStatus, setSyncStatus] = useState<Map<string, CacheSyncStatus>>(new Map());\n  const [totalCacheSize, setTotalCacheSize] = useState(0);\n  const [isAvailable, setIsAvailable] = useState(false);\n  const [db, setDb] = useState<IDBDatabase | null>(null);\n\n  // Check if required APIs are available\n  useEffect(() => {\n    const available = 'indexedDB' in window && 'caches' in window;\n    setIsAvailable(available);\n\n    if (available) {\n      openDatabase()\n        .then((database) => {\n          setDb(database);\n        })\n        .catch((error) => {\n          console.error('[OfflineGallery] Failed to open database:', error);\n          setIsAvailable(false);\n        });\n    }\n  }, []);\n\n  // Load cached galleries on mount\n  useEffect(() => {\n    if (!db) return;\n\n    getAllFromStore<CachedGallery>(db, GALLERY_STORE)\n      .then((galleries) => {\n        setCachedGalleries(galleries);\n        setTotalCacheSize(galleries.reduce((sum, g) => sum + g.totalSize, 0));\n      })\n      .catch((error) => {\n        console.error('[OfflineGallery] Failed to load cached galleries:', error);\n      });\n  }, [db]);\n\n  // Auto-clean expired caches\n  useEffect(() => {\n    if (!mergedOptions.autoClean || !db) return;\n\n    const cleanupExpired = async () => {\n      const now = Date.now();\n      const galleries = await getAllFromStore<CachedGallery>(db, GALLERY_STORE);\n      const expired = galleries.filter(g => now - g.cachedAt > mergedOptions.cacheExpiration);\n\n      for (const gallery of expired) {\n        await removeCachedGalleryInternal(gallery.id);\n      }\n    };\n\n    cleanupExpired();\n  }, [db, mergedOptions.autoClean, mergedOptions.cacheExpiration]);\n\n  // Check if currently syncing\n  const isSyncing = useMemo(() => {\n    return Array.from(syncStatus.values()).some(s => s.status === 'syncing');\n  }, [syncStatus]);\n\n  // Check if a gallery is cached\n  const isGalleryCached = useCallback((galleryId: string) => {\n    return cachedGalleries.some(g => g.id === galleryId);\n  }, [cachedGalleries]);\n\n  // Get cached gallery\n  const getCachedGallery = useCallback((galleryId: string) => {\n    return cachedGalleries.find(g => g.id === galleryId);\n  }, [cachedGalleries]);\n\n  // Internal remove gallery function\n  const removeCachedGalleryInternal = async (galleryId: string) => {\n    if (!db) return;\n\n    try {\n      // Delete gallery metadata\n      await deleteFromStore(db, GALLERY_STORE, galleryId);\n\n      // Delete associated assets\n      await deleteByIndex(db, ASSET_STORE, 'galleryId', galleryId);\n\n      // Delete cached asset URLs from Cache API\n      const cache = await caches.open(CACHE_NAME);\n      const keys = await cache.keys();\n      for (const request of keys) {\n        if (request.url.includes(galleryId)) {\n          await cache.delete(request);\n        }\n      }\n\n      // Update state\n      setCachedGalleries(prev => prev.filter(g => g.id !== galleryId));\n      setSyncStatus(prev => {\n        const next = new Map(prev);\n        next.delete(galleryId);\n        return next;\n      });\n    } catch (error) {\n      console.error('[OfflineGallery] Failed to remove gallery:', error);\n    }\n  };\n\n  // Cache a gallery\n  const cacheGallery = useCallback(async (gallery: {\n    id: string;\n    slug: string;\n    name: string;\n    description?: string;\n    coverImageUrl?: string;\n    assets: Array<{\n      id: string;\n      thumbnailUrl: string;\n      previewUrl?: string;\n      filename: string;\n      mimeType: string;\n      width?: number;\n      height?: number;\n    }>;\n  }) => {\n    if (!db || !isAvailable) {\n      throw new Error('Offline caching not available');\n    }\n\n    const { id, slug, name, description, coverImageUrl, assets } = gallery;\n\n    // Initialize sync status\n    setSyncStatus(prev => {\n      const next = new Map(prev);\n      next.set(id, {\n        galleryId: id,\n        totalAssets: assets.length,\n        cachedAssets: 0,\n        pendingAssets: assets.length,\n        failedAssets: 0,\n        progress: 0,\n        status: 'syncing',\n      });\n      return next;\n    });\n\n    try {\n      // Check cache limits\n      const galleries = await getAllFromStore<CachedGallery>(db, GALLERY_STORE);\n      if (galleries.length >= mergedOptions.maxCachedGalleries) {\n        // Remove least recently accessed gallery\n        const sortedByAccess = [...galleries].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);\n        await removeCachedGalleryInternal(sortedByAccess[0].id);\n      }\n\n      // Open cache\n      const cache = await caches.open(CACHE_NAME);\n\n      // Cache cover image\n      let cachedCoverUrl: string | undefined;\n      if (coverImageUrl) {\n        try {\n          const response = await fetch(coverImageUrl);\n          if (response.ok) {\n            await cache.put(coverImageUrl, response.clone());\n            cachedCoverUrl = coverImageUrl;\n          }\n        } catch {\n          // Cover image caching is optional\n        }\n      }\n\n      // Cache assets\n      let cachedCount = 0;\n      let failedCount = 0;\n      let totalSize = 0;\n\n      for (let i = 0; i < assets.length; i++) {\n        const asset = assets[i];\n\n        try {\n          // Cache thumbnail\n          const thumbResponse = await fetch(asset.thumbnailUrl);\n          if (thumbResponse.ok) {\n            const blob = await thumbResponse.blob();\n            totalSize += blob.size;\n            await cache.put(asset.thumbnailUrl, new Response(blob));\n\n            // Store asset metadata\n            const cachedAsset: CachedAsset = {\n              id: asset.id,\n              galleryId: id,\n              thumbnailUrl: asset.thumbnailUrl,\n              previewUrl: asset.previewUrl,\n              filename: asset.filename,\n              mimeType: asset.mimeType,\n              width: asset.width,\n              height: asset.height,\n              cachedAt: Date.now(),\n              size: blob.size,\n            };\n\n            await putInStore(db, ASSET_STORE, cachedAsset);\n            cachedCount++;\n          } else {\n            failedCount++;\n          }\n        } catch {\n          failedCount++;\n        }\n\n        // Update sync status\n        setSyncStatus(prev => {\n          const next = new Map(prev);\n          next.set(id, {\n            galleryId: id,\n            totalAssets: assets.length,\n            cachedAssets: cachedCount,\n            pendingAssets: assets.length - i - 1,\n            failedAssets: failedCount,\n            progress: (i + 1) / assets.length,\n            status: 'syncing',\n          });\n          return next;\n        });\n\n        // Check size limit\n        if (totalSize > mergedOptions.maxCacheSize) {\n          throw new Error('Cache size limit exceeded');\n        }\n      }\n\n      // Store gallery metadata\n      const cachedGallery: CachedGallery = {\n        id,\n        slug,\n        name,\n        description,\n        coverImageUrl: cachedCoverUrl,\n        thumbnailUrl: assets[0]?.thumbnailUrl,\n        assetCount: assets.length,\n        cachedAt: Date.now(),\n        lastAccessedAt: Date.now(),\n        syncedAssets: cachedCount,\n        totalSize,\n      };\n\n      await putInStore(db, GALLERY_STORE, cachedGallery);\n\n      // Update state\n      setCachedGalleries(prev => [...prev.filter(g => g.id !== id), cachedGallery]);\n      setTotalCacheSize(prev => prev + totalSize);\n\n      setSyncStatus(prev => {\n        const next = new Map(prev);\n        next.set(id, {\n          galleryId: id,\n          totalAssets: assets.length,\n          cachedAssets: cachedCount,\n          pendingAssets: 0,\n          failedAssets: failedCount,\n          progress: 1,\n          status: failedCount > 0 ? 'error' : 'complete',\n          error: failedCount > 0 ? `Failed to cache ${failedCount} assets` : undefined,\n        });\n        return next;\n      });\n\n    } catch (error) {\n      console.error('[OfflineGallery] Failed to cache gallery:', error);\n\n      setSyncStatus(prev => {\n        const next = new Map(prev);\n        const current = next.get(id);\n        next.set(id, {\n          ...current!,\n          status: 'error',\n          error: error instanceof Error ? error.message : 'Unknown error',\n        });\n        return next;\n      });\n\n      throw error;\n    }\n  }, [db, isAvailable, mergedOptions.maxCachedGalleries, mergedOptions.maxCacheSize]);\n\n  // Remove cached gallery\n  const removeCachedGallery = useCallback(async (galleryId: string) => {\n    await removeCachedGalleryInternal(galleryId);\n  }, [db]);\n\n  // Clear all caches\n  const clearAllCaches = useCallback(async () => {\n    if (!db) return;\n\n    try {\n      // Clear IndexedDB stores\n      const transaction = db.transaction([GALLERY_STORE, ASSET_STORE], 'readwrite');\n      transaction.objectStore(GALLERY_STORE).clear();\n      transaction.objectStore(ASSET_STORE).clear();\n\n      // Clear Cache API\n      await caches.delete(CACHE_NAME);\n\n      // Reset state\n      setCachedGalleries([]);\n      setSyncStatus(new Map());\n      setTotalCacheSize(0);\n\n    } catch (error) {\n      console.error('[OfflineGallery] Failed to clear caches:', error);\n      throw error;\n    }\n  }, [db]);\n\n  // Get cached assets for a gallery\n  const getCachedAssets = useCallback(async (galleryId: string): Promise<CachedAsset[]> => {\n    if (!db) return [];\n    return getByIndex<CachedAsset>(db, ASSET_STORE, 'galleryId', galleryId);\n  }, [db]);\n\n  // Check if asset URL is cached\n  const isAssetCached = useCallback(async (url: string): Promise<boolean> => {\n    if (!isAvailable) return false;\n    try {\n      const cache = await caches.open(CACHE_NAME);\n      const response = await cache.match(url);\n      return response !== undefined;\n    } catch {\n      return false;\n    }\n  }, [isAvailable]);\n\n  // Update gallery access time\n  const touchGallery = useCallback(async (galleryId: string) => {\n    if (!db) return;\n\n    const gallery = await getByKey<CachedGallery>(db, GALLERY_STORE, galleryId);\n    if (gallery) {\n      gallery.lastAccessedAt = Date.now();\n      await putInStore(db, GALLERY_STORE, gallery);\n      setCachedGalleries(prev => prev.map(g => g.id === galleryId ? gallery : g));\n    }\n  }, [db]);\n\n  // Manual cleanup\n  const cleanup = useCallback(async () => {\n    if (!db) return;\n\n    const now = Date.now();\n    const galleries = await getAllFromStore<CachedGallery>(db, GALLERY_STORE);\n\n    // Remove expired galleries\n    const expired = galleries.filter(g => now - g.cachedAt > mergedOptions.cacheExpiration);\n    for (const gallery of expired) {\n      await removeCachedGalleryInternal(gallery.id);\n    }\n\n    // If still over size limit, remove least recently accessed\n    let currentSize = galleries\n      .filter(g => !expired.find(e => e.id === g.id))\n      .reduce((sum, g) => sum + g.totalSize, 0);\n\n    if (currentSize > mergedOptions.maxCacheSize) {\n      const remaining = galleries\n        .filter(g => !expired.find(e => e.id === g.id))\n        .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);\n\n      for (const gallery of remaining) {\n        if (currentSize <= mergedOptions.maxCacheSize) break;\n        await removeCachedGalleryInternal(gallery.id);\n        currentSize -= gallery.totalSize;\n      }\n    }\n  }, [db, mergedOptions.cacheExpiration, mergedOptions.maxCacheSize]);\n\n  return {\n    cachedGalleries,\n    syncStatus,\n    totalCacheSize,\n    isAvailable,\n    isSyncing,\n    isGalleryCached,\n    getCachedGallery,\n    cacheGallery,\n    removeCachedGallery,\n    clearAllCaches,\n    getCachedAssets,\n    isAssetCached,\n    touchGallery,\n    cleanup,\n  };\n}\n\nexport default useOfflineGallery;\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore existing PWA and ServiceWorker infrastructure",
      "status": "completed",
      "activeForm": "Exploring existing PWA and ServiceWorker infrastructure"
    },
    {
      "content": "Implement iOS/Android app install prompts with custom icons",
      "status": "completed",
      "activeForm": "Implementing iOS/Android app install prompts with custom icons"
    },
    {
      "content": "Add touch gesture support (pinch-zoom, swipe navigation)",
      "status": "completed",
      "activeForm": "Adding touch gesture support"
    },
    {
      "content": "Implement native status bar integration",
      "status": "completed",
      "activeForm": "Implementing native status bar integration"
    },
    {
      "content": "Add offline support for cached galleries",
      "status": "completed",
      "activeForm": "Adding offline support for cached galleries"
    },
    {
      "content": "Implement home screen shortcuts for frequent galleries",
      "status": "in_progress",
      "activeForm": "Implementing home screen shortcuts for frequent galleries"
    }
  ]
}

Now let me create the home screen shortcuts functionality component:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\components\\features\\gallery\\GalleryShortcut.tsx",
  "content": "import React, { useState, useCallback, useMemo } from 'react';\nimport { motion, AnimatePresence } from 'framer-motion';\nimport {\n  Home,\n  Plus,\n  Star,\n  Check,\n  Trash2,\n  Share2,\n  ExternalLink,\n  Smartphone,\n  Info,\n  X,\n} from 'lucide-react';\nimport { usePWA } from '@/hooks/usePWA';\n\n/* =============================================================================\n   Gallery Shortcut Component\n\n   Enables users to add galleries to home screen as quick shortcuts.\n   Supports both PWA shortcut manifest and native share API for iOS.\n   ============================================================================= */\n\n/**\n * Gallery data for shortcut\n */\nexport interface GalleryShortcutData {\n  id: string;\n  slug: string;\n  name: string;\n  description?: string;\n  thumbnailUrl?: string;\n  coverImageUrl?: string;\n  isPublic?: boolean;\n}\n\n/**\n * Props for GalleryShortcut button\n */\nexport interface GalleryShortcutButtonProps {\n  gallery: GalleryShortcutData;\n  variant?: 'icon' | 'button' | 'menu-item';\n  size?: 'sm' | 'md' | 'lg';\n  className?: string;\n  onShortcutAdded?: () => void;\n  onShortcutRemoved?: () => void;\n}\n\n/**\n * Generate shortcut URL for a gallery\n */\nfunction getGalleryShortcutUrl(gallery: GalleryShortcutData): string {\n  // For public galleries, use the public URL\n  if (gallery.isPublic) {\n    return `/g/${gallery.slug}`;\n  }\n  // For private galleries, use the gallery detail URL\n  return `/galleries/${gallery.id}`;\n}\n\n/**\n * Gallery Shortcut Button Component\n */\nexport function GalleryShortcutButton({\n  gallery,\n  variant = 'button',\n  size = 'md',\n  className,\n  onShortcutAdded,\n  onShortcutRemoved,\n}: GalleryShortcutButtonProps) {\n  const { platform, shortcuts, addShortcut, removeShortcut, canShare, share } = usePWA();\n  const [showInstructions, setShowInstructions] = useState(false);\n  const [isAdding, setIsAdding] = useState(false);\n\n  // Check if shortcut exists\n  const shortcutUrl = getGalleryShortcutUrl(gallery);\n  const isShortcutAdded = useMemo(() => {\n    return shortcuts.some(s => s.url === shortcutUrl);\n  }, [shortcuts, shortcutUrl]);\n\n  // Handle add shortcut\n  const handleAddShortcut = useCallback(async () => {\n    setIsAdding(true);\n\n    try {\n      // For iOS, use share API if available\n      if (platform.isIOS && canShare({ url: window.location.origin + shortcutUrl })) {\n        setShowInstructions(true);\n        return;\n      }\n\n      // Add to shortcuts storage\n      addShortcut({\n        name: gallery.name,\n        short_name: gallery.name.slice(0, 12),\n        description: gallery.description || `Quick access to ${gallery.name}`,\n        url: shortcutUrl,\n        icons: gallery.thumbnailUrl ? [\n          {\n            src: gallery.thumbnailUrl,\n            sizes: '192x192',\n            type: 'image/png',\n            purpose: 'any',\n          },\n        ] : undefined,\n      });\n\n      // If platform supports share API for adding to home screen\n      if (canShare({ url: window.location.origin + shortcutUrl })) {\n        try {\n          await share({\n            title: gallery.name,\n            text: gallery.description || `Open ${gallery.name} gallery`,\n            url: window.location.origin + shortcutUrl,\n          });\n        } catch (error) {\n          // User cancelled or share failed - that's ok\n          console.log('Share cancelled or failed:', error);\n        }\n      }\n\n      onShortcutAdded?.();\n    } finally {\n      setIsAdding(false);\n    }\n  }, [platform.isIOS, canShare, shortcutUrl, gallery, addShortcut, share, onShortcutAdded]);\n\n  // Handle remove shortcut\n  const handleRemoveShortcut = useCallback(() => {\n    removeShortcut(shortcutUrl);\n    onShortcutRemoved?.();\n  }, [removeShortcut, shortcutUrl, onShortcutRemoved]);\n\n  // Size classes\n  const sizeClasses = {\n    sm: 'p-1.5 text-xs',\n    md: 'p-2 text-sm',\n    lg: 'p-3 text-base',\n  };\n\n  const iconSizes = {\n    sm: 'w-4 h-4',\n    md: 'w-5 h-5',\n    lg: 'w-6 h-6',\n  };\n\n  // Render based on variant\n  if (variant === 'icon') {\n    return (\n      <>\n        <button\n          onClick={isShortcutAdded ? handleRemoveShortcut : handleAddShortcut}\n          disabled={isAdding}\n          className={`rounded-lg transition-colors ${sizeClasses[size]} ${\n            isShortcutAdded\n              ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'\n              : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white'\n          } disabled:opacity-50 ${className || ''}`}\n          title={isShortcutAdded ? 'Remove from shortcuts' : 'Add to home screen'}\n        >\n          {isAdding ? (\n            <span className={`block ${iconSizes[size]} border-2 border-current border-t-transparent rounded-full animate-spin`} />\n          ) : isShortcutAdded ? (\n            <Star className={`${iconSizes[size]} fill-current`} />\n          ) : (\n            <Home className={iconSizes[size]} />\n          )}\n        </button>\n\n        <IOSInstructionsModal\n          isOpen={showInstructions}\n          onClose={() => setShowInstructions(false)}\n          gallery={gallery}\n        />\n      </>\n    );\n  }\n\n  if (variant === 'menu-item') {\n    return (\n      <>\n        <button\n          onClick={isShortcutAdded ? handleRemoveShortcut : handleAddShortcut}\n          disabled={isAdding}\n          className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm rounded-lg transition-colors ${\n            isShortcutAdded\n              ? 'text-blue-400 hover:bg-blue-500/10'\n              : 'text-slate-300 hover:bg-slate-700/50'\n          } disabled:opacity-50 ${className || ''}`}\n        >\n          {isAdding ? (\n            <span className=\"w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin\" />\n          ) : isShortcutAdded ? (\n            <Star className=\"w-5 h-5 fill-current\" />\n          ) : (\n            <Home className=\"w-5 h-5\" />\n          )}\n          <span>{isShortcutAdded ? 'Remove from shortcuts' : 'Add to home screen'}</span>\n          {isShortcutAdded && <Check className=\"w-4 h-4 ml-auto\" />}\n        </button>\n\n        <IOSInstructionsModal\n          isOpen={showInstructions}\n          onClose={() => setShowInstructions(false)}\n          gallery={gallery}\n        />\n      </>\n    );\n  }\n\n  // Default button variant\n  return (\n    <>\n      <button\n        onClick={isShortcutAdded ? handleRemoveShortcut : handleAddShortcut}\n        disabled={isAdding}\n        className={`inline-flex items-center gap-2 ${sizeClasses[size]} rounded-lg transition-colors ${\n          isShortcutAdded\n            ? 'bg-blue-600 text-white hover:bg-blue-700'\n            : 'bg-slate-700 text-white hover:bg-slate-600'\n        } disabled:opacity-50 font-medium ${className || ''}`}\n      >\n        {isAdding ? (\n          <span className={`block ${iconSizes[size]} border-2 border-white border-t-transparent rounded-full animate-spin`} />\n        ) : isShortcutAdded ? (\n          <>\n            <Check className={iconSizes[size]} />\n            <span>Shortcut Added</span>\n          </>\n        ) : (\n          <>\n            <Plus className={iconSizes[size]} />\n            <span>Add to Home</span>\n          </>\n        )}\n      </button>\n\n      <IOSInstructionsModal\n        isOpen={showInstructions}\n        onClose={() => setShowInstructions(false)}\n        gallery={gallery}\n      />\n    </>\n  );\n}\n\n/**\n * iOS Instructions Modal\n */\ninterface IOSInstructionsModalProps {\n  isOpen: boolean;\n  onClose: () => void;\n  gallery: GalleryShortcutData;\n}\n\nfunction IOSInstructionsModal({ isOpen, onClose, gallery }: IOSInstructionsModalProps) {\n  const { share, canShare } = usePWA();\n  const shortcutUrl = getGalleryShortcutUrl(gallery);\n  const fullUrl = window.location.origin + shortcutUrl;\n\n  const handleShare = async () => {\n    if (canShare({ url: fullUrl })) {\n      try {\n        await share({\n          title: gallery.name,\n          text: `Open ${gallery.name} gallery`,\n          url: fullUrl,\n        });\n        onClose();\n      } catch {\n        // User cancelled\n      }\n    }\n  };\n\n  return (\n    <AnimatePresence>\n      {isOpen && (\n        <>\n          {/* Backdrop */}\n          <motion.div\n            initial={{ opacity: 0 }}\n            animate={{ opacity: 1 }}\n            exit={{ opacity: 0 }}\n            className=\"fixed inset-0 bg-black/60 z-50\"\n            onClick={onClose}\n          />\n\n          {/* Modal */}\n          <motion.div\n            initial={{ opacity: 0, y: 100 }}\n            animate={{ opacity: 1, y: 0 }}\n            exit={{ opacity: 0, y: 100 }}\n            transition={{ type: 'spring', damping: 25, stiffness: 300 }}\n            className=\"fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg\"\n          >\n            <div className=\"bg-slate-800 rounded-t-2xl shadow-2xl overflow-hidden\">\n              {/* Header */}\n              <div className=\"flex items-center justify-between p-4 border-b border-slate-700\">\n                <div className=\"flex items-center gap-3\">\n                  <div className=\"w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center\">\n                    <Smartphone className=\"w-5 h-5 text-white\" />\n                  </div>\n                  <div>\n                    <h3 className=\"text-white font-semibold\">Add to Home Screen</h3>\n                    <p className=\"text-xs text-slate-400\">Create a shortcut for quick access</p>\n                  </div>\n                </div>\n                <button\n                  onClick={onClose}\n                  className=\"p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors\"\n                >\n                  <X className=\"w-5 h-5\" />\n                </button>\n              </div>\n\n              {/* Content */}\n              <div className=\"p-4 space-y-4\">\n                {/* Gallery preview */}\n                <div className=\"flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg\">\n                  {gallery.thumbnailUrl ? (\n                    <img\n                      src={gallery.thumbnailUrl}\n                      alt={gallery.name}\n                      className=\"w-12 h-12 rounded-lg object-cover\"\n                    />\n                  ) : (\n                    <div className=\"w-12 h-12 rounded-lg bg-slate-600 flex items-center justify-center\">\n                      <Home className=\"w-6 h-6 text-slate-400\" />\n                    </div>\n                  )}\n                  <div className=\"flex-1 min-w-0\">\n                    <p className=\"text-white font-medium truncate\">{gallery.name}</p>\n                    {gallery.description && (\n                      <p className=\"text-xs text-slate-400 truncate\">{gallery.description}</p>\n                    )}\n                  </div>\n                </div>\n\n                {/* Instructions */}\n                <div className=\"space-y-3\">\n                  <div className=\"flex items-center gap-2 text-slate-400\">\n                    <Info className=\"w-4 h-4 shrink-0\" />\n                    <p className=\"text-sm\">To add this gallery to your home screen:</p>\n                  </div>\n\n                  <ol className=\"space-y-2 text-sm\">\n                    <li className=\"flex items-start gap-3\">\n                      <span className=\"w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 text-xs font-medium\">1</span>\n                      <span className=\"text-slate-300\">Tap the <Share2 className=\"w-4 h-4 inline text-blue-400\" /> Share button below</span>\n                    </li>\n                    <li className=\"flex items-start gap-3\">\n                      <span className=\"w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 text-xs font-medium\">2</span>\n                      <span className=\"text-slate-300\">Scroll and tap <span className=\"text-white font-medium\">\"Add to Home Screen\"</span></span>\n                    </li>\n                    <li className=\"flex items-start gap-3\">\n                      <span className=\"w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 text-xs font-medium\">3</span>\n                      <span className=\"text-slate-300\">Tap <span className=\"text-white font-medium\">\"Add\"</span> to confirm</span>\n                    </li>\n                  </ol>\n                </div>\n\n                {/* Actions */}\n                <div className=\"flex gap-2 pt-2\">\n                  <button\n                    onClick={onClose}\n                    className=\"flex-1 px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-colors\"\n                  >\n                    Cancel\n                  </button>\n                  <button\n                    onClick={handleShare}\n                    className=\"flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors\"\n                  >\n                    <Share2 className=\"w-4 h-4\" />\n                    Share\n                  </button>\n                </div>\n              </div>\n            </div>\n          </motion.div>\n        </>\n      )}\n    </AnimatePresence>\n  );\n}\n\n/* =============================================================================\n   Gallery Shortcuts List Component\n   ============================================================================= */\n\nexport interface GalleryShortcutsListProps {\n  onGallerySelect?: (url: string) => void;\n  className?: string;\n  maxItems?: number;\n}\n\nexport function GalleryShortcutsList({\n  onGallerySelect,\n  className,\n  maxItems = 5,\n}: GalleryShortcutsListProps) {\n  const { shortcuts, removeShortcut } = usePWA();\n\n  const displayedShortcuts = shortcuts.slice(0, maxItems);\n\n  if (displayedShortcuts.length === 0) {\n    return (\n      <div className={`text-center py-8 ${className || ''}`}>\n        <Home className=\"w-12 h-12 mx-auto text-slate-600 mb-3\" />\n        <p className=\"text-slate-400 text-sm\">No gallery shortcuts yet</p>\n        <p className=\"text-slate-500 text-xs mt-1\">\n          Add galleries to your home screen for quick access\n        </p>\n      </div>\n    );\n  }\n\n  return (\n    <div className={`space-y-2 ${className || ''}`}>\n      {displayedShortcuts.map((shortcut) => (\n        <div\n          key={shortcut.url}\n          className=\"flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg group\"\n        >\n          {shortcut.icons?.[0]?.src ? (\n            <img\n              src={shortcut.icons[0].src}\n              alt={shortcut.name}\n              className=\"w-10 h-10 rounded-lg object-cover\"\n            />\n          ) : (\n            <div className=\"w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center\">\n              <Home className=\"w-5 h-5 text-slate-400\" />\n            </div>\n          )}\n\n          <div className=\"flex-1 min-w-0\">\n            <p className=\"text-white font-medium truncate\">{shortcut.name}</p>\n            {shortcut.description && (\n              <p className=\"text-xs text-slate-400 truncate\">{shortcut.description}</p>\n            )}\n          </div>\n\n          <div className=\"flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity\">\n            <button\n              onClick={() => onGallerySelect?.(shortcut.url)}\n              className=\"p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors\"\n              title=\"Open gallery\"\n            >\n              <ExternalLink className=\"w-4 h-4\" />\n            </button>\n            <button\n              onClick={() => removeShortcut(shortcut.url)}\n              className=\"p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors\"\n              title=\"Remove shortcut\"\n            >\n              <Trash2 className=\"w-4 h-4\" />\n            </button>\n          </div>\n        </div>\n      ))}\n    </div>\n  );\n}\n\nexport default GalleryShortcutButton;\n"
}

Now let me update the hooks index to export the new hooks:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\index.ts",
  "offset": 320
}

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\index.ts",
  "old_string": "// Culling Workflow hooks\nexport { useCullingWorkflow } from './useCullingWorkflow';\nexport type {\n  CullingViewMode,\n  CullingSortBy,\n  UseCullingWorkflowOptions,\n  UseCullingWorkflowReturn,\n} from './useCullingWorkflow';",
  "new_string": "// Culling Workflow hooks\nexport { useCullingWorkflow } from './useCullingWorkflow';\nexport type {\n  CullingViewMode,\n  CullingSortBy,\n  UseCullingWorkflowOptions,\n  UseCullingWorkflowReturn,\n} from './useCullingWorkflow';\n\n// PWA hooks\nexport { usePWA } from './usePWA';\nexport type {\n  PWADisplayMode,\n  PlatformInfo,\n  PWAInstallState,\n  NetworkState,\n  PWAShortcut,\n  UsePWAOptions,\n  UsePWAReturn,\n} from './usePWA';\n\n// Gallery Gestures hook\nexport { useGalleryGestures } from './useGalleryGestures';\nexport type {\n  GestureState,\n  UseGalleryGesturesOptions,\n  UseGalleryGesturesReturn,\n} from './useGalleryGestures';\n\n// Offline Gallery hook\nexport { useOfflineGallery } from './useOfflineGallery';\nexport type {\n  CachedGallery,\n  CachedAsset,\n  CacheSyncStatus,\n  UseOfflineGalleryOptions,\n  UseOfflineGalleryReturn,\n} from './useOfflineGallery';"
}

Now let me update the contexts index to export the PWA context:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\contexts\\index.ts"
}

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\contexts\\index.ts",
  "old_string": "export * from './AuthContext';\nexport * from './SearchContext';",
  "new_string": "export * from './AuthContext';\nexport * from './SearchContext';\nexport * from './PWAContext';"
}

Now let me update the UI components index to export the new PWA components:

🔧 Tool: Glob
Input: {
  "pattern": "frontend/src/components/ui/index.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\components\\ui\\index.ts"
}

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\components\\ui\\index.ts",
  "old_string": "// Accessibility Components\nexport { SkipLink } from './SkipLink';\nexport { VisuallyHidden } from './VisuallyHidden';",
  "new_string": "// Accessibility Components\nexport { SkipLink } from './SkipLink';\nexport { VisuallyHidden } from './VisuallyHidden';\n\n// PWA Components\nexport { PWAUpdateNotification } from './PWAUpdateNotification';\nexport { PWAInstallPrompt, PWAInstallBanner } from './PWAInstallPrompt';"
}

Now let me update the App.tsx to include the PWAProvider and install prompt:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\App.tsx"
}

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\App.tsx",
  "old_string": "import React from 'react';\nimport { createBrowserRouter, RouterProvider } from 'react-router-dom';\nimport { HelmetProvider } from 'react-helmet-async';\nimport { QueryClient, QueryClientProvider } from '@tanstack/react-query';\nimport { AuthProvider } from './contexts';\nimport { ToastProvider } from './components/ui';\nimport { PWAUpdateNotification } from './components/ui/PWAUpdateNotification';\nimport { routes } from './router';\nimport ErrorBoundary from './components/error/ErrorBoundary';\nimport { AppErrorFallback } from './components/error/ErrorFallbacks';",
  "new_string": "import React from 'react';\nimport { createBrowserRouter, RouterProvider } from 'react-router-dom';\nimport { HelmetProvider } from 'react-helmet-async';\nimport { QueryClient, QueryClientProvider } from '@tanstack/react-query';\nimport { AuthProvider, PWAProvider } from './contexts';\nimport { ToastProvider, PWAUpdateNotification, PWAInstallPrompt } from './components/ui';\nimport { ThemeProvider } from './hooks';\nimport { routes } from './router';\nimport ErrorBoundary from './components/error/ErrorBoundary';\nimport { AppErrorFallback } from './components/error/ErrorFallbacks';"
}

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\App.tsx",
  "old_string": "const App: React.FC = () => {\n  return (\n    <ErrorBoundary fallback={<AppErrorFallback />}>\n      <QueryClientProvider client={queryClient}>\n        <HelmetProvider>\n          <AuthProvider>\n            <ToastProvider position=\"bottom-center\">\n              <RouterProvider router={router} future={{ v7_startTransition: true }} />\n              <PWAUpdateNotification />\n            </ToastProvider>\n          </AuthProvider>\n        </HelmetProvider>\n      </QueryClientProvider>\n    </ErrorBoundary>\n  );\n};",
  "new_string": "const App: React.FC = () => {\n  return (\n    <ErrorBoundary fallback={<AppErrorFallback />}>\n      <QueryClientProvider client={queryClient}>\n        <HelmetProvider>\n          <ThemeProvider>\n            <AuthProvider>\n              <PWAProvider>\n                <ToastProvider position=\"bottom-center\">\n                  <RouterProvider router={router} future={{ v7_startTransition: true }} />\n                  <PWAUpdateNotification />\n                  <PWAInstallPrompt />\n                </ToastProvider>\n              </PWAProvider>\n            </AuthProvider>\n          </ThemeProvider>\n        </HelmetProvider>\n      </QueryClientProvider>\n    </ErrorBoundary>\n  );\n};"
}

Now let me update the vite.config.ts to add better manifest icons with maskable support and shortcuts:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\vite.config.ts",
  "offset": 85,
  "limit": 40
}

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\vite.config.ts",
  "old_string": "      manifest: {\n        name: 'RawDrive',\n        short_name: 'RawDrive',\n        description: 'Professional Photography Platform',\n        theme_color: '#000000',\n        background_color: '#000000',\n        display: 'standalone',\n        icons: [\n          {\n            src: '/android-chrome-192x192.png',\n            sizes: '192x192',\n            type: 'image/png',\n            purpose: 'any',\n          },\n          {\n            src: '/android-chrome-512x512.png',\n            sizes: '512x512',\n            type: 'image/png',\n            purpose: 'any',\n          },\n          {\n            src: '/apple-touch-icon.png',\n            sizes: '180x180',\n            type: 'image/png',\n            purpose: 'any',\n          },\n        ],\n      },",
  "new_string": "      manifest: {\n        name: 'RawDrive',\n        short_name: 'RawDrive',\n        description: 'Professional Photography Platform for Gallery Delivery, Client Proofing, and AI-Powered Photo Management',\n        theme_color: '#0F172A',\n        background_color: '#0F172A',\n        display: 'standalone',\n        orientation: 'any',\n        scope: '/',\n        start_url: '/',\n        id: 'rawdrive-pwa',\n        categories: ['photography', 'productivity', 'business'],\n        icons: [\n          {\n            src: '/android-chrome-192x192.png',\n            sizes: '192x192',\n            type: 'image/png',\n            purpose: 'any',\n          },\n          {\n            src: '/android-chrome-512x512.png',\n            sizes: '512x512',\n            type: 'image/png',\n            purpose: 'any',\n          },\n          {\n            src: '/android-chrome-512x512.png',\n            sizes: '512x512',\n            type: 'image/png',\n            purpose: 'maskable',\n          },\n          {\n            src: '/apple-touch-icon.png',\n            sizes: '180x180',\n            type: 'image/png',\n            purpose: 'any',\n          },\n        ],\n        shortcuts: [\n          {\n            name: 'My Galleries',\n            short_name: 'Galleries',\n            description: 'View and manage your photo galleries',\n            url: '/galleries',\n            icons: [{ src: '/android-chrome-192x192.png', sizes: '192x192' }],\n          },\n          {\n            name: 'Upload Photos',\n            short_name: 'Upload',\n            description: 'Upload new photos to your galleries',\n            url: '/upload',\n            icons: [{ src: '/android-chrome-192x192.png', sizes: '192x192' }],\n          },\n          {\n            name: 'Clients',\n            short_name: 'Clients',\n            description: 'Manage your client contacts',\n            url: '/clients',\n            icons: [{ src: '/android-chrome-192x192.png', sizes: '192x192' }],\n          },\n        ],\n        screenshots: [\n          {\n            src: '/screenshots/gallery-view.png',\n            sizes: '1280x720',\n            type: 'image/png',\n            form_factor: 'wide',\n            label: 'Gallery View',\n          },\n          {\n            src: '/screenshots/mobile-gallery.png',\n            sizes: '390x844',\n            type: 'image/png',\n            form_factor: 'narrow',\n            label: 'Mobile Gallery View',\n          },\n        ],\n        related_applications: [],\n        prefer_related_applications: false,\n      },"
}

Now let me update the index.html to add better PWA meta tags for iOS:

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\index.html",
  "old_string": "  <head>\n    <meta charset=\"UTF-8\" />\n    <link rel=\"icon\" href=\"/favicon.ico\" sizes=\"any\" />\n    <link rel=\"icon\" type=\"image/png\" sizes=\"32x32\" href=\"/favicon-32x32.png\" />\n    <link rel=\"icon\" type=\"image/png\" sizes=\"16x16\" href=\"/favicon-16x16.png\" />\n    <link rel=\"apple-touch-icon\" sizes=\"180x180\" href=\"/apple-touch-icon.png\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <meta name=\"theme-color\" content=\"#0F172A\" />\n    <meta name=\"description\" content=\"RawDrive - Professional Photography Platform for Gallery Delivery, Client Proofing, and AI-Powered Photo Management\" />\n    <title>RawDrive - Professional Photography Platform</title>",
  "new_string": "  <head>\n    <meta charset=\"UTF-8\" />\n\n    <!-- Favicons and App Icons -->\n    <link rel=\"icon\" href=\"/favicon.ico\" sizes=\"any\" />\n    <link rel=\"icon\" type=\"image/png\" sizes=\"32x32\" href=\"/favicon-32x32.png\" />\n    <link rel=\"icon\" type=\"image/png\" sizes=\"16x16\" href=\"/favicon-16x16.png\" />\n    <link rel=\"apple-touch-icon\" sizes=\"180x180\" href=\"/apple-touch-icon.png\" />\n    <link rel=\"mask-icon\" href=\"/safari-pinned-tab.svg\" color=\"#3b82f6\" />\n\n    <!-- PWA Meta Tags -->\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover\" />\n    <meta name=\"theme-color\" content=\"#0F172A\" media=\"(prefers-color-scheme: dark)\" />\n    <meta name=\"theme-color\" content=\"#FFFFFF\" media=\"(prefers-color-scheme: light)\" />\n    <meta name=\"description\" content=\"RawDrive - Professional Photography Platform for Gallery Delivery, Client Proofing, and AI-Powered Photo Management\" />\n    <meta name=\"application-name\" content=\"RawDrive\" />\n\n    <!-- iOS PWA Meta Tags -->\n    <meta name=\"apple-mobile-web-app-capable\" content=\"yes\" />\n    <meta name=\"apple-mobile-web-app-status-bar-style\" content=\"black-translucent\" />\n    <meta name=\"apple-mobile-web-app-title\" content=\"RawDrive\" />\n    <meta name=\"format-detection\" content=\"telephone=no\" />\n\n    <!-- Android PWA Meta Tags -->\n    <meta name=\"mobile-web-app-capable\" content=\"yes\" />\n\n    <!-- Microsoft Meta Tags -->\n    <meta name=\"msapplication-TileColor\" content=\"#0F172A\" />\n    <meta name=\"msapplication-tap-highlight\" content=\"no\" />\n\n    <title>RawDrive - Professional Photography Platform</title>"
}

Now let me create an offline indicator component and a network status hook to improve the offline experience:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\components\\ui\\OfflineIndicator.tsx",
  "content": "import React from 'react';\nimport { motion, AnimatePresence } from 'framer-motion';\nimport { WifiOff, Wifi, RefreshCw, Cloud, CloudOff } from 'lucide-react';\nimport { usePWA } from '@/hooks/usePWA';\n\n/* =============================================================================\n   Offline Indicator Component\n\n   Shows network status and provides offline capabilities feedback.\n   ============================================================================= */\n\n/**\n * Props for OfflineIndicator\n */\nexport interface OfflineIndicatorProps {\n  /**\n   * Position of the indicator\n   * @default 'bottom'\n   */\n  position?: 'top' | 'bottom';\n\n  /**\n   * Whether to show when online (for slow connections)\n   * @default false\n   */\n  showOnSlowConnection?: boolean;\n\n  /**\n   * Whether to auto-hide when back online\n   * @default true\n   */\n  autoHide?: boolean;\n\n  /**\n   * Auto-hide delay in milliseconds\n   * @default 3000\n   */\n  autoHideDelay?: number;\n\n  /**\n   * Custom class name\n   */\n  className?: string;\n}\n\n/**\n * Offline Indicator - Shows network status\n */\nexport function OfflineIndicator({\n  position = 'bottom',\n  showOnSlowConnection = false,\n  autoHide = true,\n  autoHideDelay = 3000,\n  className,\n}: OfflineIndicatorProps) {\n  const { network } = usePWA();\n  const [visible, setVisible] = React.useState(false);\n  const [wasOffline, setWasOffline] = React.useState(false);\n  const [showReconnected, setShowReconnected] = React.useState(false);\n\n  // Show indicator when offline or slow connection\n  React.useEffect(() => {\n    if (!network.isOnline) {\n      setVisible(true);\n      setWasOffline(true);\n      setShowReconnected(false);\n    } else if (showOnSlowConnection && network.isSlowConnection) {\n      setVisible(true);\n    } else if (wasOffline && network.isOnline) {\n      // Show \"reconnected\" message\n      setShowReconnected(true);\n      setVisible(true);\n\n      if (autoHide) {\n        const timer = setTimeout(() => {\n          setVisible(false);\n          setWasOffline(false);\n          setShowReconnected(false);\n        }, autoHideDelay);\n\n        return () => clearTimeout(timer);\n      }\n    } else {\n      setVisible(false);\n    }\n  }, [network.isOnline, network.isSlowConnection, showOnSlowConnection, wasOffline, autoHide, autoHideDelay]);\n\n  // Position classes\n  const positionClasses = position === 'top' ? 'top-0' : 'bottom-0';\n\n  return (\n    <AnimatePresence>\n      {visible && (\n        <motion.div\n          initial={{ opacity: 0, y: position === 'top' ? -50 : 50 }}\n          animate={{ opacity: 1, y: 0 }}\n          exit={{ opacity: 0, y: position === 'top' ? -50 : 50 }}\n          transition={{ type: 'spring', damping: 25, stiffness: 300 }}\n          className={`fixed left-0 right-0 z-50 ${positionClasses} ${className || ''}`}\n        >\n          <div\n            className={`mx-4 my-2 p-3 rounded-lg shadow-lg backdrop-blur-sm ${\n              showReconnected\n                ? 'bg-green-500/90 text-white'\n                : !network.isOnline\n                ? 'bg-red-500/90 text-white'\n                : 'bg-yellow-500/90 text-black'\n            }`}\n          >\n            <div className=\"flex items-center justify-center gap-2\">\n              {showReconnected ? (\n                <>\n                  <Wifi className=\"w-5 h-5\" />\n                  <span className=\"text-sm font-medium\">Back online</span>\n                </>\n              ) : !network.isOnline ? (\n                <>\n                  <WifiOff className=\"w-5 h-5\" />\n                  <span className=\"text-sm font-medium\">You're offline</span>\n                  <span className=\"text-sm opacity-80\">- Viewing cached content</span>\n                </>\n              ) : network.isSlowConnection ? (\n                <>\n                  <Wifi className=\"w-5 h-5\" />\n                  <span className=\"text-sm font-medium\">Slow connection detected</span>\n                </>\n              ) : null}\n            </div>\n          </div>\n        </motion.div>\n      )}\n    </AnimatePresence>\n  );\n}\n\n/**\n * Compact network status badge\n */\nexport interface NetworkStatusBadgeProps {\n  className?: string;\n  showWhenOnline?: boolean;\n}\n\nexport function NetworkStatusBadge({ className, showWhenOnline = false }: NetworkStatusBadgeProps) {\n  const { network } = usePWA();\n\n  if (network.isOnline && !showWhenOnline) {\n    return null;\n  }\n\n  return (\n    <div\n      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${\n        network.isOnline\n          ? network.isSlowConnection\n            ? 'bg-yellow-500/20 text-yellow-400'\n            : 'bg-green-500/20 text-green-400'\n          : 'bg-red-500/20 text-red-400'\n      } ${className || ''}`}\n    >\n      {network.isOnline ? (\n        network.isSlowConnection ? (\n          <>\n            <Wifi className=\"w-3 h-3\" />\n            <span>Slow</span>\n          </>\n        ) : (\n          <>\n            <Cloud className=\"w-3 h-3\" />\n            <span>Online</span>\n          </>\n        )\n      ) : (\n        <>\n          <CloudOff className=\"w-3 h-3\" />\n          <span>Offline</span>\n        </>\n      )}\n    </div>\n  );\n}\n\n/**\n * Offline Mode Banner - For pages that have offline support\n */\nexport interface OfflineModeBannerProps {\n  onRefresh?: () => void;\n  className?: string;\n}\n\nexport function OfflineModeBanner({ onRefresh, className }: OfflineModeBannerProps) {\n  const { network } = usePWA();\n  const [isRefreshing, setIsRefreshing] = React.useState(false);\n\n  if (network.isOnline) {\n    return null;\n  }\n\n  const handleRefresh = async () => {\n    setIsRefreshing(true);\n    try {\n      onRefresh?.();\n      // Wait a bit for visual feedback\n      await new Promise(resolve => setTimeout(resolve, 1000));\n    } finally {\n      setIsRefreshing(false);\n    }\n  };\n\n  return (\n    <div className={`bg-slate-800 border border-slate-700 rounded-lg p-4 ${className || ''}`}>\n      <div className=\"flex items-start gap-3\">\n        <div className=\"p-2 bg-amber-500/20 rounded-lg shrink-0\">\n          <WifiOff className=\"w-5 h-5 text-amber-400\" />\n        </div>\n        <div className=\"flex-1\">\n          <h3 className=\"text-white font-medium\">Viewing Cached Content</h3>\n          <p className=\"text-sm text-slate-400 mt-1\">\n            You're currently offline. Some features may be limited, but you can still browse previously viewed galleries.\n          </p>\n          <div className=\"flex gap-2 mt-3\">\n            <button\n              onClick={handleRefresh}\n              disabled={isRefreshing}\n              className=\"inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg transition-colors\"\n            >\n              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />\n              {isRefreshing ? 'Checking...' : 'Retry Connection'}\n            </button>\n          </div>\n        </div>\n      </div>\n    </div>\n  );\n}\n\nexport default OfflineIndicator;\n"
}

Now let me update the UI index to export the new components:

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\components\\ui\\index.ts",
  "old_string": "// PWA Components\nexport { PWAUpdateNotification } from './PWAUpdateNotification';\nexport { PWAInstallPrompt, PWAInstallBanner } from './PWAInstallPrompt';",
  "new_string": "// PWA Components\nexport { PWAUpdateNotification } from './PWAUpdateNotification';\nexport { PWAInstallPrompt, PWAInstallBanner } from './PWAInstallPrompt';\nexport { OfflineIndicator, NetworkStatusBadge, OfflineModeBanner } from './OfflineIndicator';"
}

Now let me add the OfflineIndicator to the App.tsx:

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\App.tsx",
  "old_string": "import { ToastProvider, PWAUpdateNotification, PWAInstallPrompt } from './components/ui';",
  "new_string": "import { ToastProvider, PWAUpdateNotification, PWAInstallPrompt, OfflineIndicator } from './components/ui';"
}

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\App.tsx",
  "old_string": "                <ToastProvider position=\"bottom-center\">\n                  <RouterProvider router={router} future={{ v7_startTransition: true }} />\n                  <PWAUpdateNotification />\n                  <PWAInstallPrompt />\n                </ToastProvider>",
  "new_string": "                <ToastProvider position=\"bottom-center\">\n                  <RouterProvider router={router} future={{ v7_startTransition: true }} />\n                  <PWAUpdateNotification />\n                  <PWAInstallPrompt />\n                  <OfflineIndicator position=\"bottom\" autoHide />\n                </ToastProvider>"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore existing PWA and ServiceWorker infrastructure",
      "status": "completed",
      "activeForm": "Exploring existing PWA and ServiceWorker infrastructure"
    },
    {
      "content": "Implement iOS/Android app install prompts with custom icons",
      "status": "completed",
      "activeForm": "Implementing iOS/Android app install prompts with custom icons"
    },
    {
      "content": "Add touch gesture support (pinch-zoom, swipe navigation)",
      "status": "completed",
      "activeForm": "Adding touch gesture support"
    },
    {
      "content": "Implement native status bar integration",
      "status": "completed",
      "activeForm": "Implementing native status bar integration"
    },
    {
      "content": "Add offline support for cached galleries",
      "status": "completed",
      "activeForm": "Adding offline support for cached galleries"
    },
    {
      "content": "Implement home screen shortcuts for frequent galleries",
      "status": "completed",
      "activeForm": "Implementing home screen shortcuts for frequent galleries"
    }
  ]
}

Let me verify the App.tsx looks correct:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\App.tsx"
}

Now let me verify the hooks/index.ts export looks correct:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\index.ts",
  "offset": 320
}

Now let me verify that the PWAProvider uses the ThemeProvider properly by checking if useTheme is available:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\useTheme.ts",
  "limit": 50
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\useTheme.tsx",
  "limit": 80
}

I see that the useTheme hook doesn't have a ThemeProvider context. Let me check if there's a ThemeProvider exported from this file:

🔧 Tool: Grep
Input: {
  "pattern": "ThemeProvider",
  "path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\useTheme.tsx",
  "output_mode": "content"
}

The ThemeProvider exists. Now I need to update the PWAContext to handle the case where ThemeProvider might not have context yet or get the theme from the hook directly:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\useTheme.tsx",
  "offset": 110
}

The PWAContext uses `useTheme` directly which is fine. Let me update the PWAContext to use `useTheme` directly instead of trying to use a context that might not exist:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\contexts\\PWAContext.tsx",
  "limit": 50
}

Good, `useTheme` is already being used directly. Now let me verify the imports in the hooks index file:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\index.ts",
  "limit": 10
}

Good, the exports are correct. Let me now run a TypeScript check to verify everything compiles:

🔧 Tool: Bash
Input: {
  "command": "cd C:\\Users\\admin\\Desktop\\RawDrive2\\frontend && npx tsc --noEmit --skipLibCheck 2>&1 | head -50",
  "description": "Check TypeScript compilation",
  "timeout": 120000
}

🔧 Tool: Bash
Input: {
  "command": "cd /c/Users/admin/Desktop/RawDrive2/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | head -100",
  "description": "Check TypeScript compilation",
  "timeout": 120000
}

The TypeScript errors are from other parts of the codebase, not from my changes. The PWA-related files I created should be correct. Let me check if my specific files have any errors:

🔧 Tool: Bash
Input: {
  "command": "cd /c/Users/admin/Desktop/RawDrive2/frontend && npx tsc --noEmit --skipLibCheck src/hooks/usePWA.ts src/hooks/useGalleryGestures.ts src/hooks/useOfflineGallery.ts src/components/ui/PWAInstallPrompt.tsx src/components/ui/OfflineIndicator.tsx src/contexts/PWAContext.tsx 2>&1",
  "description": "Check PWA-related TypeScript files",
  "timeout": 60000
}

These are configuration errors related to the TSC being called outside the project's tsconfig context. The actual app should work fine when built with Vite. Let me fix the one actual issue - the NavigatorWithShare interface:

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\usePWA.ts",
  "old_string": "/**\n * Navigator with share/shortcuts API extensions\n */\ninterface NavigatorWithShare extends Navigator {\n  share?: (data: ShareData) => Promise<void>;\n  getInstalledRelatedApps?: () => Promise<Array<{\n    platform: string;\n    url: string;\n    id?: string;\n  }>>;\n}",
  "new_string": "/**\n * Navigator with share/shortcuts API extensions\n */\ninterface NavigatorWithShare {\n  share?: (data: ShareData) => Promise<void>;\n  getInstalledRelatedApps?: () => Promise<Array<{\n    platform: string;\n    url: string;\n    id?: string;\n  }>>;\n}"
}

I need to fix the TypeScript error in usePWA.ts. Let me read the file and apply the fix.

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\usePWA.ts"
}

Now I'll fix the TypeScript error by removing the `extends Navigator` from the interface definition, since Navigator already has `share` as a required property in newer TypeScript types:

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\usePWA.ts",
  "old_string": "/**\n * Navigator with share/shortcuts API extensions\n */\ninterface NavigatorWithShare extends Navigator {\n  share?: (data: ShareData) => Promise<void>;\n  getInstalledRelatedApps?: () => Promise<Array<{\n    platform: string;\n    url: string;\n    id?: string;\n  }>>;\n}",
  "new_string": "/**\n * Navigator with share/shortcuts API extensions\n */\ninterface NavigatorWithShare {\n  share?: (data: ShareData) => Promise<void>;\n  getInstalledRelatedApps?: () => Promise<Array<{\n    platform: string;\n    url: string;\n    id?: string;\n  }>>;\n}"
}

Now let me run TypeScript check again to verify the fix:

🔧 Tool: Bash
Input: {
  "command": "cd C:\\Users\\admin\\Desktop\\RawDrive2\\frontend && npx tsc --noEmit 2>&1 | head -50",
  "description": "Check TypeScript compilation for PWA-related errors"
}

🔧 Tool: Bash
Input: {
  "command": "cd /c/Users/admin/Desktop/RawDrive2/frontend && npx tsc --noEmit 2>&1 | head -50",
  "description": "Check TypeScript compilation for PWA-related errors"
}

The TypeScript errors shown are pre-existing issues in the codebase related to album-design and portfolio-recommendations components - they are **not** related to the PWA changes I implemented. Let me verify that my PWA files have no errors by checking specifically for them:

🔧 Tool: Bash
Input: {
  "command": "cd /c/Users/admin/Desktop/RawDrive2/frontend && npx tsc --noEmit 2>&1 | grep -E \"(usePWA|PWAInstall|PWAContext|OfflineIndicator|useOfflineGallery|useGalleryGestures|GalleryShortcut)\" || echo \"No PWA-related TypeScript errors found\"",
  "description": "Check for PWA-specific TypeScript errors"
}

All PWA-related files are free of TypeScript errors. Let me update the todo list and provide a final summary:

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Create usePWA hook for install prompts and platform detection",
      "status": "completed",
      "activeForm": "Creating usePWA hook"
    },
    {
      "content": "Create PWAInstallPrompt component for iOS/Android",
      "status": "completed",
      "activeForm": "Creating PWAInstallPrompt component"
    },
    {
      "content": "Create useGalleryGestures hook for touch gestures",
      "status": "completed",
      "activeForm": "Creating useGalleryGestures hook"
    },
    {
      "content": "Create PWAContext for status bar integration",
      "status": "completed",
      "activeForm": "Creating PWAContext"
    },
    {
      "content": "Create useOfflineGallery hook for offline caching",
      "status": "completed",
      "activeForm": "Creating useOfflineGallery hook"
    },
    {
      "content": "Create GalleryShortcut component for home screen shortcuts",
      "status": "completed",
      "activeForm": "Creating GalleryShortcut component"
    },
    {
      "content": "Fix NavigatorWithShare TypeScript error",
      "status": "completed",
      "activeForm": "Fixing TypeScript error"
    }
  ]
}

## Summary: PWA Mobile Experience Enhancement Implementation

I've successfully implemented all 5 features requested for enhancing the PWA mobile experience:

### 1. iOS/Android App Install Prompts with Custom Icons
**Files created:**
- `frontend/src/hooks/usePWA.ts` - Core PWA hook with platform detection, install state management, BeforeInstallPromptEvent handling
- `frontend/src/components/ui/PWAInstallPrompt.tsx` - Custom install UI with iOS-specific instructions and Android/Chrome prompt handling

**Features:**
- Detects iOS/Android/Chrome/Safari/Firefox/Edge platforms
- Shows custom install banner with dismiss/install options
- iOS-specific share sheet instructions modal
- Remembers user dismissal for 1 week
- Auto-prompt capability with configurable delay

### 2. Touch Gesture Support (Pinch-Zoom, Swipe Navigation)
**File created:**
- `frontend/src/hooks/useGalleryGestures.ts` - Comprehensive gesture hook using @use-gesture/react

**Features:**
- Pinch-to-zoom with min/max scale constraints
- Double-tap zoom (toggles 1x ↔ 2x)
- Swipe navigation between images (with velocity threshold)
- Pan when zoomed (with bounds clamping)
- Pull-to-refresh gesture
- Edge swipe detection (for exiting fullscreen)
- Momentum-based scrolling

### 3. Native Status Bar Integration
**File created:**
- `frontend/src/contexts/PWAContext.tsx` - PWA context provider with status bar management

**Features:**
- Theme-aware status bar color syncing
- `setDarkStatusBar()`, `setLightStatusBar()`, `setImmersiveStatusBar()` functions
- Haptic feedback via `vibrate()` API
- Wake Lock API for keeping screen on during presentations
- Proper meta tags for iOS and Android

**Updated:**
- `frontend/index.html` - Added comprehensive PWA meta tags for iOS/Android status bar styling

### 4. Offline Support for Cached Galleries
**Files created:**
- `frontend/src/hooks/useOfflineGallery.ts` - Offline gallery caching with IndexedDB + Cache API
- `frontend/src/components/ui/OfflineIndicator.tsx` - Network status UI components

**Features:**
- IndexedDB storage for gallery metadata (name, description, assets info)
- Cache API for asset caching (thumbnails, optimized images)
- Automatic sync when online with last-synced tracking
- Cache size management with LRU eviction
- Network status indicators (offline banner, "reconnected" toast)
- Supports cache expiration (7-day default)

**Updated:**
- `frontend/vite.config.ts` - Enhanced Service Worker caching strategies for galleries and media

### 5. Home Screen Shortcuts for Frequent Galleries
**File created:**
- `frontend/src/components/features/gallery/GalleryShortcut.tsx` - Shortcut UI components

**Features:**
- `GalleryShortcutButton` - Add/remove gallery shortcuts (icon, button, menu-item variants)
- `GalleryShortcutsList` - Display saved shortcuts with quick access
- iOS share sheet integration for adding to home screen
- LocalStorage persistence for shortcut data
- Custom gallery icons support

**Updated:**
- `frontend/vite.config.ts` - Added PWA manifest shortcuts (My Galleries, Upload Photos, Clients)

### Integration Points Updated:
- `frontend/src/hooks/index.ts` - Exported all new hooks and types
- `frontend/src/contexts/index.ts` - Exported PWAContext
- `frontend/src/components/ui/index.ts` - Exported all new UI components
- `frontend/src/App.tsx` - Integrated PWAProvider, ThemeProvider, PWAInstallPrompt, OfflineIndicator

### TypeScript Fix Applied:
- Fixed `NavigatorWithShare` interface error in `usePWA.ts` by removing the `extends Navigator` clause