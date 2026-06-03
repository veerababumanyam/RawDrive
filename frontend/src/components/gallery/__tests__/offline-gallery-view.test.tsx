import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { SavedGalleryMeta } from "@/lib/offline/types";

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock the catalog so tests don't need a real IndexedDB.
vi.mock("@/lib/offline/catalog", () => ({
  getGalleryMeta: vi.fn(),
  touchViewed: vi.fn().mockResolvedValue(undefined),
}));

// PublicGalleryGrid pulls in many browser-only APIs (fullscreen, fetch, …).
// Mock it minimally so the component test can assert what it renders without
// spinning up the entire grid machinery in jsdom.
vi.mock("../public-gallery-grid", () => ({
  PublicGalleryGrid: vi.fn(({ assets }: { assets: unknown[] }) => (
    <div data-testid="public-gallery-grid" data-asset-count={assets.length} />
  )),
}));

// Import the mocked modules so we can configure them per-test.
const catalogMod = await import("@/lib/offline/catalog");
const mockedGetGalleryMeta = vi.mocked(catalogMod.getGalleryMeta);
const mockedTouchViewed = vi.mocked(catalogMod.touchViewed);

const gridMod = await import("../public-gallery-grid");
const MockedGrid = vi.mocked(gridMod.PublicGalleryGrid);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMeta(overrides: Partial<SavedGalleryMeta> = {}): SavedGalleryMeta {
  return {
    slug: "wedding-2025",
    galleryId: "g-abc",
    ws: "studio-ws",
    title: "Wedding 2025",
    isEncrypted: false,
    keyId: null,
    assets: [
      {
        id: "asset-1",
        filename: "photo.webp",
        displayKey: "storage/galleries/g-abc/display/asset-1.webp",
        thumbnailUrls: {
          thumb_md_webp: "storage/galleries/g-abc/thumbs/asset-1-md.webp",
        },
        manifest: null,
        width: 1920,
        height: 1080,
        blurhash: "LEHV6n",
      },
    ],
    gallerySettings: {},
    etag: "abc123",
    expiresAt: null,
    lastViewedAt: 0,
    lastValidatedAt: 0,
    approxBytes: 1024,
    ...overrides,
  };
}

// Import the component under test AFTER mocks are set up.
const { OfflineGalleryView } = await import("../offline-gallery-view");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("OfflineGalleryView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading state while the catalog is being read", () => {
    // Never-resolving promise keeps the component in loading state.
    mockedGetGalleryMeta.mockReturnValue(new Promise(() => {}));

    render(<OfflineGalleryView slug="wedding-2025" />);
    expect(screen.getByText(/loading saved gallery/i)).toBeInTheDocument();
  });

  it("renders the gallery title once meta is found", async () => {
    mockedGetGalleryMeta.mockResolvedValue(makeMeta());

    render(<OfflineGalleryView slug="wedding-2025" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Wedding 2025/i })).toBeInTheDocument();
    });
  });

  it("renders the offline chip alongside the title", async () => {
    mockedGetGalleryMeta.mockResolvedValue(makeMeta());

    render(<OfflineGalleryView slug="wedding-2025" />);

    await waitFor(() => {
      expect(screen.getByText(/offline/i)).toBeInTheDocument();
    });
  });

  it("passes adapted assets to PublicGalleryGrid", async () => {
    mockedGetGalleryMeta.mockResolvedValue(makeMeta());

    render(<OfflineGalleryView slug="wedding-2025" />);

    await waitFor(() => {
      expect(screen.getByTestId("public-gallery-grid")).toBeInTheDocument();
    });

    // The grid should receive the single adapted asset.
    const gridEl = screen.getByTestId("public-gallery-grid");
    expect(gridEl).toHaveAttribute("data-asset-count", "1");

    // Verify the grid mock was called with the correct adapted props.
    const firstCall = MockedGrid.mock.calls[0][0];
    expect(firstCall).toMatchObject({
      gallerySessionToken: null,
      assetAccessToken: null,
      downloadEnabled: false,
      workspaceScope: "studio-ws",
    });
    expect(firstCall.assets).toHaveLength(1);
    expect(firstCall.assets[0]).toMatchObject({
      id: "asset-1",
      filename: "photo.webp",
      content_type: "image/webp",
      thumbnail_urls: expect.objectContaining({
        thumb_md_webp: expect.any(String),
      }),
    });
  });

  it("shows the not-saved message for an unknown slug", async () => {
    mockedGetGalleryMeta.mockResolvedValue(null);

    render(<OfflineGalleryView slug="unknown-gallery" />);

    await waitFor(() => {
      expect(screen.getByText(/isn't saved for offline/i)).toBeInTheDocument();
    });
  });

  it("calls touchViewed after loading meta", async () => {
    mockedGetGalleryMeta.mockResolvedValue(makeMeta());

    render(<OfflineGalleryView slug="wedding-2025" />);

    await waitFor(() => {
      expect(mockedTouchViewed).toHaveBeenCalledWith("wedding-2025", expect.any(Number));
    });
  });

  it("does not call touchViewed when meta is null", async () => {
    mockedGetGalleryMeta.mockResolvedValue(null);

    render(<OfflineGalleryView slug="unknown-gallery" />);

    // Let the component settle.
    await waitFor(() => {
      expect(screen.getByText(/isn't saved for offline/i)).toBeInTheDocument();
    });

    expect(mockedTouchViewed).not.toHaveBeenCalled();
  });
});
