import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  getStoredAccessToken,
  persistAuthTokens,
  clearAuthTokens,
  getStoredAccessTokenClaims,
  getStoredWorkspaceId,
  refreshAuthSession,
  logoutAuthSession,
  isAndroidWebView,
  getGoogleOAuthStartUrl,
  getStoredPlatformRole,
  getPostLoginPath,
} from "../auth";

// LEGACY_TOKEN_KEYS lives module-private in auth.ts. We assert the public API
// (persistAuthTokens / clearAuthTokens / getStoredAccessToken) clears them
// indirectly, which is the only way to exercise clearLegacyStoredTokens().
const LEGACY_TOKEN_KEYS = ["rawdrive_token", "rawdrive_refresh_token"] as const;

/**
 * base64url-encode a UTF-8 string the same way a real JWT does: standard
 * base64, then +/ -> -_ and strip "=" padding. decodeBase64Url in auth.ts
 * reverses exactly this transform, so a token built here round-trips.
 */
function base64Url(input: string): string {
  // btoa is available in jsdom; it encodes Latin-1, which is fine for the
  // ASCII JSON payloads used here.
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Build a syntactically valid JWT (header.payload.signature) from a claims object. */
function makeJwt(claims: Record<string, unknown>): string {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify(claims));
  const signature = "sig-not-verified-client-side";
  return `${header}.${payload}.${signature}`;
}

