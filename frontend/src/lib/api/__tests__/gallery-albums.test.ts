import { beforeEach, describe, expect, it, vi } from "vitest";
import { listGalleryAlbums } from "../galleries";

const fetchMock = vi.fn();
const getStoredAccessTokenMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: () => getStoredAccessTokenMock(),
  refreshAuthSession: vi.fn(),
  clearAuthTokens: vi.fn(),
}));

beforeEach(() => {
  fetchMock.mockReset();
  getStoredAccessTokenMock.mockReset();
  getStoredAccessTokenMock.mockReturnValue("token");
  vi.stubGlobal("fetch", fetchMock);
});

describe("gallery album API", () => {
  it("requests inline asset ids when album membership batching is enabled", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: "album-1", name: "Ceremony", asset_ids: ["asset-1", "asset-2"] },
        ],
      }),
    });

    const albums = await listGalleryAlbums("token", "gallery-1", { includeAssetIds: true });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/galleries/gallery-1/albums?include_asset_ids=true"),
      expect.any(Object),
    );
    expect(albums[0].asset_ids).toEqual(["asset-1", "asset-2"]);
  });

  it("keeps the historical album list URL by default", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: "album-1", name: "Ceremony" }] }),
    });

    await listGalleryAlbums("token", "gallery-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/galleries/gallery-1/albums"),
      expect.any(Object),
    );
    expect(fetchMock.mock.calls[0][0]).not.toContain("include_asset_ids");
  });
});
