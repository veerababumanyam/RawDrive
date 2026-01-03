/**
 * ChunkLoadErrorHandler
 * 
 * Global error handler for unhandled chunk load errors that occur outside
 * of React's error boundary (e.g., during lazy loading before component mounts).
 * 
 * This catches errors like "Failed to fetch dynamically imported module" 
 * which happen when users have a stale cached version after a deployment.
 */

import { useEffect, useState } from 'react';

// Track if we've already shown the refresh prompt to avoid duplicates
let hasShownRefreshPrompt = false;

/**
 * Check if an error is a chunk load error
 */
const isChunkLoadError = (error: Error | string): boolean => {
  const message = typeof error === 'string' ? error.toLowerCase() : (error?.message?.toLowerCase() || '');
  
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('loading chunk') ||
    message.includes('loading css chunk') ||
    message.includes('dynamically imported module') ||
    message.includes('importing a module script failed')
  );
};

/**
 * Hook to handle chunk load errors globally.
 * When detected, shows a notification that the app has been updated.
 * 
 * @returns Object with showRefreshPrompt state and dismiss function
 */
export const useChunkLoadErrorHandler = () => {
  const [showRefreshPrompt, setShowRefreshPrompt] = useState(false);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (hasShownRefreshPrompt) return;
      
      if (event.error && isChunkLoadError(event.error)) {
        event.preventDefault();
        hasShownRefreshPrompt = true;
        setShowRefreshPrompt(true);
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (hasShownRefreshPrompt) return;
      
      const reason = event.reason;
      if (reason && (isChunkLoadError(reason) || isChunkLoadError(reason?.message || ''))) {
        event.preventDefault();
        hasShownRefreshPrompt = true;
        setShowRefreshPrompt(true);
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  const handleRefresh = () => {
    window.location.reload();
  };

  const dismissPrompt = () => {
    setShowRefreshPrompt(false);
  };

  return {
    showRefreshPrompt,
    handleRefresh,
    dismissPrompt,
  };
};

/**
 * Component that shows a floating notification when a chunk load error is detected.
 * Place this at the root of your app (e.g., in RootLayout or App.tsx).
 */
export const ChunkLoadErrorNotification: React.FC = () => {
  const { showRefreshPrompt, handleRefresh, dismissPrompt } = useChunkLoadErrorHandler();

  if (!showRefreshPrompt) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        backgroundColor: '#1e293b',
        color: 'white',
        padding: '16px 24px',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        maxWidth: '90vw',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: '4px' }}>
          Update Available
        </div>
        <div style={{ fontSize: '14px', opacity: 0.9 }}>
          A new version is available. Please refresh to continue.
        </div>
      </div>
      <button
        onClick={handleRefresh}
        style={{
          padding: '8px 20px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: 500,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Refresh Now
      </button>
      <button
        onClick={dismissPrompt}
        aria-label="Dismiss"
        style={{
          padding: '4px',
          background: 'transparent',
          border: 'none',
          color: 'white',
          opacity: 0.6,
          cursor: 'pointer',
          fontSize: '18px',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
};

export default ChunkLoadErrorNotification;
