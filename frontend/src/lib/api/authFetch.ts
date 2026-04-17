/**
 * authFetch — Authenticated fetch wrapper with automatic token refresh.
 *
 * Fixes Issues #3 and #4 from the QA report:
 *   - 401 errors across Galleries, Dashboard, Live Streams
 *   - Token expires mid-session silently without re-auth
 *
 * Usage:
 *   import { authFetch } from "@/lib/api/authFetch";
 *   const res = await authFetch("/api/v1/galleries");
 *   // Automatically attaches Bearer token, refreshes on 401, retries once.
 */

import {
  getStoredAccessToken,
  refreshAuthSession,
  clearAuthTokens,
} from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/** Build the full URL — accepts both "/api/v1/foo" and "https://..." */
function resolveUrl(input: string): string {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return input;
  }
  return `${API_BASE}${input}`;
}

/**
 * Fetch with automatic Bearer token injection and 401 retry.
 *
 * On a 401 response:
 *  1. Attempts token refresh via the HttpOnly refresh cookie
 *  2. If refresh succeeds, retries the original request once with the new token
 *  3. If refresh fails, clears auth state and redirects to /login
 */
export async function authFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = resolveUrl(input);

  // Attach current access token
  const token = getStoredAccessToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
  });

  // If not 401, return as-is
  if (response.status !== 401) {
    return response;
  }

  // Attempt token refresh
  const newToken = await refreshAuthSession(API_BASE);
  if (!newToken) {
    // Refresh failed — session is dead
    clearAuthTokens();
    if (typeof window !== "undefined") {
      window.location.assign("/login?session_expired=1");
    }
    return response;
  }

  // Retry with the new token
  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("Authorization", `Bearer ${newToken}`);

  return fetch(url, {
    ...init,
    headers: retryHeaders,
    credentials: "include",
  });
}

/**
 * Convenience: authFetch that parses JSON and throws on non-ok.
 */
export async function authFetchJson<T = unknown>(
  input: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await authFetch(input, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new AuthFetchError(res.status, body.error || `Request failed: ${res.status}`, body);
  }
  return res.json();
}

export class AuthFetchError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AuthFetchError";
  }
}
