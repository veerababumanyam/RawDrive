"use client";

/**
 * useAuthToken — React hook that provides a fresh access token with auto-refresh.
 *
 * Fixes Issue #3/#4: token expiry causes 401 errors across the app because
 * API modules capture the token at render time. This hook returns a getter
 * function that always returns the current token, refreshing if needed.
 *
 * Usage:
 *   const { token, getToken } = useAuthToken();
 *   // `token` for initial render (may be stale for long-lived pages)
 *   // `getToken()` for just-in-time fresh token (recommended for API calls)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getStoredAccessToken,
  getStoredAccessTokenClaims,
  refreshAuthSession,
} from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/** Returns true if the token expires within the given buffer (seconds). */
function isExpiringSoon(bufferSeconds = 60): boolean {
  const claims = getStoredAccessTokenClaims();
  if (!claims) return true;
  const raw = claims as Record<string, unknown>;
  const exp = typeof raw.exp === "number" ? raw.exp : 0;
  if (!exp) return false; // no exp claim — can't determine
  return Date.now() / 1000 > exp - bufferSeconds;
}

export function useAuthToken() {
  const [token, setToken] = useState(() => getStoredAccessToken());
  const refreshingRef = useRef(false);

  // Sync token state if it changes externally (e.g., another tab refreshed)
  useEffect(() => {
    const interval = setInterval(() => {
      const current = getStoredAccessToken();
      if (current !== token) {
        setToken(current);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [token]);

  /**
   * Returns a fresh token, refreshing proactively if it's about to expire.
   * Use this for API calls instead of the `token` state value.
   */
  const getToken = useCallback(async (): Promise<string> => {
    let current = getStoredAccessToken();

    // If token is missing or expiring soon, refresh
    if (!current || isExpiringSoon(60)) {
      if (!refreshingRef.current) {
        refreshingRef.current = true;
        try {
          current = await refreshAuthSession(API_BASE);
          setToken(current);
        } finally {
          refreshingRef.current = false;
        }
      }
    }

    return current;
  }, []);

  return { token, getToken };
}
