import { describe, it, expect, beforeEach } from "vitest";
import { purgeDecision, sanitizeGallerySettings } from "../sync";
import { AUTH_QUERY_PARAMS } from "../cache-keys";
import { saveGalleryMeta, getGalleryMeta, listSaved, removeGallery } from "../catalog";
import type { SavedGalleryMeta } from "../types";

describe("revalidation purge decision", () => {
  it("purges on definitive access-denied statuses", () => {
    for (const status of [403, 404, 410]) {
      expect(purgeDecision({ ok: false, status })).toBe("purge");
    }
  });
  it("keeps on success", () => {
    expect(purgeDecision({ ok: true, status: 200 })).toBe("keep");
  });
  it("keeps (does NOT purge) on transient/network errors", () => {
    expect(purgeDecision({ ok: false, status: 0 })).toBe("keep");
    expect(purgeDecision({ ok: false, status: 500 })).toBe("keep");
    expect(purgeDecision({ ok: false, status: 503 })).toBe("keep");
  });
});

describe("sanitizeGallerySettings (SEC-1: never persist asset-access/session tokens)", () => {
  // A realistic settings blob: the rotating credential the backend injects
  // (asset_access_token) + the AUTH_QUERY_PARAM family, alongside the
  // render-needed fields the offline renderers/catalog must keep.
  const leakySettings: Record<string, unknown> = {
    asset_access_token: "ROTATING_SECRET_TOKEN_DO_NOT_PERSIST",
    token: "another-secret",
    gallery_session: "session-secret",
    at: "short-at",
    gs: "short-gs",
    access_token: "oauthy-secret",
    // render-needed fields — MUST survive sanitization
    cover_template: "full_bleed",
    cover_config: { focal: { x: 50, y: 50 } },
    design_config: { theme: { variant: "dark" } },
    watermark_config: { enabled: true, text: "© Studio" },
    cover_thumbnails: { display_webp: "k/display.webp" },
    max_selections: 25,
  };

  const RENDER_KEYS = [
    "cover_template",
    "cover_config",
    "design_config",
    "watermark_config",
    "cover_thumbnails",
    "max_selections",
  ];

  it("strips asset_access_token and every AUTH_QUERY_PARAM, keeps render fields", () => {
    const cleaned = sanitizeGallerySettings(leakySettings);

    // No credential keys survive.
    expect(cleaned).not.toHaveProperty("asset_access_token");
    for (const k of AUTH_QUERY_PARAMS) {
      expect(cleaned).not.toHaveProperty(k);
    }

    // Serialized form leaks none of the secret VALUES either.
    const serialized = JSON.stringify(cleaned);
    expect(serialized).not.toContain("ROTATING_SECRET_TOKEN_DO_NOT_PERSIST");
    expect(serialized).not.toContain("session-secret");
    expect(serialized).not.toContain("oauthy-secret");

    // Render fields are preserved verbatim.
    for (const k of RENDER_KEYS) {
      expect(cleaned).toHaveProperty(k);
    }
    expect(cleaned.cover_template).toBe("full_bleed");
    expect(cleaned.max_selections).toBe(25);
    expect((cleaned.watermark_config as Record<string, unknown>).text).toBe("© Studio");
  });

  it("does not mutate the input object", () => {
    const input = { asset_access_token: "x", cover_template: "none" };
    const cleaned = sanitizeGallerySettings(input);
    expect(input).toHaveProperty("asset_access_token"); // original untouched
    expect(cleaned).not.toHaveProperty("asset_access_token");
  });

  it("handles null/undefined/non-object gracefully", () => {
    expect(sanitizeGallerySettings(null)).toEqual({});
    expect(sanitizeGallerySettings(undefined)).toEqual({});
  });

  describe("persisted catalog entry (IndexedDB at rest)", () => {
    beforeEach(async () => {
      for (const m of await listSaved()) await removeGallery(m.slug);
    });

    it("never writes the credential to IndexedDB; render fields survive", async () => {
      const meta: SavedGalleryMeta = {
        slug: "sec1-gallery",
        galleryId: "g-sec1",
        ws: null,
        title: "SEC-1 Gallery",
        isEncrypted: false,
        keyId: null,
        assets: [],
        // This is exactly the line cacheGalleryForOffline now writes.
        gallerySettings: sanitizeGallerySettings(leakySettings),
        etag: null,
        expiresAt: null,
        lastViewedAt: 1000,
        lastValidatedAt: 1000,
        approxBytes: 0,
      };
      await saveGalleryMeta(meta);

      const saved = await getGalleryMeta("sec1-gallery");
      expect(saved).not.toBeNull();

      const serialized = JSON.stringify(saved);
      // No credential key NAME and no secret VALUE persisted at rest.
      expect(serialized).not.toContain("asset_access_token");
      expect(serialized).not.toContain("ROTATING_SECRET_TOKEN_DO_NOT_PERSIST");
      for (const k of AUTH_QUERY_PARAMS) {
        expect(saved!.gallerySettings).not.toHaveProperty(k);
      }
      // Render fields persisted.
      expect(saved!.gallerySettings.cover_template).toBe("full_bleed");
      expect(saved!.gallerySettings.design_config).toBeTruthy();
    });
  });
});
