import { describe, it, expect } from "vitest";
import { selectGalleriesToEvict } from "../storage";
import type { SavedGalleryMeta } from "../types";

const g = (slug: string, lastViewedAt: number, approxBytes: number): SavedGalleryMeta => ({
  slug, galleryId: slug, ws: null, title: slug, isEncrypted: false, keyId: null,
  assets: [], gallerySettings: {}, etag: null, expiresAt: null,
  lastViewedAt, lastValidatedAt: 0, approxBytes,
});

describe("whole-gallery LRU eviction", () => {
  it("evicts least-recently-viewed whole galleries until under cap", () => {
    const saved = [g("a", 100, 600), g("b", 300, 600), g("c", 200, 600)]; // total 1800
    const evict = selectGalleriesToEvict(saved, 1000); // need to drop >=800
    // oldest first: a(100) then c(200) -> 1200 freed >= 800, stop before b
    expect(evict).toEqual(["a", "c"]);
  });

  it("returns empty when already under cap", () => {
    expect(selectGalleriesToEvict([g("a", 1, 100)], 1000)).toEqual([]);
  });

  it("never partially evicts — returns whole slugs only", () => {
    const evict = selectGalleriesToEvict([g("a", 1, 5000)], 1000);
    expect(evict).toEqual(["a"]);
  });
});
