import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi, RefreshCw, Cloud, CloudOff } from 'lucide-react';
import { usePWA } from '@/hooks/usePWA';

/* =============================================================================
   Offline Indicator Component

   Shows network status and provides offline capabilities feedback.
   ============================================================================= */

/**
 * Props for OfflineIndicator
 */
export interface OfflineIndicatorProps {
  /**
   * Position of the indicator
   * @default 'bottom'
   */
  position?: 'top' | 'bottom';

  /**
   * Whether to show when online (for slow connections)
   * @default false
   */
  showOnSlowConnection?: boolean;

  /**
   * Whether to auto-hide when back online
   * @default true
   */
  autoHide?: boolean;

  /**
   * Auto-hide delay in milliseconds
   * @default 3000
   */
  autoHideDelay?: number;

  /**
   * Custom class name
   */
  className?: string;
}

/**
 * Offline Indicator - Shows network status
 */
export function OfflineIndicator({
  position = 'bottom',
  showOnSlowConnection = false,
  autoHide = true,
  autoHideDelay = 3000,
  className,
}: OfflineIndicatorProps) {
  const { network } = usePWA();
  const [visible, setVisible] = React.useState(false);
  const [wasOffline, setWasOffline] = React.useState(false);
  const [showReconnected, setShowReconnected] = React.useState(false);

  // Show indicator when offline or slow connection
  React.useEffect(() => {
    if (!network.isOnline) {
      setVisible(true);
      setWasOffline(true);
      setShowReconnected(false);
    } else if (showOnSlowConnection && network.isSlowConnection) {
      setVisible(true);
    } else if (wasOffline && network.isOnline) {
      // Show "reconnected" message
      setShowReconnected(true);
      setVisible(true);

      if (autoHide) {
        const timer = setTimeout(() => {
          setVisible(false);
          setWasOffline(false);
          setShowReconnected(false);
        }, autoHideDelay);

        return () => clearTimeout(timer);
      }
    } else {
      setVisible(false);
    }
  }, [network.isOnline, network.isSlowConnection, showOnSlowConnection, wasOffline, autoHide, autoHideDelay]);

  // Position classes
  const positionClasses = position === 'top' ? 'top-0' : 'bottom-0';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: position === 'top' ? -50 : 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: position === 'top' ? -50 : 50 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={`fixed left-0 right-0 z-50 ${positionClasses} ${className || ''}`}
        >
          <div
            className={`mx-4 my-2 p-3 rounded-lg shadow-lg backdrop-blur-sm ${
              showReconnected
                ? 'bg-green-500/90 text-white'
                : !network.isOnline
                ? 'bg-red-500/90 text-white'
                : 'bg-yellow-500/90 text-black'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              {showReconnected ? (
                <>
                  <Wifi className="w-5 h-5" />
                  <span className="text-sm font-medium">Back online</span>
                </>
              ) : !network.isOnline ? (
                <>
                  <WifiOff className="w-5 h-5" />
                  <span className="text-sm font-medium">You're offline</span>
                  <span className="text-sm opacity-80">- Viewing cached content</span>
                </>
              ) : network.isSlowConnection ? (
                <>
                  <Wifi className="w-5 h-5" />
                  <span className="text-sm font-medium">Slow connection detected</span>
                </>
              ) : null}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Compact network status badge
 */
export interface NetworkStatusBadgeProps {
  className?: string;
  showWhenOnline?: boolean;
}

export function NetworkStatusBadge({ className, showWhenOnline = false }: NetworkStatusBadgeProps) {
  const { network } = usePWA();

  if (network.isOnline && !showWhenOnline) {
    return null;
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
        network.isOnline
          ? network.isSlowConnection
            ? 'bg-yellow-500/20 text-yellow-400'
            : 'bg-green-500/20 text-green-400'
          : 'bg-red-500/20 text-red-400'
      } ${className || ''}`}
    >
      {network.isOnline ? (
        network.isSlowConnection ? (
          <>
            <Wifi className="w-3 h-3" />
            <span>Slow</span>
          </>
        ) : (
          <>
            <Cloud className="w-3 h-3" />
            <span>Online</span>
          </>
        )
      ) : (
        <>
          <CloudOff className="w-3 h-3" />
          <span>Offline</span>
        </>
      )}
    </div>
  );
}

/**
 * Offline Mode Banner - For pages that have offline support
 */
export interface OfflineModeBannerProps {
  onRefresh?: () => void;
  className?: string;
}

export function OfflineModeBanner({ onRefresh, className }: OfflineModeBannerProps) {
  const { network } = usePWA();
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  if (network.isOnline) {
    return null;
  }

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      onRefresh?.();
      // Wait a bit for visual feedback
      await new Promise(resolve => setTimeout(resolve, 1000));
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className={`bg-slate-800 border border-slate-700 rounded-lg p-4 ${className || ''}`}>
      <div className="flex items-start gap-3">
        <div className="p-2 bg-amber-500/20 rounded-lg shrink-0">
          <WifiOff className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-white font-medium">Viewing Cached Content</h3>
          <p className="text-sm text-slate-400 mt-1">
            You're currently offline. Some features may be limited, but you can still browse previously viewed galleries.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Checking...' : 'Retry Connection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OfflineIndicator;
