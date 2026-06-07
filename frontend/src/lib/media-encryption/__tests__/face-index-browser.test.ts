import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthTokens, persistAuthTokens } from "@/lib/auth";
import { indexAssetFacesFromBrowser } from "../face-index-browser";

const mockFetch = vi.fn<typeof fetch>();
global.fetch = mockFetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("indexAssetFacesFromBrowser", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    persistAuthTokens("owner-token");
  });

  afterEach(() => {
    clearAuthTokens();
  });

  it("fetches owner-protected media and POSTs the image to the face index endpoint", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(new Blob(["webp"], { type: "image/webp" })),
      )
      .mockResolvedValueOnce(jsonResponse({ stored: 2 }));

    const result = await indexAssetFacesFromBrowser(
      {
        id: "asset-1",
        is_encrypted: false,
        thumbnail_urls: { display_webp: "/storage/display.webp" },
      },
      { galleryId: "gallery-1", token: "owner-token" },
    );

    expect(result).toEqual({
      stored: 2,
      variant: "display_webp",
      encrypted: false,
    });

    const [mediaUrl, mediaInit] = mockFetch.mock.calls[0];
    expect(String(mediaUrl)).toContain("/storage/display.webp");
    expect(mediaInit?.credentials).toBe("include");
    expect(new Headers(mediaInit?.headers).get("Authorization")).toBe(
      "Bearer owner-token",
    );

    const [indexUrl, indexInit] = mockFetch.mock.calls[1];
    expect(String(indexUrl)).toContain(
      "/api/v1/assets/asset-1/face-index-image",
    );
    expect(indexInit?.method).toBe("POST");
    expect(indexInit?.credentials).toBe("include");
    expect(new Headers(indexInit?.headers).get("Authorization")).toBe(
      "Bearer owner-token",
    );
    const body = indexInit?.body as FormData;
    expect(body.get("gallery_id")).toBe("gallery-1");
    expect(body.get("image")).toBeInstanceOf(Blob);
  });

  it("retries a smaller derivative when the display frame is too large", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(new Blob(["large"], { type: "image/webp" })),
      )
      .mockResolvedValueOnce(
        new Response(`{"error":"image file too large"}`, { status: 413 }),
      )
      .mockResolvedValueOnce(
        new Response(new Blob(["small"], { type: "image/webp" })),
      )
      .mockResolvedValueOnce(jsonResponse({ stored: 1 }));

    const result = await indexAssetFacesFromBrowser(
      {
        id: "asset-2",
        is_encrypted: false,
        thumbnail_urls: {
          display_webp: "/storage/display.webp",
          thumb_md_webp: "/storage/thumb-md.webp",
        },
      },
      { galleryId: "gallery-1", token: "owner-token" },
    );

    expect(result.variant).toBe("thumb_md_webp");
    expect(result.stored).toBe(1);
    expect(String(mockFetch.mock.calls[2][0])).toContain(
      "/storage/thumb-md.webp",
    );
  });

  it("retries a smaller derivative on a 502 / body-reset (not just 413)", async () => {
    // The documented prod symptom: the over-cap body trips MaxBytesReader, nginx
    // returns 502 (not a clean 413). The classifier must treat that as
    // retryable and fall through to the smaller stored derivative instead of
    // aborting with no downscale.
    mockFetch
      .mockResolvedValueOnce(
        new Response(new Blob(["large"], { type: "image/webp" })),
      )
      .mockResolvedValueOnce(new Response("502 Bad Gateway", { status: 502 }))
      .mockResolvedValueOnce(
        new Response(new Blob(["small"], { type: "image/webp" })),
      )
      .mockResolvedValueOnce(jsonResponse({ stored: 1 }));

    const result = await indexAssetFacesFromBrowser(
      {
        id: "asset-502",
        is_encrypted: false,
        thumbnail_urls: {
          display_webp: "/storage/display.webp",
          thumb_md_webp: "/storage/thumb-md.webp",
        },
      },
      { galleryId: "gallery-1", token: "owner-token" },
    );

    expect(result.variant).toBe("thumb_md_webp");
    expect(result.stored).toBe(1);
    // It actually attempted the smaller frame (4 calls: media+POST x2), proving
    // the 502 did not abort the loop.
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(String(mockFetch.mock.calls[2][0])).toContain(
      "/storage/thumb-md.webp",
    );
  });

  it("falls back to the encrypted original when derivative objects are missing", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(new Blob(["original"], { type: "image/jpeg" })),
      )
      .mockResolvedValueOnce(jsonResponse({ stored: 3 }));

    const result = await indexAssetFacesFromBrowser(
      {
        id: "asset-3",
        is_encrypted: false,
        storage_key: "originals/asset-3/original.jpeg",
        thumbnail_urls: {
          display_webp: "derivatives/asset-3/display_webp.webp",
        },
      },
      { galleryId: "gallery-1", token: "owner-token" },
    );

    expect(result).toEqual({
      stored: 3,
      variant: "original",
      encrypted: false,
    });
    expect(String(mockFetch.mock.calls[0][0])).toContain(
      "/storage/derivatives/asset-3/display_webp.webp",
    );
    expect(String(mockFetch.mock.calls[1][0])).toContain(
      "/storage/originals/asset-3/original.jpeg",
    );
  });
});
