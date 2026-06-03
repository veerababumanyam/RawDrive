import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPublicGallery,
  getPublicGalleryAssets,
  getPublicGalleryBranding,
  publicGalleryMusicUrl,
} from "../galleries";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("public gallery URL/session wiring", () => {
  it("builds music URLs with workspace scope and asset-access token (?at=)", () => {
    expect(publicGalleryMusicUrl("wedding", "kaveri-a1", "a/b+c==")).toBe(
      "http://localhost:8080/api/v1/public/galleries/wedding/music?ws=kaveri-a1&at=a%2Fb%2Bc%3D%3D",
    );
  });

  it("forwards workspace scope to gallery branding", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        can_customize: true,
        brand_name: "Kaveri Stories",
      }),
    } as Response);

    await getPublicGalleryBranding("wedding", "kaveri-a1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/public/galleries/wedding/branding?ws=kaveri-a1",
    );
  });

  it("forwards private-gallery session headers on gallery and asset fetches", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: "gallery-1", title: "Wedding" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response);

    await getPublicGallery("wedding", "kaveri-a1", "session-token");
    await getPublicGalleryAssets("wedding", undefined, "kaveri-a1", "session-token");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8080/api/v1/public/galleries/wedding?ws=kaveri-a1",
      { headers: { "X-Gallery-Session": "session-token" } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8080/api/v1/public/galleries/wedding/assets?ws=kaveri-a1",
      { headers: { "X-Gallery-Session": "session-token" } },
    );
  });
});
