import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent, waitFor, act } from "@testing-library/react";
import type { PublicAsset } from "@/lib/api/galleries";
import { PublicGalleryGrid } from "./public-gallery-grid";

// --- External-dependency mocks ------------------------------------------------
// The component reaches out to the favorites API and a storage-URL helper on
// mount. Neither is relevant to the rendering-window / token regressions under
// test, so we stub them to keep the test a pure render assertion (no network,
// no real storage resolution).
vi.mock("@/lib/api/favorites", () => ({
  addPublicFavorite: vi.fn().mockResolvedValue(undefined),
  removePublicFavorite: vi.fn().mockResolvedValue(undefined),
  listPublicFavoriteAssetIds: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/dashboard-ui", () => ({
  // Echo the key back as a resolvable URL so each tile renders an <img>.
  getStorageBackedUrl: (key?: string) => (key ? `https://cdn.test/${key}` : ""),
}));

function makeAssets(n: number): PublicAsset[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `asset-${i}`,
    filename: `photo-${i}.jpg`,
    width: 1200,
    height: 800,
    thumbnail_urls: { thumb_md_webp: `thumb-${i}` },
  })) as unknown as PublicAsset[];
}

// IntersectionObserver is not implemented in jsdom. Provide a controllable
// stub so we can (a) assert the component registers a sentinel observer and
// (b) drive "scrolled into view" to exercise the load-more path.
type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void;
let lastObserverCallback: IOCallback | null = null;
let observeCount = 0;

beforeEach(() => {
  lastObserverCallback = null;
  observeCount = 0;
  class MockIO {
    cb: IOCallback;
    constructor(cb: IOCallback) {
      this.cb = cb;
      lastObserverCallback = cb;
    }
    observe() {
      observeCount += 1;
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  // @ts-expect-error - assigning a test double to the global.
  global.IntersectionObserver = MockIO;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PublicGalleryGrid — F-092 incremental rendering", () => {
  it("does NOT eagerly mount every tile for a large gallery", () => {
    // 500 assets — far more than the initial render window. The regression
    // (rendering visibleAssets.map directly) mounts all 500 <img> nodes.
    render(<PublicGalleryGrid slug="big" assets={makeAssets(500)} />);
    const imgs = screen.getAllByRole("img");
    // Initial window is capped (INITIAL_GRID_RENDER_COUNT = 60). Assert we
    // rendered substantially fewer than the full set. This fails on the
    // pre-fix code (which rendered all 500) and passes after.
    expect(imgs.length).toBeLessThan(500);
    expect(imgs.length).toBeLessThanOrEqual(60);
    expect(imgs.length).toBeGreaterThan(0);
  });

  it("renders a load-more sentinel and an IntersectionObserver when more assets remain", () => {
    render(<PublicGalleryGrid slug="big" assets={makeAssets(500)} />);
    expect(screen.getByTestId("grid-load-more-sentinel")).toBeTruthy();
    expect(observeCount).toBeGreaterThan(0);
  });

  it("appends the next batch when the sentinel intersects, eventually reaching every asset", () => {
    render(<PublicGalleryGrid slug="big" assets={makeAssets(130)} />);
    expect(screen.getAllByRole("img").length).toBeLessThanOrEqual(60);

    // Drive the sentinel into view repeatedly. Each batch grows visibleCount,
    // which re-renders and re-creates the observer (cleanup + re-observe), so
    // we re-read `lastObserverCallback` fresh each iteration and wrap each fire
    // in act() so the state update is flushed before the next read. Loop until
    // the sentinel unmounts (no more to render) with a hard iteration cap so a
    // logic regression can't spin forever. 130 = 60 + 60 + 10 → 3 cycles.
    for (let i = 0; i < 20; i += 1) {
      if (!screen.queryByTestId("grid-load-more-sentinel")) break;
      const cb = lastObserverCallback;
      if (!cb) break;
      act(() => {
        cb([{ isIntersecting: true }]);
      });
    }

    // All 130 photos are now reachable in the grid, and the sentinel has
    // unmounted because nothing remains to render.
    expect(screen.getAllByRole("img").length).toBe(130);
    expect(screen.queryByTestId("grid-load-more-sentinel")).toBeNull();
  });

  it("does not render a sentinel when the gallery fits in the first window", () => {
    render(<PublicGalleryGrid slug="small" assets={makeAssets(10)} />);
    expect(screen.getAllByRole("img").length).toBe(10);
    expect(screen.queryByTestId("grid-load-more-sentinel")).toBeNull();
  });
});

describe("PublicGalleryGrid — F-087 success banner uses a semantic token", () => {
  beforeEach(() => {
    // The submit flow POSTs to the public proof endpoint; stub a 2xx so the
    // component flips to its `submitted` state and mounts the success banner.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function driveSubmitFlow() {
    const { container } = render(
      <PublicGalleryGrid
        slug="proof"
        assets={makeAssets(3)}
        galleryType="proofing"
        maxSelections={5}
      />,
    );

    // Select the first proofing tile (the tile wrapper is role="button").
    const firstTile = within(container).getAllByRole("button")[0];
    fireEvent.click(firstTile);

    // Floating bar → open the submit dialog.
    fireEvent.click(screen.getByText("Submit Selections"));

    // Fill the required email, then submit.
    fireEvent.change(screen.getByPlaceholderText("Your email *"), {
      target: { value: "client@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    // Banner appears once the POST resolves and `submitted` flips true.
    await waitFor(() =>
      expect(
        screen.getByText(/selections have been submitted/i),
      ).toBeTruthy(),
    );
    return container;
  }

  it("renders the submission success banner with the semantic success token, never a Tailwind primitive", async () => {
    const container = await driveSubmitFlow();

    const message = screen.getByText(/selections have been submitted/i);
    // The banner is the fixed-position wrapper around the message.
    const banner = message.closest("div.fixed");
    expect(banner).not.toBeNull();

    const cls = banner!.className;
    // Regression guard: the pre-fix code used `bg-green-600/95`, a Tailwind
    // color primitive outside the @theme token map. Must be gone.
    expect(cls).not.toMatch(/bg-green-/);
    // And replaced by the semantic success token per the design-token system.
    expect(cls).toContain("bg-feedback-success");

    // Defense in depth: no element in the whole tree carries a green primitive.
    expect(container.querySelector('[class*="bg-green-"]')).toBeNull();
  });
});
