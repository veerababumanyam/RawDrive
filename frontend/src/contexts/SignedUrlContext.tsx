import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { signedUrlService } from '../services/signedUrlService';

interface SignedUrlRequest {
  assetId: string;
  variant: 'thumbnail' | 'preview' | 'original';
  resolve: (url: string | null) => void;
  reject: (err: Error) => void;
}

interface SignedUrlContextType {
  getSignedUrl: (assetId: string, variant?: 'thumbnail' | 'preview' | 'original') => Promise<string | null>;
}

const SignedUrlContext = createContext<SignedUrlContextType | null>(null);

export const useSignedUrlContext = () => {
  const context = useContext(SignedUrlContext);
  if (!context) {
    throw new Error('useSignedUrlContext must be used within a SignedUrlProvider');
  }
  return context;
};

interface SignedUrlProviderProps {
  children: React.ReactNode;
}

export const SignedUrlProvider: React.FC<SignedUrlProviderProps> = ({ children }) => {
  const { workspace } = useAuth();
  const queueRef = useRef<SignedUrlRequest[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  

  const processQueue = useCallback(async () => {
    if (queueRef.current.length === 0 || !workspace?.workspace_id) {
      return;
    }

    // Take current batch
    const batch = queueRef.current;
    queueRef.current = [];

    // Group by variant to batch efficiently if service supports it
    // Currently service supports list of IDs, assuming same variant?
    // Service signature: getSignedUrls(workspaceId, assetIds, variant)
    // So we must group by variant.

    const byVariant: Record<string, SignedUrlRequest[]> = {};
    batch.forEach(req => {
      if (!byVariant[req.variant]) byVariant[req.variant] = [];
      byVariant[req.variant].push(req);
    });

    // Process each variant group
    for (const [variant, requests] of Object.entries(byVariant)) {
        const assetIds = requests.map(r => r.assetId);

        try {
            // Call service batch endpoint (or simulated batch)
            const urlMap = await signedUrlService.getSignedUrls(
                workspace.workspace_id,
                assetIds,
                variant as 'thumbnail' | 'preview' | 'original'
            );

            // Resolve promises individually - handle per-asset failures gracefully
            requests.forEach(req => {
                const url = urlMap.get(req.assetId);
                if (url) {
                    req.resolve(url);
                } else {
                    // Asset wasn't in the response - resolve with null instead of rejecting
                    // This allows the component to handle missing URLs gracefully
                    req.resolve(null);
                }
            });
        } catch (error) {
            // Batch fetch failed entirely (e.g., network error)
            // Reject all in this batch, but individual asset errors above are handled gracefully
            const err = error instanceof Error ? error : new Error('Batch fetch failed');
            requests.forEach(req => req.reject(err));
        }
    }
  }, [workspace?.workspace_id]);

  // Use a ref to always have the latest processQueue function
  // This avoids stale closure issues when the timeout fires
  const processQueueRef = useRef(processQueue);
  processQueueRef.current = processQueue;

  const scheduleProcess = useCallback(() => {
    if (timeoutRef.current) {
      return;
    }
    timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        // Use ref to get the latest processQueue function
        processQueueRef.current();
    }, 50); // 50ms debounce
  }, []); // No dependencies - uses ref for latest processQueue

  const getSignedUrl = useCallback((assetId: string, variant: 'thumbnail' | 'preview' | 'original' = 'thumbnail'): Promise<string | null> => {
     return new Promise((resolve, reject) => {
         queueRef.current.push({ assetId, variant, resolve, reject });

         // Trigger processing
         if (queueRef.current.length >= 20) {
             if (timeoutRef.current) {
                 clearTimeout(timeoutRef.current);
                 timeoutRef.current = null;
             }
             processQueue();
         } else {
             scheduleProcess();
         }
     });
  }, [processQueue, scheduleProcess]);

  // Clean up on unmount
  useEffect(() => {
      return () => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
      };
  }, []);

  return (
    <SignedUrlContext.Provider value={{ getSignedUrl }}>
      {children}
    </SignedUrlContext.Provider>
  );
};
