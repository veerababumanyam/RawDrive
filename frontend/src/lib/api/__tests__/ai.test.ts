import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// We need to import after setting up the mock
import {
  getFaceClusters,
  searchAssets,
  getAIConfig,
  getCredits,
  triggerFaceDetect,
  getAssetTags,
  getDuplicates,
  setSpendCap,
  validateAIKey,
} from "../ai";
import { persistAuthTokens, clearAuthTokens } from "@/lib/auth";

beforeEach(() => {
  mockFetch.mockReset();
  // getFaceClusters routes through authFetch, which reads the in-memory
  // access-token cache (getStoredAccessToken) rather than its token arg.
  // Seed the cache so authFetch attaches the Authorization header that the
  // endpoint assertion below verifies.
  persistAuthTokens("test-token");
});

afterEach(() => {
  clearAuthTokens();
});

describe("AI API Client", () => {
  const token = "test-token";

  it("getFaceClusters calls correct endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ cluster_label: "abc", cluster_name: "Bride", face_count: 10 }]),
    });

    const result = await getFaceClusters(token);
    expect(result).toHaveLength(1);
    expect(result[0].cluster_name).toBe("Bride");
    const [calledUrl, init] = mockFetch.mock.calls[0];
    expect(String(calledUrl)).toContain("/api/v1/ai/clusters");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-token");
  });

  it("getFaceClusters with gallery filter", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });

    await getFaceClusters(token, "gallery-123");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("?gallery_id=gallery-123"),
      expect.any(Object)
    );
  });

  it("searchAssets sends POST with query", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [], total: 0 }),
    });

    const result = await searchAssets(token, "sunset portrait");
    expect(result.total).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/ai/search"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("getAIConfig returns config", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ configured: true, provider: "gemini", key_masked: "AIza...xxxx" }),
    });

    const config = await getAIConfig(token);
    expect(config.configured).toBe(true);
    expect(config.key_masked).toBe("AIza...xxxx");
  });

  it("getCredits returns credit summary", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ monthly_cap_paisa: 500000, spent_this_month_paisa: 125000 }),
    });

    const credits = await getCredits(token);
    expect(credits.monthly_cap_paisa).toBe(500000);
  });

  it("triggerFaceDetect sends asset IDs", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ job_id: "job-1", status: "pending" }),
    });

    const result = await triggerFaceDetect(token, ["asset-1", "asset-2"]);
    expect(result.job_id).toBe("job-1");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.asset_ids).toEqual(["asset-1", "asset-2"]);
  });

  it("getAssetTags returns tags and caption", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ai_tags: [{ tag: "sunset", category: "scene", confidence: 0.95 }],
          ai_caption: "A sunset",
          ai_tag_status: "done",
        }),
    });

    const result = await getAssetTags(token, "asset-1");
    expect(result.ai_tags).toHaveLength(1);
    expect(result.ai_caption).toBe("A sunset");
  });

  it("getDuplicates returns groups", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ groups: [], total: 0 }),
    });

    const result = await getDuplicates(token, "pending");
    expect(result.groups).toHaveLength(0);
  });

  it("setSpendCap sends PUT with cap value", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    await setSpendCap(token, 500000);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/ai/spend/cap"),
      expect.objectContaining({ method: "PUT" })
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.monthly_cap_paisa).toBe(500000);
  });

  it("validateAIKey returns validation result", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ valid: true }),
    });

    const result = await validateAIKey(token);
    expect(result.valid).toBe(true);
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(getFaceClusters(token)).rejects.toThrow("500");
  });
});
