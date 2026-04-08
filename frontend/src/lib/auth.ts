const ACCESS_TOKEN_KEY = "rawdrive_token";
const REFRESH_TOKEN_KEY = "rawdrive_refresh_token";

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

export function getPostLoginPath() {
  return "/dashboard";
}
