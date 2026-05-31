import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGalleryShareLink,
  listGalleryShareLinks,
  revokeGalleryShareLink,
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
      json: async () => ({ id: "share-1", token: "token-1", permissions: { access_mode: "pin" } }),
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
    expect(fetchMock.mock.calls[0][1].body).toContain('"recipient_emails":["client@example.com"]');
  });

  it("revokes share links under the same gallery workspace", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });

    await revokeGalleryShareLink("token", "gallery-1", "share-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/galleries/gallery-1/share/share-1"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
