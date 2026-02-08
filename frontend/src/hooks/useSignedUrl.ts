import { useState, useEffect, useCallback, useRef } from 'react';
import { useSignedUrlContext } from '../contexts/SignedUrlContext';
import { signedUrlService } from '../services/signedUrlService';
import { useAuth } from '../contexts/AuthContext';

interface UseSignedUrlOptions {
  assetId: string | null | undefined;
  variant?: 'thumbnail' | 'preview' | 'original';
  download?: boolean;
  enabled?: boolean;
}

interface UseSignedUrlReturn {
  url: string | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export const useSignedUrl = ({
  assetId,
  variant = 'thumbnail',
  download = false,
  enabled = true,
}: UseSignedUrlOptions): UseSignedUrlReturn => {
  const { workspace } = useAuth();
  
  // Try to use context, but don't fail if not present (backward compatibility/testing)
  // We can't conditionally call hooks, so we must always call useSignedUrlContext or check validity
  // But useSignedUrlContext throws if no provider.
  // So we need to handle that.
  // Actually, let's assume provider is present for now, or catch the error?
  // Standard practice: Export context, use useContext(Context).
  // But we defined useSignedUrlContext to throw.
  // Let's modify hook imports to import the Context directly if we want safe fallback.
  // Since we control codebase, let's enforce provider for best practice, or just use service if not.
  
  // Wait, I can't import Context directly easily since I didn't export it in my file content above.
  // I only exported useSignedUrlContext.
  // Let's rely on useSignedUrlContext and assume the app will hold the provider.
  // BUT existing tests might break.
  // I should probably check if I can wrap tests or make hook robust.
  
  // Let's modify the Plan: The hook will use the service directly if context not found? No, that requires check.
  // Safest: Use try/catch context? No hooks don't work like that.
  
  // Let's refactor: I will update tests to include provider.
  // For production code, I will use context.
  
  const context = useSignedUrlContext();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track abort controller to cancel in-flight requests on unmount/rapid updates
  const abortControllerRef = useRef<AbortController | null>(null);

  // Use ref to track mount status - avoids re-render loops
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Cancel any in-flight request on unmount
      abortControllerRef.current?.abort();
    };
  }, []);

  const fetchUrl = useCallback(async () => {
    // Cancel any previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    if (!assetId || !workspace?.workspace_id || !enabled) {
      if (mountedRef.current) setUrl(null);
      return;
    }

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      let signedUrl: string | null = null;
      if (download) {
         // Downloads bypass batching - use service directly
         signedUrl = await signedUrlService.getSignedUrl(
           workspace.workspace_id,
           assetId,
           variant,
           true
         );
      } else {
         // Use context for batched fetching
         signedUrl = await context.getSignedUrl(assetId, variant);
      }

      if (mountedRef.current) setUrl(signedUrl);
    } catch (err) {
      // Ignore AbortError - request was cancelled
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      if (mountedRef.current) {
        const error = err instanceof Error ? err : new Error('Failed to fetch signed URL');
        setError(error);
        setUrl(null);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [assetId, workspace?.workspace_id, variant, download, enabled, context]);

  useEffect(() => {
    fetchUrl();
  }, [fetchUrl]);

  return {
    url,
    loading,
    error,
    refresh: fetchUrl,
  };
};

