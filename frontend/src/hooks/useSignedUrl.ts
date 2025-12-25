import { useState, useEffect, useCallback } from 'react';
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
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const fetchUrl = useCallback(async () => {
    if (!assetId || !workspace?.workspace_id || !enabled) {
      if (mounted) setUrl(null);
      return;
    }

    if (mounted) {
      setLoading(true);
      setError(null);
    }

    try {
      let signedUrl: string | null = null;
      if (download) {
         // Downloads usually bypass batching or are specific actions, 
         // but context supports variant. Download flag isn't in context logic explicitly
         // Context signature: getSignedUrl(id, variant). 
         // My context implementation ignored 'download'.
         // I should probably fix context to support download if needed, 
         // OR just use service directly for downloads (which is rare/onclick).
         // Since this hook is mostly for display (thumbnail/preview), context is fine.
         // If download=true, use service directly?
         signedUrl = await signedUrlService.getSignedUrl(workspace.workspace_id, assetId, variant, true);
      } else {
         signedUrl = await context.getSignedUrl(assetId, variant);
      }
      
      if (mounted) setUrl(signedUrl);
    } catch (err) {
      if (mounted) {
        const error = err instanceof Error ? err : new Error('Failed to fetch signed URL');
        setError(error);
        setUrl(null);
      }
    } finally {
      if (mounted) setLoading(false);
    }
  }, [assetId, workspace?.workspace_id, variant, download, enabled, context, mounted]);

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

