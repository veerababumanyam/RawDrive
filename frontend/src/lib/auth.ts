const LEGACY_TOKEN_KEYS = ["rawdrive_token", "rawdrive_refresh_token"] as const;

let accessTokenCache = "";

type AccessTokenClaims = {
  sub?: string;
  workspace_id?: string;
  role?: string;
  platform_role?: string;
  state_id?: string;
  // S5-G1: true only for an admin-minted impersonation access token. The
  // backend marks the whole session read-only (mutations 403) when set, so the
  // UI reads this to show a persistent banner + disable mutating controls
  // instead of letting the admin hit surprise 403s. Absent/false on every
  // normal token.
  impersonation?: boolean;
};

function getBrowserStorage(name: "localStorage" | "sessionStorage"): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window[name] ?? null;
  } catch {
    return null;
  }
}

function clearLegacyStoredTokens() {
  for (const storage of [getBrowserStorage("localStorage"), getBrowserStorage("sessionStorage")]) {
    if (!storage) continue;
    for (const key of LEGACY_TOKEN_KEYS) {
      try {
        storage.removeItem(key);
      } catch {
        // Storage can throw in private-mode browsers or test environments.
      }
    }
  }
}

export function persistAuthTokens(accessToken: string) {
  accessTokenCache = accessToken;
  clearLegacyStoredTokens();
}

export function clearAuthTokens() {
  accessTokenCache = "";
  clearLegacyStoredTokens();
}

export function getStoredAccessToken() {
  clearLegacyStoredTokens();
  return accessTokenCache;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return window.atob(padded);
}

export function getStoredAccessTokenClaims(): AccessTokenClaims | null {
  if (typeof window === "undefined") {
    return null;
  }

  const token = getStoredAccessToken();
  const [, payload] = token.split(".");

  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64Url(payload)) as AccessTokenClaims;
  } catch {
    return null;
  }
}

export function getStoredWorkspaceId() {
  const claims = getStoredAccessTokenClaims();
  return claims?.workspace_id ?? "";
}

// S5-G1: true when the active session is an admin impersonation session. The
// backend rejects every mutating request on such a token with 403, so the UI
// must surface a read-only banner and visually disable mutating controls. Reads
// the `impersonation` claim off the current access token; false (read-write)
// for any normal session and when no token is present.
export function isImpersonatingSession(): boolean {
  return getStoredAccessTokenClaims()?.impersonation === true;
}

export type RefreshAuthFailureReason =
  | "no_session"
  | "expired"
  | "server_error"
  | "invalid_response"
  | "network_error";

export type RefreshAuthSessionResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: RefreshAuthFailureReason };

export async function refreshAuthSessionResult(apiBase = ""): Promise<RefreshAuthSessionResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    clearAuthTokens();
    return { ok: false, reason: "network_error" };
  }

  if (response.status === 204) {
    clearAuthTokens();
    return { ok: false, reason: "no_session" };
  }

  if (!response.ok) {
    clearAuthTokens();
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "expired" };
    }
    return { ok: false, reason: "server_error" };
  }

  const payload = await response.json().catch(() => ({}));
  if (typeof payload.access_token !== "string" || !payload.access_token) {
    clearAuthTokens();
    return { ok: false, reason: "invalid_response" };
  }

  persistAuthTokens(payload.access_token);
  return { ok: true, accessToken: payload.access_token };
}

export async function refreshAuthSession(apiBase = "") {
  const result = await refreshAuthSessionResult(apiBase);
  return result.ok ? result.accessToken : "";
}

export async function logoutAuthSession(apiBase = "") {
  await fetch(`${apiBase}/auth/logout`, {
    method: "POST",
    credentials: "include",
  }).catch(() => {});
  clearAuthTokens();
}

// Returns true when the page is running inside a browser context where Google
// OAuth is known to be blocked. Two categories:
//
//  1. Android WebView — the "wv" token appears in the UA when an app wraps
//     the page in android.webkit.WebView. Regular Chrome on Android omits it.
//
//  2. In-app browsers (Facebook, Instagram, WhatsApp, LinkedIn, Snapchat,
//     Twitter/X, TikTok) — these open links inside their own embedded browser
//     instead of handing off to Chrome. They don't include "wv" but Google
//     detects the app-specific UA tokens and rejects the OAuth flow.
//     This explains why the issue only affects some users on some devices:
//     only users who tapped a shared link from within one of these apps hit it.
export function isAndroidWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Android/.test(ua) && /\bwv\b/.test(ua)) return true;
  if (/FBAN|FBAV|Instagram|LinkedInApp|Snapchat|Twitter|BytedanceWebview|musical_ly/.test(ua)) return true;
  return false;
}

export function openPageInChrome(url: string): void {
  // Strip the scheme and rebuild as an Android intent URI.
  // Android resolves this to Chrome; S.browser_fallback_url catches the
  // (unlikely) case where Chrome is not installed.
  const stripped = url.replace(/^https?:\/\//, "");
  window.location.href = `intent://${stripped}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}

export type GoogleOAuthStartOptions = {
  intent?: "signup" | "login";
  plan?: string;
};

export function getGoogleOAuthStartUrl(
  apiBase = "",
  options: GoogleOAuthStartOptions = {},
) {
  const authBase = apiBase || "";
  const params = new URLSearchParams();

  if (typeof window !== "undefined") {
    params.set("redirect_to", window.location.origin);
  }
  if (options.intent) {
    params.set("intent", options.intent);
  }
  if (options.plan) {
    params.set("plan", options.plan);
  }

  const qs = params.toString();
  return qs ? `${authBase}/auth/oauth/google?${qs}` : `${authBase}/auth/oauth/google`;
}

export function getStoredPlatformRole(): string {
  const claims = getStoredAccessTokenClaims();
  return claims?.platform_role || "photographer";
}

export function getPostLoginPath() {
  const claims = getStoredAccessTokenClaims();
  if (claims?.workspace_id === "pending-onboarding" || !claims?.workspace_id) {
    return "/onboarding";
  }

  // Route based on platform role (PRD 6.2)
  switch (claims.platform_role) {
    case "super_admin":
    case "admin":
      return "/admin/users";
    case "dealer":
      return "/dealer";
    case "client":
      return "/galleries";
    case "photographer":
    case "team_member":
    default:
      return "/dashboard";
  }
}
