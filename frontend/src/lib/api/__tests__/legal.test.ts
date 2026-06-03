import { describe, it, expect, beforeEach, vi } from "vitest";

const authFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/authFetch", () => ({
  authFetch: authFetchMock,
}));

import { getCurrentTerms, getTermsStatus, acceptTerms } from "../legal";

describe("legal terms API client", () => {
  beforeEach(() => {
    authFetchMock.mockReset();
  });

  it("fetches the active terms through authFetch so expired tokens can refresh", async () => {
    authFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        version: "tos-privacy/2026-04",
        effective_at: "2026-04-01T00:00:00Z",
        document_types: ["terms_of_service", "privacy_policy"],
        text: "operative text",
        hash: "abc",
      }),
    });
    const t = await getCurrentTerms("tok");
    expect(t.version).toBe("tos-privacy/2026-04");
    expect(authFetchMock).toHaveBeenCalledWith("/api/v1/legal/terms/current");
  });

  it("posts acceptance with the version through authFetch", async () => {
    authFetchMock.mockResolvedValue({ ok: true, json: async () => ({ accepted: true }) });
    await acceptTerms("tok", "tos-privacy/2026-04");
    expect(authFetchMock).toHaveBeenCalledWith("/api/v1/legal/terms/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: "tos-privacy/2026-04" }),
    });
  });

  it("surfaces the backend message on a stale-version 409", async () => {
    authFetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "TERMS_VERSION_STALE", message: "the terms have been updated" }),
    });
    await expect(acceptTerms("tok", "old")).rejects.toThrow("the terms have been updated");
  });

  it("returns null from getTermsStatus on failure (degrade to backend gate)", async () => {
    authFetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    expect(await getTermsStatus("tok")).toBeNull();
    expect(authFetchMock).toHaveBeenCalledWith("/api/v1/legal/terms/status");
  });

  it("returns null from getTermsStatus when there is no token", async () => {
    expect(await getTermsStatus(null)).toBeNull();
    expect(authFetchMock).not.toHaveBeenCalled();
  });
});
