import { describe, it, expect, beforeEach } from "vitest";
import { saveGalleryMeta, getGalleryMeta, listSaved, removeGallery, markValidated, touchViewed } from "../catalog";
import type { SavedGalleryMeta } from "../types";

const base: SavedGalleryMeta = {
  slug: "tey-1", galleryId: "g1", ws: null, title: "Tey", isEncrypted: false,
  keyId: null, assets: [], gallerySettings: {}, etag: "v1", expiresAt: null,
  lastViewedAt: 1000, lastValidatedAt: 1000, approxBytes: 100,
};

describe("offline catalog", () => {
  beforeEach(async () => {
    for (const m of await listSaved()) await removeGallery(m.slug);
  });

  it("saves and reads a gallery by slug", async () => {
    await saveGalleryMeta(base);
    const got = await getGalleryMeta("tey-1");
    expect(got?.title).toBe("Tey");
  });

  it("lists saved galleries", async () => {
    await saveGalleryMeta(base);
    await saveGalleryMeta({ ...base, slug: "tey-2", galleryId: "g2" });
    const all = await listSaved();
    expect(all.map((m) => m.slug).sort()).toEqual(["tey-1", "tey-2"]);
  });

  it("removes a gallery", async () => {
    await saveGalleryMeta(base);
    await removeGallery("tey-1");
    expect(await getGalleryMeta("tey-1")).toBeNull();
  });

  it("markValidated updates etag + lastValidatedAt", async () => {
    await saveGalleryMeta(base);
    await markValidated("tey-1", "v2", 5000);
    const got = await getGalleryMeta("tey-1");
    expect(got?.etag).toBe("v2");
    expect(got?.lastValidatedAt).toBe(5000);
  });

  it("touchViewed bumps lastViewedAt", async () => {
    await saveGalleryMeta(base);
    await touchViewed("tey-1", 9000);
    expect((await getGalleryMeta("tey-1"))?.lastViewedAt).toBe(9000);
  });
});
