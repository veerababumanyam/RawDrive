"use client";

/**
 * useAdminFetch — Hook for admin API calls with token refresh retry.
 *
 * Solves the pattern where admin pages call getStoredAccessToken() at
 * mount time but the layout's ensureSession() hasn't completed yet,
 * causing all initial API calls to fail with 401.
 *
 * This hook waits for the token to become available (via a short poll),
 * then provides a stable getToken() function that always returns a fresh token.
 */

import { useCallback, useEffect, useState } from "react";
import { getStoredAccessToken, refreshAuthSession } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export function useAdminFetch() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function waitForToken() {
      // Try up to 5 times with 300ms gaps — layout's ensureSession usually
      // resolves within 500ms.
      for (let i = 0; i < 5; i++) {
        if (cancelled) return;
        const token = getStoredAccessToken();
        if (token) {
          setReady(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 300));
      }

      // Final attempt: trigger a refresh ourselves
      if (!cancelled) {
        const token = await refreshAuthSession(API_BASE);
        if (!cancelled && token) {
          setReady(true);
        } else if (!cancelled) {
          // No valid session — layout will redirect to /login
          setReady(false);
        }
      }
    }

    void waitForToken();
    return () => { cancelled = true; };
  }, []);

  const getToken = useCallback((): string => {
    return getStoredAccessToken();
  }, []);

  return { ready, getToken };
}
