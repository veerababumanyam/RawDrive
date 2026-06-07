import { describe, expect, it, vi } from "vitest";

import type { GalleryShareLink } from "@/lib/api/galleries";
import {
  isReusableStableGalleryShareLink,
  newestReusableStableGalleryShareLink,
  resolveStablePublicGalleryShareLink,
} from "@/lib/gallery-share-link-resolver";

const NOW = new Date("2026-06-07T12:00:00Z");

function shareLink(
  overrides: Partial<GalleryShareLink> = {},
): GalleryShareLink {
  return {
    id: "share-1",
    gallery_id: "gallery-1",
    token: "stable-token",
    permissions: { access_mode: "public", channel: "copy" },
    download_allowed: true,
    access_count: 0,
    created_at: "2026-06-07T10:00:00Z",
    ...overrides,
  };
}

describe("gallery stable share-link resolver", () => {
  it("reuses the newest active compatible copy link", () => {
    const older = shareLink({
      id: "older",
      token: "older-token",
      created_at: "2026-06-07T09:00:00Z",
    });
    const newer = shareLink({
      id: "newer",
      token: "newer-token",
      created_at: "2026-06-07T11:00:00Z",
    });

    expect(
      newestReusableStableGalleryShareLink([older, newer], {
        downloadAllowed: true,
        now: NOW,
      }),
    ).toBe(newer);
  });

  it("also accepts the dedicated QR channel for forward compatibility", () => {
    expect(
      isReusableStableGalleryShareLink(
        shareLink({
          permissions: { access_mode: "public", channel: "share-qr" },
        }),
        { downloadAllowed: true, now: NOW },
      ),
    ).toBe(true);
  });

  it("ignores links that are not safe to reuse for persistent QR/copy", () => {
    const cases: GalleryShareLink[] = [
      shareLink({ revoked_at: "2026-06-07T11:00:00Z" }),
      shareLink({ expires_at: "2026-06-07T11:00:00Z" }),
      shareLink({ expires_at: "not-a-date" }),
      shareLink({ max_access_count: 10 }),
      shareLink({ download_allowed: false }),
      shareLink({ permissions: { access_mode: "pin", channel: "copy" } }),
      shareLink({ permissions: { access_mode: "public", channel: "email" } }),
      shareLink({ permissions: { access_mode: "public" } }),
    ];

    for (const link of cases) {
      expect(
        isReusableStableGalleryShareLink(link, {
          downloadAllowed: true,
          now: NOW,
        }),
      ).toBe(false);
    }
  });

  it("returns an existing reusable link without creating a new token", async () => {
    const existing = shareLink({ token: "existing-token" });
    const createLink = vi.fn();

    await expect(
      resolveStablePublicGalleryShareLink({
        token: "owner-token",
        galleryId: "gallery-1",
        downloadAllowed: true,
        listLinks: vi.fn().mockResolvedValue([existing]),
        createLink,
        now: NOW,
      }),
    ).resolves.toBe(existing);

    expect(createLink).not.toHaveBeenCalled();
  });

  it("creates a copy-channel public link when no reusable token exists", async () => {
    const created = shareLink({ token: "new-token" });
    const createLink = vi.fn().mockResolvedValue(created);

    await expect(
      resolveStablePublicGalleryShareLink({
        token: "owner-token",
        galleryId: "gallery-1",
        downloadAllowed: true,
        expiryDays: 12,
        listLinks: vi
          .fn()
          .mockResolvedValue([
            shareLink({
              permissions: { access_mode: "public", channel: "email" },
            }),
          ]),
        createLink,
        now: NOW,
      }),
    ).resolves.toBe(created);

    expect(createLink).toHaveBeenCalledWith("owner-token", "gallery-1", {
      access_mode: "public",
      download_allowed: true,
      channel: "copy",
      expiry_days: 12,
    });
  });
});
