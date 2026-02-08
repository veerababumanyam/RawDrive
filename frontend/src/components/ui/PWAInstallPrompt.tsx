import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  X,
  Smartphone,
  Share,
  Plus,
  ChevronDown,
  Wifi,
  Clock,
  Image,
  Zap,
} from 'lucide-react';
import { usePWA } from '@/hooks/usePWA';

/* =============================================================================
   PWA Install Prompt Component

   Custom install prompt for iOS/Android with platform-specific instructions.
   ============================================================================= */

interface PWAInstallPromptProps {
  /**
   * Whether to show the prompt automatically when available
   * @default true
   */
  autoShow?: boolean;

  /**
   * Custom class name for the container
   */
  className?: string;

  /**
   * Callback when install is triggered
   */
  onInstall?: () => void;

  /**
   * Callback when prompt is dismissed
   */
  onDismiss?: () => void;
}

/**
 * PWA Install Prompt - Shows custom install UI for iOS and Android
 */
export function PWAInstallPrompt({
  autoShow = true,
  className,
  onInstall,
  onDismiss,
}: PWAInstallPromptProps) {
  const {
    platform,
    install,
    displayMode,
    promptInstall,
    showIOSInstallInstructions,
    dismissIOSInstructions,
  } = usePWA();

  const [isVisible, setIsVisible] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);

  // Determine if we should show the prompt
  const shouldShow = autoShow && (
    (install.canInstall && !install.isInstalled) ||
    showIOSInstallInstructions
  );

  // Don't show if already installed or not on supported platform
  if (displayMode !== 'browser' || install.isInstalled) {
    return null;
  }

  // Show prompt after initial render
  React.useEffect(() => {
    if (shouldShow) {
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, [shouldShow]);

  const handleInstall = useCallback(async () => {
    const outcome = await promptInstall();
    onInstall?.();
    if (outcome === 'accepted') {
      setIsVisible(false);
    }
  }, [promptInstall, onInstall]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    dismissIOSInstructions();
    onDismiss?.();
  }, [dismissIOSInstructions, onDismiss]);

  // PWA features list
  const features = [
    { icon: Zap, text: 'Faster loading times' },
    { icon: Wifi, text: 'Works offline' },
    { icon: Image, text: 'Full screen galleries' },
    { icon: Clock, text: 'Background sync' },
  ];

  // iOS-specific instructions
  if (platform.isIOS && showIOSInstallInstructions) {
    return (
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`fixed bottom-0 left-0 right-0 z-50 ${className || ''}`}
          >
            <div className="bg-slate-800 border-t border-slate-700 rounded-t-2xl shadow-2xl mx-auto max-w-lg">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <span className="text-xl font-bold text-white">R</span>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">Install RawDrive</h3>
                    <p className="text-sm text-slate-400">Add to home screen</p>
                  </div>
                </div>
                <button
                  onClick={handleDismiss}
                  className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* iOS Instructions */}
              <div className="p-4 space-y-4">
                <p className="text-slate-300 text-sm">
                  Install RawDrive on your {platform.isIOS ? 'iPhone' : 'device'} for the best experience:
                </p>

                <div className="space-y-3">
                  {/* Step 1 */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                      <span className="text-sm font-medium">1</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm">
                          Tap the <span className="font-semibold">Share</span> button
                        </p>
                        <Share className="w-5 h-5 text-blue-400" />
                      </div>
                      <p className="text-slate-400 text-xs mt-1">
                        At the bottom of your Safari browser
                      </p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                      <span className="text-sm font-medium">2</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm">
                          Scroll and tap <span className="font-semibold">"Add to Home Screen"</span>
                        </p>
                        <Plus className="w-5 h-5 text-blue-400" />
                      </div>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                      <span className="text-sm font-medium">3</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-white text-sm">
                        Tap <span className="font-semibold">"Add"</span> in the top right
                      </p>
                    </div>
                  </div>
                </div>

                {/* Features collapsible */}
                <button
                  onClick={() => setShowFeatures(!showFeatures)}
                  className="w-full flex items-center justify-between text-slate-400 text-sm py-2"
                >
                  <span>Why install?</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${showFeatures ? 'rotate-180' : ''}`}
                  />
                </button>

                <AnimatePresence>
                  {showFeatures && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-2 gap-2 pb-2">
                        {features.map(({ icon: Icon, text }) => (
                          <div
                            key={text}
                            className="flex items-center gap-2 text-xs text-slate-400 bg-slate-700/50 rounded-lg px-3 py-2"
                          >
                            <Icon className="w-4 h-4 text-blue-400" />
                            {text}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Arrow pointing to share button */}
              <div className="relative pb-8">
                <motion.div
                  animate={{ y: [0, 5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute bottom-2 left-1/2 -translate-x-1/2"
                >
                  <ChevronDown className="w-6 h-6 text-blue-400" />
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Android/Chrome install prompt
  if (install.canInstall && !platform.isIOS) {
    return (
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm ${className || ''}`}
          >
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-3 p-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                  <span className="text-xl font-bold text-white">R</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold">Install RawDrive</h3>
                  <p className="text-sm text-slate-400 truncate">
                    Get the full app experience
                  </p>
                </div>
                <button
                  onClick={handleDismiss}
                  className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700 shrink-0"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Features */}
              <div className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {features.map(({ icon: Icon, text }) => (
                    <div
                      key={text}
                      className="flex items-center gap-2 text-xs text-slate-400 bg-slate-700/50 rounded-lg px-3 py-2"
                    >
                      <Icon className="w-4 h-4 text-blue-400 shrink-0" />
                      <span className="truncate">{text}</span>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleDismiss}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-colors"
                  >
                    Not now
                  </button>
                  <button
                    onClick={handleInstall}
                    disabled={install.isInstalling}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
                  >
                    {install.isInstalling ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Installing...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Install
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return null;
}

/* =============================================================================
   Mini Install Banner - Compact banner for header/footer placement
   ============================================================================= */

interface PWAInstallBannerProps {
  className?: string;
  onInstall?: () => void;
  onDismiss?: () => void;
}

export function PWAInstallBanner({
  className,
  onInstall,
  onDismiss,
}: PWAInstallBannerProps) {
  const {
    platform,
    install,
    displayMode,
    promptInstall,
    showIOSInstallInstructions,
    dismissIOSInstructions,
  } = usePWA();

  const [dismissed, setDismissed] = useState(false);

  // Don't show if already installed or dismissed
  if (
    dismissed ||
    displayMode !== 'browser' ||
    install.isInstalled ||
    (!install.canInstall && !showIOSInstallInstructions && !platform.isIOS)
  ) {
    return null;
  }

  const handleInstall = async () => {
    if (platform.isIOS) {
      // iOS doesn't support programmatic install, but we can trigger the modal
      dismissIOSInstructions();
    } else {
      await promptInstall();
    }
    onInstall?.();
  };

  const handleDismiss = () => {
    setDismissed(true);
    dismissIOSInstructions();
    onDismiss?.();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className={`bg-gradient-to-r from-blue-600 to-purple-600 ${className || ''}`}
      >
        <div className="flex items-center justify-between px-4 py-2 max-w-7xl mx-auto">
          <div className="flex items-center gap-2 text-white text-sm">
            <Smartphone className="w-4 h-4" />
            <span className="hidden sm:inline">Install RawDrive for faster access and offline support</span>
            <span className="sm:hidden">Install RawDrive app</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleInstall}
              className="px-3 py-1 text-sm font-medium text-blue-600 bg-white hover:bg-blue-50 rounded-full transition-colors"
            >
              Install
            </button>
            <button
              onClick={handleDismiss}
              className="p-1 text-white/70 hover:text-white transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default PWAInstallPrompt;
