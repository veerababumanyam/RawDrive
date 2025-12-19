/**
 * useBrowserCloseWarning Hook
 * Warns user before closing browser/tab when uploads are in progress
 * Shows browser's native confirmation dialog
 */

import { useEffect, useRef } from 'react';

export interface UseBrowserCloseWarningOptions {
  /** Whether uploads are in progress */
  hasActiveUploads: boolean;
  /** Number of active uploads */
  uploadCount?: number;
  /** Custom warning message */
  message?: string;
}

/**
 * Hook to warn user before closing browser when uploads are in progress
 */
export function useBrowserCloseWarning({
  hasActiveUploads,
  uploadCount = 0,
  message,
}: UseBrowserCloseWarningOptions): void {
  const hasActiveUploadsRef = useRef(hasActiveUploads);
  const uploadCountRef = useRef(uploadCount);

  // Update refs when props change
  useEffect(() => {
    hasActiveUploadsRef.current = hasActiveUploads;
    uploadCountRef.current = uploadCount;
  }, [hasActiveUploads, uploadCount]);

  useEffect(() => {
    if (!hasActiveUploads) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Modern browsers ignore custom messages and show their own
      // But we still need to set returnValue and return a string
      const defaultMessage = uploadCountRef.current > 1
        ? `${uploadCountRef.current} uploads are in progress. Are you sure you want to leave?`
        : '1 upload is in progress. Are you sure you want to leave?';

      const warningMessage = message || defaultMessage;

      // Standard way to trigger browser warning
      event.preventDefault();
      event.returnValue = warningMessage; // For Chrome
      return warningMessage; // For Safari
    };

    // Add event listener
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasActiveUploads, message]);
}