beforeEach(() => {
  // accessTokenCache is module-level state — reset it through the public API.
  clearAuthTokens();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("token cache lifecycle", () => {
  it("persists and reads back the access token from the in-memory cache", () => {
    persistAuthTokens("abc");
    expect(getStoredAccessToken()).toBe("abc");
  });

  it("clears the cached access token", () => {
    persistAuthTokens("abc");
    expect(getStoredAccessToken()).toBe("abc");

    clearAuthTokens();
    expect(getStoredAccessToken()).toBe("");
  });

  it("removes legacy token keys from localStorage and sessionStorage on persist", () => {
    // Seed the legacy keys across both storages.
    window.localStorage.setItem("rawdrive_token", "x");
    window.sessionStorage.setItem("rawdrive_refresh_token", "y");
    // Also seed the cross-storage variants to prove all LEGACY_TOKEN_KEYS clear.
    window.sessionStorage.setItem("rawdrive_token", "x2");
    window.localStorage.setItem("rawdrive_refresh_token", "y2");

    persistAuthTokens("t");

    for (const key of LEGACY_TOKEN_KEYS) {
      expect(window.localStorage.getItem(key)).toBeNull();
      expect(window.sessionStorage.getItem(key)).toBeNull();
    }
  });

  it("removes legacy token keys on clearAuthTokens too", () => {
    window.localStorage.setItem("rawdrive_token", "x");
    window.sessionStorage.setItem("rawdrive_refresh_token", "y");

    clearAuthTokens();

    expect(window.localStorage.getItem("rawdrive_token")).toBeNull();
    expect(window.sessionStorage.getItem("rawdrive_refresh_token")).toBeNull();
  });

  it("removes legacy token keys on every getStoredAccessToken read", () => {
    persistAuthTokens("live");
    window.localStorage.setItem("rawdrive_token", "stale");

    const token = getStoredAccessToken();

    expect(token).toBe("live");
    expect(window.localStorage.getItem("rawdrive_token")).toBeNull();
  });
});

describe("defensive storage access (getBrowserStorage resilience)", () => {
  it("does not throw when localStorage access is blocked (private mode)", () => {
    persistAuthTokens("cached");

    const spy = vi
      .spyOn(window, "localStorage", "get")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    // clearLegacyStoredTokens swallows the throw, so none of these propagate.
    expect(() => clearAuthTokens()).not.toThrow();
    expect(() => persistAuthTokens("still-cached")).not.toThrow();
    // The cache is independent of DOM storage, so reads keep working.
    expect(() => getStoredAccessToken()).not.toThrow();

    spy.mockRestore();
  });

  it("keeps the cache working while localStorage throws on access", () => {
    persistAuthTokens("from-cache");

    const spy = vi
      .spyOn(window, "localStorage", "get")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    // getStoredAccessToken still returns the cache even though the legacy
    // sweep over localStorage hit the throwing getter (and was caught).
    expect(getStoredAccessToken()).toBe("from-cache");

    spy.mockRestore();
    // After restore, the cache value survives.
    expect(getStoredAccessToken()).toBe("from-cache");
  });
});

describe("claim decoding: getStoredAccessTokenClaims / getStoredWorkspaceId / getStoredPlatformRole", () => {
  it("decodes claims from a persisted JWT", () => {
    const claims = {
      sub: "user-123",
      workspace_id: "ws-42",
      role: "owner",
      platform_role: "admin",
      state_id: "state-9",
    };
    persistAuthTokens(makeJwt(claims));

    const decoded = getStoredAccessTokenClaims();

    expect(decoded).not.toBeNull();
    expect(decoded?.workspace_id).toBe("ws-42");
    expect(decoded?.platform_role).toBe("admin");
    expect(decoded?.sub).toBe("user-123");
    expect(decoded?.state_id).toBe("state-9");
  });

  it("returns the workspace_id claim via getStoredWorkspaceId", () => {
    persistAuthTokens(makeJwt({ workspace_id: "ws-777" }));
    expect(getStoredWorkspaceId()).toBe("ws-777");
  });

  it("returns empty string from getStoredWorkspaceId when claim is absent", () => {
    persistAuthTokens(makeJwt({ sub: "user-x" }));
    expect(getStoredWorkspaceId()).toBe("");
  });

  it("returns the platform_role claim via getStoredPlatformRole", () => {
    persistAuthTokens(makeJwt({ platform_role: "dealer", workspace_id: "ws-1" }));
    expect(getStoredPlatformRole()).toBe("dealer");
  });

  it("defaults getStoredPlatformRole to 'photographer' when claim is absent", () => {
    persistAuthTokens(makeJwt({ workspace_id: "ws-1" }));
    expect(getStoredPlatformRole()).toBe("photographer");
  });

  it("defaults getStoredPlatformRole to 'photographer' when no token is stored", () => {
    expect(getStoredPlatformRole()).toBe("photographer");
  });

  it("returns null for a malformed (non-JWT) token without throwing", () => {
    persistAuthTokens("not-a-jwt");
    expect(() => getStoredAccessTokenClaims()).not.toThrow();
    expect(getStoredAccessTokenClaims()).toBeNull();
  });

  it("returns null when the payload segment is not valid base64url JSON", () => {
    // Valid three-segment shape, but the payload is not decodable JSON.
    persistAuthTokens("header.!!!not-base64-json!!!.sig");
    expect(getStoredAccessTokenClaims()).toBeNull();
  });

  it("returns null when no token is stored at all", () => {
    expect(getStoredAccessTokenClaims()).toBeNull();
  });
});

describe("getPostLoginPath routing", () => {
  it("routes to /onboarding when workspace_id is 'pending-onboarding'", () => {
    persistAuthTokens(
      makeJwt({ workspace_id: "pending-onboarding", platform_role: "admin" }),
    );
    expect(getPostLoginPath()).toBe("/onboarding");
  });

  it("routes to /onboarding when workspace_id is missing", () => {
    persistAuthTokens(makeJwt({ platform_role: "admin" }));
    expect(getPostLoginPath()).toBe("/onboarding");
  });

  it("routes super_admin to /admin/users", () => {
    persistAuthTokens(
      makeJwt({ workspace_id: "ws-1", platform_role: "super_admin" }),
    );
    expect(getPostLoginPath()).toBe("/admin/users");
  });

  it("routes admin to /admin/users", () => {
    persistAuthTokens(makeJwt({ workspace_id: "ws-1", platform_role: "admin" }));
    expect(getPostLoginPath()).toBe("/admin/users");
  });

  it("routes dealer to /dealer", () => {
    persistAuthTokens(makeJwt({ workspace_id: "ws-1", platform_role: "dealer" }));
    expect(getPostLoginPath()).toBe("/dealer");
  });

  it("routes client to /galleries", () => {
    persistAuthTokens(makeJwt({ workspace_id: "ws-1", platform_role: "client" }));
    expect(getPostLoginPath()).toBe("/galleries");
  });

  it("routes photographer to /dashboard", () => {
    persistAuthTokens(
      makeJwt({ workspace_id: "ws-1", platform_role: "photographer" }),
    );
    expect(getPostLoginPath()).toBe("/dashboard");
  });

  it("routes team_member to /dashboard", () => {
    persistAuthTokens(
      makeJwt({ workspace_id: "ws-1", platform_role: "team_member" }),
    );
    expect(getPostLoginPath()).toBe("/dashboard");
  });

  it("routes an unknown/default platform_role to /dashboard", () => {
    persistAuthTokens(
      makeJwt({ workspace_id: "ws-1", platform_role: "some_future_role" }),
    );
    expect(getPostLoginPath()).toBe("/dashboard");
  });

  it("routes to /onboarding when there is no token (no claims)", () => {
    expect(getPostLoginPath()).toBe("/onboarding");
  });
});

describe("refreshAuthSession", () => {
  const apiBase = "https://api.test";

  it("persists and returns the access token on a 200 with access_token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "new" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = await refreshAuthSession(apiBase);

    expect(token).toBe("new");
    expect(getStoredAccessToken()).toBe("new");
    expect(fetchMock).toHaveBeenCalledWith(`${apiBase}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
  });

  it("returns '' and clears the cache when response.ok but no access_token", async () => {
    persistAuthTokens("stale");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = await refreshAuthSession(apiBase);

    expect(token).toBe("");
    expect(getStoredAccessToken()).toBe("");
  });

  it("returns '' and clears the cache when access_token is an empty string", async () => {
    persistAuthTokens("stale");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = await refreshAuthSession(apiBase);

    expect(token).toBe("");
    expect(getStoredAccessToken()).toBe("");
  });

  it("returns '' and clears the cache on a non-ok 401 response", async () => {
    persistAuthTokens("stale");
    const json = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, json });
    vi.stubGlobal("fetch", fetchMock);

    const token = await refreshAuthSession(apiBase);

    expect(token).toBe("");
    expect(getStoredAccessToken()).toBe("");
    // Short-circuits before reading the body on a non-ok response.
    expect(json).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(`${apiBase}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
  });

  it("returns '' and clears the cache when the body is empty JSON (ok 204-style)", async () => {
    persistAuthTokens("stale");
    // ok:true but json() rejects (empty body) — auth.ts catches it to {}.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("Unexpected end of JSON input");
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = await refreshAuthSession(apiBase);

    expect(token).toBe("");
    expect(getStoredAccessToken()).toBe("");
  });

  it("defaults apiBase to '' and calls /auth/refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "tok" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await refreshAuthSession();

    expect(fetchMock).toHaveBeenCalledWith("/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
  });
});

describe("logoutAuthSession", () => {
  const apiBase = "https://api.test";

  it("POSTs /auth/logout and clears the cache", async () => {
    persistAuthTokens("live");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await logoutAuthSession(apiBase);

    expect(fetchMock).toHaveBeenCalledWith(`${apiBase}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    expect(getStoredAccessToken()).toBe("");
  });

  it("clears the cache even when the logout fetch rejects", async () => {
    persistAuthTokens("live");
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(logoutAuthSession(apiBase)).resolves.toBeUndefined();
    expect(getStoredAccessToken()).toBe("");
  });

  it("defaults apiBase to '' and POSTs /auth/logout", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await logoutAuthSession();

    expect(fetchMock).toHaveBeenCalledWith("/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  });
});

describe("isAndroidWebView", () => {
  function stubUserAgent(ua: string) {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  }

  it("returns true for an Android WebView ('wv' token)", () => {
    stubUserAgent(
      "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36",
    );
    expect(isAndroidWebView()).toBe(true);
  });

  it("returns true for an Instagram in-app browser UA", () => {
    stubUserAgent(
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Instagram 300.0.0.0 Android",
    );
    expect(isAndroidWebView()).toBe(true);
  });

  it("returns false for plain Chrome on Android (no 'wv', no in-app token)", () => {
    stubUserAgent(
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    );
    expect(isAndroidWebView()).toBe(false);
  });

  it("returns false for a desktop Chrome UA", () => {
    stubUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    expect(isAndroidWebView()).toBe(false);
  });
});

describe("getGoogleOAuthStartUrl", () => {
  it("builds a login-intent URL with redirect_to from window.location.origin", () => {
    const url = getGoogleOAuthStartUrl("", { intent: "login" });

    expect(url).toContain("/auth/oauth/google");
    expect(url).toContain("intent=login");

    const parsed = new URL(url, "http://placeholder.test");
    expect(parsed.searchParams.get("intent")).toBe("login");
    expect(parsed.searchParams.get("redirect_to")).toBe(window.location.origin);
  });

  it("includes the apiBase prefix and a plan param when provided", () => {
    const url = getGoogleOAuthStartUrl("https://api.test", {
      intent: "signup",
      plan: "pro",
    });

    expect(url.startsWith("https://api.test/auth/oauth/google?")).toBe(true);

    const parsed = new URL(url);
    expect(parsed.searchParams.get("intent")).toBe("signup");
    expect(parsed.searchParams.get("plan")).toBe("pro");
    expect(parsed.searchParams.get("redirect_to")).toBe(window.location.origin);
  });
});
