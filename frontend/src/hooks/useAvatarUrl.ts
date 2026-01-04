/**
 * useAvatarUrl Hook
 *
 * Resolves avatar URLs that may be relative authenticated API paths
 * into displayable blob URLs. This is necessary because the backend
 * stores avatar_url as paths like `/api/v1/users/me/avatar/original`
 * which require authentication headers that <img> tags cannot provide.
 *
 * Usage:
 *   const resolvedUrl = useAvatarUrl(user.avatarUrl);
 *   return <img src={resolvedUrl} />;
 */

import { useState, useEffect } from 'react';
import { getStoredTokens } from '../services/auth';
import { API_BASE_URL } from '../services/api';

/**
 * Resolves an avatar URL to a displayable blob URL.
 *
 * @param avatarUrl - The avatar URL (can be absolute, relative, null, or undefined)
 * @returns A resolved URL that can be used in <img src>, or undefined if no avatar
 */
export function useAvatarUrl(avatarUrl: string | null | undefined): string | undefined {
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let revoked: string | null = null;

    async function resolveAvatar() {
      // No avatar URL provided
      if (!avatarUrl) {
        setResolvedUrl(undefined);
        return;
      }

      // Public/absolute URLs can be used directly
      if (/^https?:\/\//i.test(avatarUrl)) {
        setResolvedUrl(avatarUrl);
        return;
      }

      // Relative URL - need to fetch with auth
      const tokens = getStoredTokens();
      if (!tokens?.accessToken) {
        setResolvedUrl(undefined);
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/v1/users/me/avatar/stream?size=original&ts=${Date.now()}`,
          {
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
            },
          }
        );

        // 204 = no avatar uploaded
        if (response.status === 204) {
          setResolvedUrl(undefined);
          return;
        }

        if (!response.ok) {
          setResolvedUrl(undefined);
          return;
        }

        const blob = await response.blob();
        if (!blob.size) {
          setResolvedUrl(undefined);
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        revoked = objectUrl;
        setResolvedUrl(objectUrl);
      } catch (error) {
        console.warn('[useAvatarUrl] Failed to load avatar', error);
        setResolvedUrl(undefined);
      }
    }

    resolveAvatar();

    // Cleanup: revoke blob URL when effect re-runs or unmounts
    return () => {
      if (revoked) {
        URL.revokeObjectURL(revoked);
      }
    };
  }, [avatarUrl]);

  return resolvedUrl;
}
