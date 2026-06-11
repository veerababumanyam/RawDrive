import { getApiBaseUrl } from "@/lib/api/base-url";
import {
  getStoredAccessToken,
  refreshAuthSessionResult,
  clearAuthTokens,
} from "@/lib/auth";

const API_BASE = getApiBaseUrl();

function resolveUrl(input: string): string {
  if (input.startsWith("http://") || input.startsWith("https://")) return input;
  return `${API_BASE}${input}`;
}

// Deduplicate concurrent refreshes. When multiple authFetch() calls race
// after a token expires (typical on a fresh dashboard load where several
// hooks fire on mount), each previously kicked off its own POST
// /auth/refresh. Backend refresh rotates the cookie — the second
// concurrent call would then see an invalidated token and return 400,
// flipping the UI into a spurious session_expired redirect even though
// the first call succeeded. Share a single in-flight refresh promise so
// every concurrent caller gets the same new token.
let inflightRefresh: ReturnType<typeof refreshAuthSessionResult> | null = null;

function sharedRefresh(): ReturnType<typeof refreshAuthSessionResult> {
  if (!inflightRefresh) {
    inflightRefresh = refreshAuthSessionResult(API_BASE).finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

type AuthFetchInit = RequestInit & {
  /**
   * Force an access-token refresh before the first request when no token is in
   * memory. This is for mutating authenticated calls such as uploads: after a
   * page reload the refresh cookie can still be valid even though the in-memory
   * access token cache is empty.
   */
  requireAuth?: boolean;
};

/**
 * Authenticated fetch with automatic token refresh on 401.
 * Drop-in replacement for fetch() in authenticated contexts.
 */
export async function authFetch(
  input: string,
  init: AuthFetchInit = {},
): Promise<Response> {
  const { requireAuth = false, ...requestInit } = init;
  const url = resolveUrl(input);
  let token = getStoredAccessToken();

  if (!token && requireAuth) {
    const refreshResult = await sharedRefresh();
    if (!refreshResult.ok) {
      return new Response(JSON.stringify({ error: refreshResult.reason }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    token = refreshResult.accessToken;
  }

  const headers = new Headers(requestInit.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(url, {
    ...requestInit,
    headers,
    credentials: "include",
  });
  if (response.status !== 401) return response;

  // Only treat a 401 as "session expired" when we actually attached an
  // Authorization header. If we sent no token, this is not an expired
  // session — it is an unauthenticated request (stale background poll,
  // pre-login hook, logged-out tab). Redirecting to /login?session_expired=1
  // in those cases is misleading UX and also steals the main tab's
  // navigation from the dashboard layout's own auth guard, which redirects
  // cleanly to plain /login. Return the 401 and let the caller handle it.
  if (!token) {
    return response;
  }

  const refreshResult = await sharedRefresh();
  if (!refreshResult.ok) {
    clearAuthTokens();
    if (typeof window !== "undefined") {
      window.location.assign(
        `/login?session_expired=1&reason=${encodeURIComponent(refreshResult.reason)}`,
      );
    }
    return response;
  }

  const retryHeaders = new Headers(requestInit.headers);
  retryHeaders.set("Authorization", `Bearer ${refreshResult.accessToken}`);
  return fetch(url, {
    ...requestInit,
    headers: retryHeaders,
    credentials: "include",
  });
}
