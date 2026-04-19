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

// Deduplicate concurrent refreshes. When multiple authFetch() calls race
// after a token expires (typical on a fresh dashboard load where several
// hooks fire on mount), each previously kicked off its own POST
// /auth/refresh. Backend refresh rotates the cookie — the second
// concurrent call would then see an invalidated token and return 400,
// flipping the UI into a spurious session_expired redirect even though
// the first call succeeded. Share a single in-flight refresh promise so
// every concurrent caller gets the same new token.
let inflightRefresh: Promise<string> | null = null;

function sharedRefresh(): Promise<string> {
  if (!inflightRefresh) {
    inflightRefresh = refreshAuthSession(API_BASE).finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

/**
 * Authenticated fetch with automatic token refresh on 401.
 * Drop-in replacement for fetch() in authenticated contexts.
 */
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

  const newToken = await sharedRefresh();
  if (!newToken) {
    clearAuthTokens();
    if (typeof window !== "undefined") window.location.assign("/login?session_expired=1");
    return response;
  }

  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("Authorization", `Bearer ${newToken}`);
  return fetch(url, { ...init, headers: retryHeaders, credentials: "include" });
}
