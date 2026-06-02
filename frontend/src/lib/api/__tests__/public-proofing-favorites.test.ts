import { beforeEach, describe, expect, it, vi } from "vitest";
import { addPublicFavorite, listPublicFavoriteAssetIds, removePublicFavorite } from "../favorites";
import { submitPublicProofing } from "../proofing";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("public proofing and favorites session wiring", () => {
  it("forwards gallery sessions on public proofing submissions", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ status: "submitted" }),
    } as Response);

    await submitPublicProofing(
      "wedding",
      {
        asset_ids: ["asset-1"],
        client_name: "Anika Rao",
        client_email: "anika@example.com",
      },
      "gs-token",
      "studio-a1b2c3d4",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/public/galleries/wedding/proof?ws=studio-a1b2c3d4",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Gallery-Session": "gs-token",
        }),
      }),
    );
  });

  it("forwards gallery sessions on public favorite hydration and toggles", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ asset_ids: ["asset-1"] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ status: "favorited" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

    await listPublicFavoriteAssetIds("wedding", "guest-1", "gs-token", "studio-a1b2c3d4");
    await addPublicFavorite("wedding", "asset-1", "guest-1", "gs-token", "studio-a1b2c3d4");
    await removePublicFavorite("wedding", "asset-1", "guest-1", "gs-token", "studio-a1b2c3d4");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8080/api/v1/public/galleries/wedding/favorites?ws=studio-a1b2c3d4&session=guest-1",
      expect.objectContaining({
        credentials: "include",
        headers: { "X-Gallery-Session": "gs-token" },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8080/api/v1/public/galleries/wedding/favorites/asset-1?ws=studio-a1b2c3d4",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Gallery-Session": "gs-token",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:8080/api/v1/public/galleries/wedding/favorites/asset-1?ws=studio-a1b2c3d4&session=guest-1",
      expect.objectContaining({
        credentials: "include",
        headers: { "X-Gallery-Session": "gs-token" },
      }),
    );
  });
});
