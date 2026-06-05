import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicGalleryAssets } from "../galleries";

// Regression guard for issue #179: a transient (5xx) public-gallery sub-fetch
// must be retried ONCE so a momentary backend blip self-heals instead of
// throwing (which 500s the SSR page). A genuine 4xx (e.g. 403) must NOT be
// retried — it is a permanent answer and must fail fast.

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getPublicGalleryAssets transient retry (issue #179)", () => {
  it("retries once on a 503 then resolves on the second 200", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: "gallery temporarily unavailable", retryable: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          { id: "a1", filename: "x.webp", content_type: "image/webp", thumbnail_urls: {}, sort_order: 0 },
        ],
      });

    const assets = await getPublicGalleryAssets("wedding-c0b2fe2a");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(assets).toHaveLength(1);
    expect(assets[0].id).toBe("a1");
  });

  it("retries once on a thrown network error then resolves", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      });

    const assets = await getPublicGalleryAssets("wedding-c0b2fe2a");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(assets).toEqual([]);
  });

  it("does NOT retry on a 403 — a genuine denial fails fast", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "denied" }),
    });

    await expect(getPublicGalleryAssets("wedding-c0b2fe2a")).rejects.toThrow(
      /403/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on a 404 — fails fast", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "not found" }),
    });

    await expect(getPublicGalleryAssets("missing-deadbeef")).rejects.toThrow(
      /404/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws if the single retry also fails (no infinite retry)", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) });

    await expect(getPublicGalleryAssets("wedding-c0b2fe2a")).rejects.toThrow(
      /502/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
