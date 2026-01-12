import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PWAUpdateEvent extends CustomEvent {
  detail: {
    updateSW: (reloadPage?: boolean) => Promise<void>;
  };
}

/**
 * PWA Update Notification Component
 *
 * Displays a non-intrusive notification when a new version of the app is available.
 * Listens for the 'pwa-update-available' custom event dispatched by the service worker.
 */
export function PWAUpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [updateFn, setUpdateFn] = useState<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const pwaEvent = event as PWAUpdateEvent;
      setUpdateFn(() => pwaEvent.detail.updateSW);
      setShowUpdate(true);
    };

    window.addEventListener('pwa-update-available', handleUpdate);

    return () => {
      window.removeEventListener('pwa-update-available', handleUpdate);
    };
  }, []);

  // Auto-dismiss after 30 seconds
  useEffect(() => {
    if (showUpdate) {
      const timer = setTimeout(() => {
        setShowUpdate(false);
      }, 30000);

      return () => clearTimeout(timer);
    }
  }, [showUpdate]);

  const handleUpdate = useCallback(async () => {
    if (updateFn) {
      setIsUpdating(true);
      try {
        await updateFn(true);
      } catch (error) {
        console.error('Failed to update:', error);
        setIsUpdating(false);
      }
    }
  }, [updateFn]);

  const handleDismiss = useCallback(() => {
    setShowUpdate(false);
  }, []);

  return (
    <AnimatePresence>
      {showUpdate && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50"
        >
          <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 p-2 bg-blue-500/20 rounded-lg">
                <RefreshCw className="h-5 w-5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-white">
                  Update Available
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  A new version of RawDrive is ready. Update now for the latest features and improvements.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleUpdate}
                    disabled={isUpdating}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                  >
                    {isUpdating ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        Update Now
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDismiss}
                    disabled={isUpdating}
                    className="px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-white disabled:opacity-50 transition-colors"
                  >
                    Later
                  </button>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                disabled={isUpdating}
                className="flex-shrink-0 p-1 text-slate-500 hover:text-white disabled:opacity-50 transition-colors"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
