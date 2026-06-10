import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGalleryShareLink,
  deleteGallery,
  listGalleryMediaKeys,
  listGalleryShareLinks,
  reorderGalleryAssets,
  revokeGalleryShareLink,
  upsertGalleryMediaKey,
} from "../galleries";
import { persistAuthTokens, clearAuthTokens } from "@/lib/auth";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // These gallery share helpers route through authFetch, which reads the
  // in-memory access-token cache (getStoredAccessToken) rather than its
  // token arg. Seed the cache so the Authorization header is attached.
  persistAuthTokens("token");
});

afterEach(() => {
  clearAuthTokens();
});

describe("gallery share API", () => {
  it("lists gallery share links through the protected gallery workspace route", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "share-1", token: "token-1", access_count: 2 }],
    });

    const links = await listGalleryShareLinks("token", "gallery-1");

    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain("/api/v1/galleries/gallery-1/share");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token");
    expect(links[0].token).toBe("token-1");
  });

  it("creates share links with access mode, recipients, expiry, and share copy", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "share-1",
        token: "token-1",
        permissions: { access_mode: "pin" },
      }),
    });

    await createGalleryShareLink("token", "gallery-1", {
      access_mode: "pin",
      pin: "123456",
      expiry_days: 14,
      recipient_emails: ["client@example.com"],
      message: "Gallery is ready: {link}",
      channel: "whatsapp",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/galleries/gallery-1/share"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"access_mode":"pin"'),
      }),
    );
    expect(fetchMock.mock.calls[0][1].body).toContain(
      '"recipient_emails":["client@example.com"]',
    );
  });

  it("revokes share links under the same gallery workspace", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });

    await revokeGalleryShareLink("token", "gallery-1", "share-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/galleries/gallery-1/share/share-1"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("deletes galleries with keepalive so browser close does not cancel cleanup", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });

    await deleteGallery("token", "gallery-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/galleries/gallery-1"),
      expect.objectContaining({
        method: "DELETE",
        keepalive: true,
      }),
    );
  });

  it("persists gallery photo order through the protected reorder route", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });

    await reorderGalleryAssets("token", "gallery-1", [
      { asset_id: "asset-2", sort_order: 0 },
      { asset_id: "asset-1", sort_order: 1 },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/galleries/gallery-1/assets/reorder"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          order: [
            { asset_id: "asset-2", sort_order: 0 },
            { asset_id: "asset-1", sort_order: 1 },
          ],
        }),
      }),
    );
  });

  it("lists and saves gallery media keys through the protected gallery workspace route", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          keys: [
            {
              key_id: "gallery:gallery-1:abcdef1234567890",
              exported_key: "raw-key",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          key: {
            key_id: "gallery:gallery-1:abcdef1234567890",
            exported_key: "raw-key",
          },
        }),
      });

    const keys = await listGalleryMediaKeys("gallery-1");
    const saved = await upsertGalleryMediaKey("gallery-1", {
      key_id: "gallery:gallery-1:abcdef1234567890",
      exported_key: "raw-key",
    });

    expect(keys).toEqual([
      { key_id: "gallery:gallery-1:abcdef1234567890", exported_key: "raw-key" },
    ]);
    expect(saved.exported_key).toBe("raw-key");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/api/v1/galleries/gallery-1/media-keys"),
      expect.objectContaining({
        credentials: "include",
        headers: expect.any(Headers),
      }),
    );
    expect(
      new Headers(fetchMock.mock.calls[0][1].headers).get("Authorization"),
    ).toBe("Bearer token");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/api/v1/galleries/gallery-1/media-keys"),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          key_id: "gallery:gallery-1:abcdef1234567890",
          exported_key: "raw-key",
        }),
      }),
    );
  });
});
