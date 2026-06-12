import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Gallery, PublicAsset } from "@/lib/api/galleries";
import { OfflineCacher } from "../offline-cacher";

const cacheGalleryForOffline = vi.hoisted(() => vi.fn());

vi.mock("@/lib/offline/sync", () => ({
  cacheGalleryForOffline,
}));

const gallery: Gallery = {
  id: "gallery-1",
  workspace_id: "workspace-1",
  title: "Wedding",
  slug: "wedding",
  description: "",
  gallery_type: "delivery",
  is_published: true,
  max_selections: 0,
  status: "published",
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};

const asset: PublicAsset = {
  id: "asset-1",
  filename: "DSC_0001.JPG",
  content_type: "image/jpeg",
  thumbnail_urls: { display_webp: "/storage/asset-1.webp" },
  sort_order: 1,
};

describe("OfflineCacher", () => {
  beforeEach(() => {
    cacheGalleryForOffline.mockReset();
  });

  it("warms offline storage for small galleries", async () => {
    render(
      <OfflineCacher
        gallery={gallery}
        assets={[asset]}
        totalAssetCount={1}
        ws={null}
        assetAccessToken={null}
      />,
    );

    await waitFor(() => {
      expect(cacheGalleryForOffline).toHaveBeenCalledWith(
        gallery,
        [asset],
        null,
        null,
      );
    });
  });

  it("does not auto-cache huge public galleries on first render", async () => {
    render(
      <OfflineCacher
        gallery={gallery}
        assets={[asset]}
        totalAssetCount={10600}
        ws={null}
        assetAccessToken={null}
      />,
    );

    await Promise.resolve();
    expect(cacheGalleryForOffline).not.toHaveBeenCalled();
  });
});
