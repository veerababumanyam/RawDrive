import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import type { SavedGalleryMeta } from "@/lib/offline/types";

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock the catalog so tests don't need a real IndexedDB.
vi.mock("@/lib/offline/catalog", () => ({
  getGalleryMeta: vi.fn(),
  touchViewed: vi.fn().mockResolvedValue(undefined),
}));

// OfflineGalleryView pulls in PublicGalleryGrid (browser-only APIs). Mock it so
// this gate test asserts only the online-vs-offline routing decision.
vi.mock("../offline-gallery-view", () => ({
  OfflineGalleryView: vi.fn(({ slug }: { slug: string }) => (
    <div data-testid="offline-gallery-view" data-slug={slug} />
  )),
}));

const catalogMod = await import("@/lib/offline/catalog");
const mockedGetGalleryMeta = vi.mocked(catalogMod.getGalleryMeta);

const { PublicGalleryOfflineGate } = await import("../public-gallery-offline-gate");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMeta(overrides: Partial<SavedGalleryMeta> = {}): SavedGalleryMeta {
  return {
    slug: "wedding-2025",
    galleryId: "g-abc",
    ws: null,
    title: "Wedding 2025",
    isEncrypted: false,
    keyId: null,
    assets: [],
    gallerySettings: {},
    etag: null,
    expiresAt: null,
    lastViewedAt: 0,
    lastValidatedAt: 0,
    approxBytes: 0,
    ...overrides,
  };
}

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
  });
}

const OnlineChild = () => <div data-testid="online-content">online grid</div>;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PublicGalleryOfflineGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setOnline(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setOnline(true);
  });

  it("renders the online children when navigator.onLine is true", async () => {
    mockedGetGalleryMeta.mockResolvedValue(makeMeta());

    render(
      <PublicGalleryOfflineGate slug="wedding-2025">
        <OnlineChild />
      </PublicGalleryOfflineGate>,
    );

    expect(screen.getByTestId("online-content")).toBeInTheDocument();
    // Give the catalog probe a chance to run — it must NOT swap to offline view
    // while online.
    await waitFor(() => {
      expect(screen.queryByTestId("offline-gallery-view")).not.toBeInTheDocument();
    });
  });

  it("renders OfflineGalleryView when offline AND a saved catalog entry exists", async () => {
    setOnline(false);
    mockedGetGalleryMeta.mockResolvedValue(makeMeta());

    render(
      <PublicGalleryOfflineGate slug="wedding-2025">
        <OnlineChild />
      </PublicGalleryOfflineGate>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("offline-gallery-view")).toBeInTheDocument();
    });
    expect(screen.getByTestId("offline-gallery-view")).toHaveAttribute("data-slug", "wedding-2025");
    expect(screen.queryByTestId("online-content")).not.toBeInTheDocument();
  });

  it("keeps the online children when offline but NO saved entry exists", async () => {
    setOnline(false);
    mockedGetGalleryMeta.mockResolvedValue(null);

    render(
      <PublicGalleryOfflineGate slug="unknown-gallery">
        <OnlineChild />
      </PublicGalleryOfflineGate>,
    );

    // No saved copy → nothing to render offline, so the (broken) online content
    // is left in place rather than a misleading "saved copy" shell.
    await waitFor(() => {
      expect(mockedGetGalleryMeta).toHaveBeenCalledWith("unknown-gallery");
    });
    expect(screen.getByTestId("online-content")).toBeInTheDocument();
    expect(screen.queryByTestId("offline-gallery-view")).not.toBeInTheDocument();
  });

  it("swaps to the offline view when an offline event fires after mount", async () => {
    setOnline(true);
    mockedGetGalleryMeta.mockResolvedValue(makeMeta());

    render(
      <PublicGalleryOfflineGate slug="wedding-2025">
        <OnlineChild />
      </PublicGalleryOfflineGate>,
    );

    expect(screen.getByTestId("online-content")).toBeInTheDocument();

    // Network drops after the page has mounted online.
    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("offline-gallery-view")).toBeInTheDocument();
    });
  });
});
