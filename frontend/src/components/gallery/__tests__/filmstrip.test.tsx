import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "@/lib/api/assets";

const mocks = vi.hoisted(() => ({
  getStoredAccessToken: vi.fn(() => "test-token"),
  useDecryptedAssetUrl: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: mocks.getStoredAccessToken,
}));

vi.mock("@/lib/media-encryption/use-decrypted-asset-url", () => ({
  useDecryptedAssetUrl: mocks.useDecryptedAssetUrl,
}));

import { Filmstrip } from "../filmstrip";

function asset(id: string, filename: string): Asset {
  return {
    id,
    workspace_id: "workspace-filmstrip",
    filename,
    content_type: "image/jpeg",
    size_bytes: 1024,
    storage_key: `originals/${id}.jpg.enc`,
    exif_data: {},
    thumbnail_urls: {
      thumb_sm_webp: `thumbnails/${id}/thumb_sm_webp.webp.enc`,
      thumb_md_webp: `thumbnails/${id}/thumb_md_webp.webp.enc`,
      display_webp: `derivatives/${id}/display_webp.webp.enc`,
    },
    status: "ready",
    created_at: "2026-01-01T00:00:00Z",
    is_encrypted: true,
    media_encryption: {
      scheme: "rawdrive-e2ee-v1",
      variants: {},
    },
  };
}

describe("Filmstrip", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    mocks.getStoredAccessToken.mockClear();
    mocks.useDecryptedAssetUrl.mockReset();
    mocks.useDecryptedAssetUrl.mockImplementation((inputAsset: Asset, variants: readonly string[]) => ({
      src: variants[0] === "display_webp"
        ? `blob:display-${inputAsset.id}`
        : `blob:thumb-${inputAsset.id}`,
      loading: false,
      error: null,
    }));
  });

  it("uses the smallest WebP thumbnail variant first for quick lightbox navigation", () => {
    render(
      <Filmstrip
        assets={[asset("asset-1", "DSC_6231.JPG"), asset("asset-2", "DSC_7152.JPG")]}
        activeId="asset-1"
        onSelect={vi.fn()}
      />,
    );

    expect(mocks.useDecryptedAssetUrl).toHaveBeenCalledWith(
      expect.objectContaining({ id: "asset-1" }),
      expect.arrayContaining(["thumb_sm_webp"]),
      "test-token",
    );
    expect(mocks.useDecryptedAssetUrl.mock.calls[0]?.[1]?.[0]).toBe("thumb_sm_webp");
  });

  it("falls back to display WebP when a thumbnail derivative decodes as a broken image", async () => {
    render(
      <Filmstrip
        assets={[asset("asset-1", "DSC_6231.JPG"), asset("asset-2", "DSC_7152.JPG")]}
        activeId="asset-1"
        onSelect={vi.fn()}
      />,
    );

    const activeThumb = screen.getByRole("tab", { name: "DSC_6231.JPG" });
    const thumbImage = activeThumb.querySelector("img") as HTMLImageElement;
    expect(thumbImage).toHaveAttribute("src", "blob:thumb-asset-1");

    fireEvent.error(thumbImage);

    await waitFor(() => {
      expect(activeThumb.querySelector("img")).toHaveAttribute("src", "blob:display-asset-1");
    });
  });
});
