import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the auth module BEFORE importing authFetch so the module-scope
// API_BASE and the refresh helpers resolve against the mock.
const getStoredAccessTokenMock = vi.fn();
const refreshAuthSessionMock = vi.fn();
const clearAuthTokensMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: () => getStoredAccessTokenMock(),
  refreshAuthSession: (apiBase?: string) => refreshAuthSessionMock(apiBase),
  clearAuthTokens: () => clearAuthTokensMock(),
}));

// Capture window.location.assign calls so we can assert "no redirect"
// without actually navigating the test JSDOM.
let locationAssignMock: ReturnType<typeof vi.fn>;

import { authFetch } from "../authFetch";

describe("authFetch", () => {
  beforeEach(() => {
    getStoredAccessTokenMock.mockReset();
    refreshAuthSessionMock.mockReset();
    clearAuthTokensMock.mockReset();
    locationAssignMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign: locationAssignMock },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 without redirecting when no access token was attached", async () => {
    // No cached token → stale tab / pre-login hook / background poll.
    // The bug we fixed: authFetch was hijacking the main tab's navigation
    // with /login?session_expired=1 even though no session ever existed
    // to expire. Must now return the 401 and stay put.
    getStoredAccessTokenMock.mockReturnValue("");
    const fetcher = vi.fn(async () =>
      ({ status: 401, ok: false, headers: new Headers() }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetcher);

    const res = await authFetch("/api/v1/credits/balance", { method: "GET" });

    expect(res.status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(refreshAuthSessionMock).not.toHaveBeenCalled();
    expect(locationAssignMock).not.toHaveBeenCalled();
  });

  it("attempts refresh and retries on 401 when a token was attached", async () => {
    getStoredAccessTokenMock.mockReturnValueOnce("stale-token");
    refreshAuthSessionMock.mockResolvedValueOnce("new-token");

    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        { status: 401, ok: false, headers: new Headers() } as unknown as Response,
      )
      .mockResolvedValueOnce(
        { status: 200, ok: true, headers: new Headers() } as unknown as Response,
      );
    vi.stubGlobal("fetch", fetcher);

    const res = await authFetch("/api/v1/streams", { method: "GET" });

    expect(res.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(refreshAuthSessionMock).toHaveBeenCalledTimes(1);
    const retryCall = fetcher.mock.calls[1] as [unknown, RequestInit];
    expect(new Headers(retryCall[1].headers).get("Authorization")).toBe("Bearer new-token");
    expect(locationAssignMock).not.toHaveBeenCalled();
  });

  it("redirects to /login?session_expired=1 when refresh fails for a real session", async () => {
    getStoredAccessTokenMock.mockReturnValue("expired-token");
    refreshAuthSessionMock.mockResolvedValueOnce("");

    const fetcher = vi.fn(async () =>
      ({ status: 401, ok: false, headers: new Headers() }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetcher);

    await authFetch("/api/v1/streams", { method: "GET" });

    expect(clearAuthTokensMock).toHaveBeenCalledTimes(1);
    expect(locationAssignMock).toHaveBeenCalledWith("/login?session_expired=1");
  });

  it("deduplicates concurrent refresh calls", async () => {
    // Three parallel authFetch() calls all receive 401 with a cached
    // token. Previously each fired its own /auth/refresh, and because
    // refresh rotates the cookie, later calls saw an invalidated token
    // and returned 400 → false session_expired redirect. The shared
    // in-flight promise must collapse them into ONE refresh.
    getStoredAccessTokenMock.mockReturnValue("stale-token");
    let refreshResolved = false;
    refreshAuthSessionMock.mockImplementation(async () => {
      // Micro-delay so the concurrent callers actually overlap.
      await new Promise((r) => setTimeout(r, 5));
      refreshResolved = true;
      return "new-token";
    });

    const fetcher = vi.fn().mockImplementation(async (_input: unknown, init?: RequestInit) => {
      const hasNewToken =
        new Headers(init?.headers).get("Authorization") === "Bearer new-token";
      return {
        status: hasNewToken ? 200 : 401,
        ok: hasNewToken,
        headers: new Headers(),
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetcher);

    const [a, b, c] = await Promise.all([
      authFetch("/api/v1/a"),
      authFetch("/api/v1/b"),
      authFetch("/api/v1/c"),
    ]);

    expect(refreshResolved).toBe(true);
    expect(refreshAuthSessionMock).toHaveBeenCalledTimes(1);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(c.status).toBe(200);
    expect(locationAssignMock).not.toHaveBeenCalled();
  });
});
