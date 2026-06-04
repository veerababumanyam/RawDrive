import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteMusicTrack,
  listMusicLibrary,
  selectGalleryMusic,
  uploadGalleryMusic,
  uploadMusicTrack,
} from "../galleries";
import { clearAuthTokens, persistAuthTokens } from "@/lib/auth";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  persistAuthTokens("fresh-token");
});

afterEach(() => {
  clearAuthTokens();
  vi.unstubAllGlobals();
});

describe("gallery music API", () => {
  it("lists the workspace music library through authFetch (GET /api/v1/music)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tracks: [
          {
            id: "track-1",
            filename: "sangeet.mp3",
            content_type: "audio/mpeg",
            size_bytes: 1024,
            created_at: "2026-06-04T00:00:00Z",
          },
        ],
      }),
    });

    const tracks = await listMusicLibrary("stale-token");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/music");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer fresh-token",
    );
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe("track-1");
  });

  it("returns an empty list when the library payload omits tracks", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    expect(await listMusicLibrary("t")).toEqual([]);
  });

  it("uploads a single track through authFetch without binding it to a gallery", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "sangeet.mp3", {
      type: "audio/mpeg",
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ asset: { id: "asset-music-1" } }),
    });

    const result = await uploadMusicTrack("stale-token", file);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/assets");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer fresh-token",
    );
    expect(init.body).toBeInstanceOf(FormData);
    expect(result).toEqual({ id: "asset-music-1" });
  });

  it("surfaces a quota error message from the upload", async () => {
    const file = new File([new Uint8Array([1])], "big.mp3", {
      type: "audio/mpeg",
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: "storage quota exceeded" }),
    });
    await expect(uploadMusicTrack("t", file)).rejects.toThrow(
      "storage quota exceeded",
    );
  });

  it("deletes a library track through authFetch (DELETE /api/v1/music/{id})", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });

    await deleteMusicTrack("stale-token", "track-7");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/music/track-7");
    expect(init.method).toBe("DELETE");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer fresh-token",
    );
  });

  it("selects a gallery track via PUT music_asset_id", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "gallery-1", music_asset_id: "asset-9" }),
    });

    const updated = await selectGalleryMusic("t", "gallery-1", "asset-9");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/galleries/gallery-1");
    expect(init.method).toBe("PUT");
    expect(init.body).toContain('"music_asset_id":"asset-9"');
    expect(updated.music_asset_id).toBe("asset-9");
  });

  it("clears a gallery track when assetId is null", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "gallery-1", music_asset_id: null }),
    });

    await selectGalleryMusic("t", "gallery-1", null);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toContain('"music_asset_id":null');
  });

  it("back-compat uploadGalleryMusic uploads then selects in two calls", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "sangeet.mp3", {
      type: "audio/mpeg",
    });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ asset: { id: "asset-music-1" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "gallery-1",
          music_asset_id: "asset-music-1",
        }),
      });

    await uploadGalleryMusic("stale-token", "gallery-1", file);

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0];
    expect(String(uploadUrl)).toContain("/api/v1/assets");
    expect(uploadInit.credentials).toBe("include");
    expect(new Headers(uploadInit.headers).get("Authorization")).toBe(
      "Bearer fresh-token",
    );
    expect(uploadInit.body).toBeInstanceOf(FormData);

    const [, updateInit] = fetchMock.mock.calls[1];
    expect(updateInit.body).toContain('"music_asset_id":"asset-music-1"');
  });
});
