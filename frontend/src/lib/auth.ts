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

export function getGoogleOAuthStartUrl(apiBase = "") {
  if (typeof window === "undefined") {
    return `${apiBase}/auth/oauth/google`;
  }

  const authBase = apiBase || "";
  const redirectTo = encodeURIComponent(window.location.origin);
  return `${authBase}/auth/oauth/google?redirect_to=${redirectTo}`;
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
