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

  const newToken = await refreshAuthSession(API_BASE);
  if (!newToken) {
    clearAuthTokens();
    if (typeof window !== "undefined") window.location.assign("/login?session_expired=1");
    return response;
  }

  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("Authorization", `Bearer ${newToken}`);
  return fetch(url, { ...init, headers: retryHeaders, credentials: "include" });
}
