import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getCurrentTerms, getTermsStatus, acceptTerms } from "../legal";

describe("legal terms API client", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the active terms from /api/v1/legal/terms/current with the bearer token", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
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
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/legal/terms/current"),
      expect.objectContaining({ headers: { Authorization: "Bearer tok" } }),
    );
  });

  it("posts acceptance with the version to /api/v1/legal/terms/accept", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ accepted: true }) });
    await acceptTerms("tok", "tos-privacy/2026-04");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/legal/terms/accept"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ version: "tos-privacy/2026-04" }),
      }),
    );
  });

  it("surfaces the backend message on a stale-version 409", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "TERMS_VERSION_STALE", message: "the terms have been updated" }),
    });
    await expect(acceptTerms("tok", "old")).rejects.toThrow("the terms have been updated");
  });

  it("returns null from getTermsStatus on failure (degrade to backend gate)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    expect(await getTermsStatus("tok")).toBeNull();
  });

  it("returns null from getTermsStatus when there is no token", async () => {
    expect(await getTermsStatus(null)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
