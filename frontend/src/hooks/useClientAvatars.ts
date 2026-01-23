import { useState, useEffect, useRef } from 'react';
import { clientService } from '../services/clientService';
import type { ClientListItem } from '../types/client';

interface UseClientAvatarsReturn {
    avatarBlobUrls: Record<string, string>;
    isLoading: boolean;
}

/**
 * Hook to manage avatar blob URLs for a list of clients.
 * Handles fetching for multiple clients and ensures proper cleanup of object URLs.
 */
export const useClientAvatars = (
    workspaceId: string | undefined,
    clients: ClientListItem[],
    size: number = 256
): UseClientAvatarsReturn => {
    const [avatarBlobUrls, setAvatarBlobUrls] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(false);

    // Ref to track all current blob URLs for cleanup
    const avatarBlobUrlsRef = useRef<Record<string, string>>({});

    // Sync ref with state and handle component unmount cleanup
    useEffect(() => {
        avatarBlobUrlsRef.current = avatarBlobUrls;
        return () => {
            // Cleanup all blob URLs on unmount
            Object.values(avatarBlobUrlsRef.current).forEach((url) => {
                URL.revokeObjectURL(url);
            });
        };
    }, [avatarBlobUrls]);

    useEffect(() => {
        if (!workspaceId || clients.length === 0) {
            // If clients list is emptied, clean up blob URLs using the ref (always current)
            const currentBlobUrls = avatarBlobUrlsRef.current;
            if (Object.keys(currentBlobUrls).length > 0 && clients.length === 0) {
                Object.values(currentBlobUrls).forEach(url => URL.revokeObjectURL(url));
                setAvatarBlobUrls({});
            }
            return;
        }

        const fetchAvatarBlobUrls = async () => {
            setIsLoading(true);

            // Get current client IDs from the list
            const currentClientIds = new Set(clients.map((c) => c.client_id));

            // 1. Cleanup: Revoke and remove blob URLs for clients no longer in the list
            const oldBlobUrls = { ...avatarBlobUrlsRef.current };
            let hasChanges = false;

            Object.keys(oldBlobUrls).forEach((clientId) => {
                if (!currentClientIds.has(clientId)) {
                    URL.revokeObjectURL(oldBlobUrls[clientId]);
                    delete oldBlobUrls[clientId];
                    hasChanges = true;
                }
            });

            // 2. Identify clients that need avatars fetched
            // (Has avatar_url AND not already in our blobs list)
            const clientsWithAvatars = clients.filter(
                (c) => c.avatar_url && !oldBlobUrls[c.client_id]
            );

            // TEMPORARY DEBUG LOGGING
            console.log('[DEBUG useClientAvatars] Clients with avatars to fetch:',
                clientsWithAvatars.map(c => ({
                    full_name: c.full_name,
                    client_id: c.client_id,
                    avatar_url: c.avatar_url,
                }))
            );
            console.log('[DEBUG useClientAvatars] Total clients processed:', clients.length);

            if (clientsWithAvatars.length === 0) {
                if (hasChanges) {
                    setAvatarBlobUrls(oldBlobUrls);
                }
                setIsLoading(false);
                return;
            }

            // 3. Fetch missing avatars in parallel
            const newBlobUrls: Record<string, string> = { ...oldBlobUrls };

            await Promise.all(
                clientsWithAvatars.map(async (client) => {
                    try {
                        const blobUrl = await clientService.getAvatarBlobUrl(
                            workspaceId,
                            client.client_id,
                            size
                        );

                        // TEMPORARY DEBUG LOGGING
                        console.log(`[DEBUG useClientAvatars] Avatar fetch result for ${client.full_name}:`, {
                            client_id: client.client_id,
                            success: blobUrl !== null && blobUrl !== undefined,
                            blob_url_length: blobUrl?.length,
                            blob_url_preview: blobUrl?.substring(0, 80)
                        });

                        if (blobUrl) {
                            newBlobUrls[client.client_id] = blobUrl;
                        }
                    } catch (err) {
                        console.error(`[DEBUG useClientAvatars] ERROR for ${client.full_name}:`, {
                            client_id: client.client_id,
                            error: err instanceof Error ? err.message : String(err)
                        });
                    }
                })
            );

            setAvatarBlobUrls(newBlobUrls);
            setIsLoading(false);
        };

        fetchAvatarBlobUrls();
    }, [workspaceId, clients, size]); // re-run if clients list changes

    return {
        avatarBlobUrls,
        isLoading
    };
};
