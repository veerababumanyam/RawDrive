import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPublicGallery,
  getPublicGalleryAssets,
  getPublicGalleryBranding,
  getPublicGalleryWithSession,
  publicGalleryMusicUrl,
} from "../galleries";
import { listPublicBanners, listPublicProducts } from "../commerce";

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

  it("builds music URLs with share scope when no asset-access token exists", () => {
    expect(
      publicGalleryMusicUrl("wedding", "kaveri-a1", null, "share/token"),
    ).toBe(
      "http://localhost:8080/api/v1/public/galleries/wedding/music?ws=kaveri-a1&share=share%2Ftoken",
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
      { cache: "no-store" },
    );
  });

  it("forwards workspace scope to optional public commerce panels", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ gallerybanners: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response);

    await listPublicBanners("wedding", "kaveri-a1");
    await listPublicProducts("wedding", "kaveri-a1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8080/api/v1/public/galleries/wedding/banners?ws=kaveri-a1",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8080/api/v1/public/galleries/wedding/products?ws=kaveri-a1",
    );
  });

  it("forwards share scope on first-touch gallery fetch and captures minted session", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "X-Gallery-Session": "minted-session" }),
      json: async () => ({ id: "gallery-1", title: "Wedding" }),
    } as Response);

    const result = await getPublicGalleryWithSession(
      "wedding",
      "stale-a1",
      null,
      "share-token",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/public/galleries/wedding?ws=stale-a1&share=share-token",
      { cache: "no-store" },
    );
    expect(result.gallerySessionToken).toBe("minted-session");
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
    await getPublicGalleryAssets(
      "wedding",
      undefined,
      "kaveri-a1",
      "session-token",
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8080/api/v1/public/galleries/wedding?ws=kaveri-a1",
      { cache: "no-store", headers: { "X-Gallery-Session": "session-token" } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8080/api/v1/public/galleries/wedding/assets?ws=kaveri-a1",
      { cache: "no-store", headers: { "X-Gallery-Session": "session-token" } },
    );
  });

  it("uses gallery session headers for follow-up commerce calls", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ gallerybanners: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response);

    await listPublicBanners("wedding", "stale-a1", undefined, "minted-session");
    await listPublicProducts(
      "wedding",
      "stale-a1",
      undefined,
      "minted-session",
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8080/api/v1/public/galleries/wedding/banners?ws=stale-a1",
      { headers: { "X-Gallery-Session": "minted-session" } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8080/api/v1/public/galleries/wedding/products?ws=stale-a1",
      { headers: { "X-Gallery-Session": "minted-session" } },
    );
  });
});
