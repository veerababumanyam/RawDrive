/**
 * authFetch — Authenticated fetch wrapper with automatic token refresh.
 *
 * Fixes the pervasive 401 pattern: all API modules call getStoredAccessToken()
 * which returns empty if the session hasn't been established yet, or the token
 * has expired. This wrapper:
 *  1. Attaches the current Bearer token
 *  2. On 401, attempts token refresh via HttpOnly cookie
 *  3. Retries the original request once with the new token
 *  4. On refresh failure, redirects to /login
 */

import {
  getStoredAccessToken,
  refreshAuthSession,
  clearAuthTokens,
} from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function resolveUrl(input: string): string {
  if (input.startsWith("http://") || input.startsWith("https://")) return input;
  return `${API_BASE}${input}`;
}

export async function authFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = resolveUrl(input);
  const token = getStoredAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(url, { ...init, headers, credentials: "include" });

  if (response.status !== 401) return response;

  // Attempt token refresh
  const newToken = await refreshAuthSession(API_BASE);
  if (!newToken) {
    clearAuthTokens();
    if (typeof window !== "undefined") window.location.assign("/login?session_expired=1");
    return response;
  }

  // Retry with new token
  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("Authorization", `Bearer ${newToken}`);
  return fetch(url, { ...init, headers: retryHeaders, credentials: "include" });
}
