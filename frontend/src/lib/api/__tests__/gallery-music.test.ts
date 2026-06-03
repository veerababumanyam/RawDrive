import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadGalleryMusic } from "../galleries";
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
  it("uploads through authFetch so music upload gets credentials and refresh support", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "sangeet.mp3", { type: "audio/mpeg" });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ asset: { id: "asset-music-1" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "gallery-1", music_asset_id: "asset-music-1" }),
      });

    await uploadGalleryMusic("stale-token", "gallery-1", file);

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0];
    expect(String(uploadUrl)).toContain("/api/v1/assets");
    expect(uploadInit.credentials).toBe("include");
    expect(new Headers(uploadInit.headers).get("Authorization")).toBe("Bearer fresh-token");
    expect(uploadInit.body).toBeInstanceOf(FormData);

    const [, updateInit] = fetchMock.mock.calls[1];
    expect(updateInit.body).toContain('"music_asset_id":"asset-music-1"');
  });
});
