"use client";

import { useEffect, useState } from "react";

interface OAuthAvailability {
  enabled: boolean;
  loading: boolean;
}

/**
 * Probes the backend to learn whether Google OAuth is configured (OBS-2).
 *
 * The backend gates OAuth on `h.oauth == nil` and exposes the public endpoint
 * `GET {apiBase}/auth/oauth/google/status` -> 200 {"enabled": boolean}. When
 * the providers' GOOGLE_CLIENT_* settings are absent the status is `false` and
 * the Google sign-in button must be hidden (per the "disable feature with a
 * warning" rule) rather than rendering a button that returns a 500.
 *
 * The default is OPTIMISTIC: `enabled` starts `true` so the common, configured
 * case renders without a flicker. On any probe failure (network error, non-ok
 * response, parse failure, or a missing `fetch`) we keep OAuth enabled — a
 * transient probe failure must not hide a working feature.
 */
export function useOAuthAvailability(
  apiBase = process.env.NEXT_PUBLIC_API_URL || "",
): OAuthAvailability {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : undefined;

    async function probe() {
      try {
        if (typeof fetch === "undefined") {
          return;
        }

        const response = await fetch(`${apiBase}/auth/oauth/google/status`, {
          signal: controller?.signal,
        });

        if (cancelled || !response.ok) {
          return;
        }

        const payload = await response.json();
        if (cancelled) {
          return;
        }

        if (payload && typeof payload.enabled === "boolean") {
          setEnabled(payload.enabled);
        }
      } catch (err) {
        // AbortError is expected on unmount; any other error keeps the
        // optimistic default (enabled stays true).
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void probe();

    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [apiBase]);

  return { enabled, loading };
}
