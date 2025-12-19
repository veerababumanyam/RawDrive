/**
 * useSignedUrl Hook
 * React hook for fetching and managing signed URLs with automatic refresh
 */

import { useState, useEffect, useCallback } from 'react';
import { galleryService } from '../services/galleryService';
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
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchUrl = useCallback(async () => {
    if (!assetId || !workspace?.workspace_id || !enabled) {
      setUrl(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const signedUrl = await galleryService.getSignedUrl(
        workspace.workspace_id,
        assetId,
        variant,
        download
      );
      setUrl(signedUrl);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch signed URL');
      setError(error);
      setUrl(null);
    } finally {
      setLoading(false);
    }
  }, [assetId, workspace?.workspace_id, variant, download, enabled]);

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

