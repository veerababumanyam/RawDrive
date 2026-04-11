const ACCESS_TOKEN_KEY = "rawdrive_token";
const REFRESH_TOKEN_KEY = "rawdrive_refresh_token";

type AccessTokenClaims = {
  sub?: string;
  workspace_id?: string;
  role?: string;
  platform_role?: string;
  state_id?: string;
};

function getStorage(type: "local" | "session") {
  if (typeof window === "undefined") {
    return null;
  }

  return type === "local" ? window.localStorage : window.sessionStorage;
}

export function persistAuthTokens(accessToken: string, refreshToken: string, remember = true) {
  const activeStorage = getStorage(remember ? "local" : "session");
  const inactiveStorage = getStorage(remember ? "session" : "local");

  if (!activeStorage) {
    return;
  }

  activeStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  activeStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  inactiveStorage?.removeItem(ACCESS_TOKEN_KEY);
  inactiveStorage?.removeItem(REFRESH_TOKEN_KEY);
}

export function clearAuthTokens() {
  getStorage("local")?.removeItem(ACCESS_TOKEN_KEY);
  getStorage("local")?.removeItem(REFRESH_TOKEN_KEY);
  getStorage("session")?.removeItem(ACCESS_TOKEN_KEY);
  getStorage("session")?.removeItem(REFRESH_TOKEN_KEY);
}

export function getStoredAccessToken() {
  return getStorage("local")?.getItem(ACCESS_TOKEN_KEY)
    || getStorage("session")?.getItem(ACCESS_TOKEN_KEY)
    || "";
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

export function getStoredRefreshToken() {
  return getStorage("local")?.getItem(REFRESH_TOKEN_KEY)
    || getStorage("session")?.getItem(REFRESH_TOKEN_KEY)
    || "";
}

/**
 * Options that flow through the Google OAuth start URL as query parameters.
 * - `intent` is "signup" from /register, "login" from /login. Only signup
 *   requires state_id — the backend rejects signup without it. Login paths
 *   omit it.
 * - `stateID` is REQUIRED when intent is "signup". It must match an id in
 *   the `states` table returned by GET /api/v1/states.
 * - `plan` is optional; when present it carries the user's plan intent
 *   across the OAuth round-trip so onboarding can pre-fill it.
 */
export type GoogleOAuthStartOptions = {
  intent?: "signup" | "login";
  stateID?: number | null;
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
  if (options.stateID != null && options.stateID > 0) {
    params.set("state_id", String(options.stateID));
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
