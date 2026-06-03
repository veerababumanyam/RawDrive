import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { saveGalleryMeta, listSaved, removeGallery } from "@/lib/offline/catalog";
import type { SavedGalleryMeta } from "@/lib/offline/types";
import { ManageOfflineStorage } from "../manage-offline-storage";

// jsdom has no navigator.serviceWorker — stub it so the component guard works
vi.stubGlobal("navigator", {
  ...navigator,
  serviceWorker: undefined,
  storage: {
    estimate: async () => ({ usage: 5 * 1024 * 1024, quota: 500 * 1024 * 1024 }),
  },
  onLine: true,
});

const makeGallery = (overrides: Partial<SavedGalleryMeta> & { slug: string; galleryId: string }): SavedGalleryMeta => {
  const { slug, galleryId, title, lastViewedAt, approxBytes, ...rest } = overrides;
  return {
    ws: null,
    isEncrypted: false,
    keyId: null,
    assets: [],
    gallerySettings: {},
    etag: null,
    expiresAt: null,
    lastValidatedAt: 1000,
    // Apply remaining overrides first, then specific mandatory ones so they win
    ...rest,
    slug,
    galleryId,
    title: title ?? slug,
    lastViewedAt: lastViewedAt ?? 1000,
    approxBytes: approxBytes ?? 1024 * 1024,
  };
};

describe("ManageOfflineStorage", () => {
  beforeEach(async () => {
    // Clear catalog
    for (const m of await listSaved()) await removeGallery(m.slug);
  });

  it("renders both gallery titles after seeding two galleries", async () => {
    await saveGalleryMeta(makeGallery({ slug: "wedding-kiran", galleryId: "g1", title: "Kiran & Priya Wedding" }));
    await saveGalleryMeta(makeGallery({ slug: "pre-shoot-arjun", galleryId: "g2", title: "Arjun Pre-Shoot" }));

    render(<ManageOfflineStorage />);

    expect(await screen.findByText("Kiran & Priya Wedding")).toBeInTheDocument();
    expect(await screen.findByText("Arjun Pre-Shoot")).toBeInTheDocument();
  });

  it("clicking Remove button removes the gallery from the catalog", async () => {
    await saveGalleryMeta(makeGallery({ slug: "wedding-kiran", galleryId: "g1", title: "Kiran & Priya Wedding", lastViewedAt: 2000 }));
    await saveGalleryMeta(makeGallery({ slug: "pre-shoot-arjun", galleryId: "g2", title: "Arjun Pre-Shoot", lastViewedAt: 1000 }));

    render(<ManageOfflineStorage />);

    // Wait for both items to appear
    await screen.findByText("Kiran & Priya Wedding");
    await screen.findByText("Arjun Pre-Shoot");

    // Click remove for "Kiran & Priya Wedding"
    const removeBtn = screen.getByRole("button", { name: /Remove offline copy of Kiran & Priya Wedding/i });
    fireEvent.click(removeBtn);

    // Wait for item to disappear from the UI
    await waitFor(() => {
      expect(screen.queryByText("Kiran & Priya Wedding")).not.toBeInTheDocument();
    });

    // Verify catalog was actually updated
    const remaining = await listSaved();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].slug).toBe("pre-shoot-arjun");
  });

  it("shows empty state when no galleries are saved", async () => {
    render(<ManageOfflineStorage />);
    expect(await screen.findByText(/No galleries saved offline yet/i)).toBeInTheDocument();
  });
});
