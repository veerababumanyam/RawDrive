import { useState, useEffect, useRef, useCallback } from 'react';
import { clientService } from '../services/clientService';

interface UseClientAvatarProps {
    workspaceId: string | undefined;
    clientId: string | undefined;
    avatarUrl: string | null | undefined;
    size?: number;
}

interface UseClientAvatarReturn {
    avatarBlobUrl: string | null;
    isLoading: boolean;
    error: Error | null;
    refreshAvatar: () => Promise<void>;
    resetAvatar: () => void;
}

/**
 * Hook to manage the lifecycle of a client's avatar blob URL.
 * Handles fetching, caching, and revoking object URLs to prevent memory leaks.
 */
export const useClientAvatar = ({
    workspaceId,
    clientId,
    avatarUrl,
    size = 256
}: UseClientAvatarProps): UseClientAvatarReturn => {
    const [avatarBlobUrl, setAvatarBlobUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    // Ref to track the current blob URL for cleanup
    const blobUrlRef = useRef<string | null>(null);

    // Cleanup function to revoke the current blob URL
    const revokeCurrentUrl = useCallback(() => {
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }
    }, []);

    // Effect to handle blob URL lifecycle
    useEffect(() => {
        // Sync ref
        blobUrlRef.current = avatarBlobUrl;

        return () => {
            // Cleanup on unmount or when dependencies change
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
            }
        };
    }, [avatarBlobUrl]);

    // Fetch avatar blob
    const fetchAvatar = useCallback(async () => {
        // If no avatar URL (client has no avatar), clear state and return
        if (!avatarUrl) {
            revokeCurrentUrl();
            setAvatarBlobUrl(null);
            return;
        }

        if (!workspaceId || !clientId) return;

        setIsLoading(true);
        setError(null);

        try {
            const blobUrl = await clientService.getAvatarBlobUrl(workspaceId, clientId, size);

            if (blobUrl) {
                // Revoke previous URL before setting new one
                revokeCurrentUrl();
                setAvatarBlobUrl(blobUrl);
            }
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to fetch avatar'));
            console.error('Failed to fetch avatar:', err);
        } finally {
            setIsLoading(false);
        }
    }, [workspaceId, clientId, avatarUrl, size, revokeCurrentUrl]);

    // Initial fetch when dependencies change
    useEffect(() => {
        fetchAvatar();
    }, [fetchAvatar]);

    // Manual refresh (e.g., after upload)
    const refreshAvatar = useCallback(async () => {
        // Determine context for refresh - difficult without passing "hasAvatar" explicitly updated
        // For now, we force a fetch if we have IDs, assuming caller knows avatar exists/updated
        if (!workspaceId || !clientId) return;

        setIsLoading(true);
        try {
            const blobUrl = await clientService.getAvatarBlobUrl(workspaceId, clientId, size);
            if (blobUrl) {
                revokeCurrentUrl();
                setAvatarBlobUrl(blobUrl);
            }
        } catch (err) {
            console.error('Failed to refresh avatar:', err);
        } finally {
            setIsLoading(false);
        }
    }, [workspaceId, clientId, size, revokeCurrentUrl]);

    const resetAvatar = useCallback(() => {
        revokeCurrentUrl();
        setAvatarBlobUrl(null);
    }, [revokeCurrentUrl]);

    return {
        avatarBlobUrl,
        isLoading,
        error,
        refreshAvatar,
        resetAvatar
    };
};
