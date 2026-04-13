import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { triggerCulling, getCullingSuggestions } from "../ai";

describe("ai culling client (M38 E99-S1)", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts gallery_id and top_percent to /api/v1/ai/cull", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "job-1", type: "culling", status: "pending", total_items: 0, processed_items: 0, created_at: "" }),
    });
    const job = await triggerCulling("t", "g-1", 75);
    expect(job.id).toBe("job-1");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/ai/cull"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ gallery_id: "g-1", top_percent: 75 }),
      }),
    );
  });

  it("parses culling suggestions from /api/v1/ai/cull/{jobId}", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          { asset_id: "a-1", score: 0.42, recommendation: "remove", reason: "blurry" },
          { asset_id: "a-2", score: 0.91, recommendation: "keep" },
        ],
        total: 2,
      }),
    });
    const result = await getCullingSuggestions("t", "job-1");
    expect(result.total).toBe(2);
    expect(result.suggestions[0].recommendation).toBe("remove");
  });

  it("throws when the backend returns a non-2xx status", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 503 });
    await expect(triggerCulling("t", "g-1")).rejects.toThrow(/503/);
  });
});
