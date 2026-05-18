const LEGACY_TOKEN_KEYS = ["rawdrive_token", "rawdrive_refresh_token"] as const;

let accessTokenCache = "";

type AccessTokenClaims = {
  sub?: string;
  workspace_id?: string;
  role?: string;
  platform_role?: string;
  state_id?: string;
};

function clearLegacyStoredTokens() {
  if (typeof window === "undefined") {
    return;
  }

  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of LEGACY_TOKEN_KEYS) {
      storage.removeItem(key);
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

export async function refreshAuthSession(apiBase = "") {
  const response = await fetch(`${apiBase}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    clearAuthTokens();
    return "";
  }

  const payload = await response.json().catch(() => ({}));
  if (typeof payload.access_token !== "string" || !payload.access_token) {
    clearAuthTokens();
    return "";
  }

  persistAuthTokens(payload.access_token);
  return payload.access_token;
}

export async function logoutAuthSession(apiBase = "") {
  await fetch(`${apiBase}/auth/logout`, {
    method: "POST",
    credentials: "include",
  }).catch(() => {});
  clearAuthTokens();
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
