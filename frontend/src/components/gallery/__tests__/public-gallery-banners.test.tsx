import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PublicGalleryBanners } from "../public-gallery-banners";
import type { GalleryBanner } from "@/lib/api/commerce";

// Mock the commerce API so we can assert on the telemetry calls.
// listPublicBanners is stubbed to satisfy the client-side fetch
// fallback; trackGalleryEvent is the target of assertions.
vi.mock("@/lib/api/commerce", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/commerce")>("@/lib/api/commerce");
  return {
    ...actual,
    listPublicBanners: vi.fn(),
    trackGalleryEvent: vi.fn().mockResolvedValue(true),
  };
});

// eslint-disable-next-line import/first
import { listPublicBanners, trackGalleryEvent } from "@/lib/api/commerce";

const mockList = vi.mocked(listPublicBanners);
const mockTrack = vi.mocked(trackGalleryEvent);

function fakeBanner(overrides: Partial<GalleryBanner> = {}): GalleryBanner {
  return {
    id: "banner-xyz",
    gallery_id: "gallery-1",
    title: "Early bird sale",
    body: "10% off prints through Friday",
    cta_label: "Shop prints",
    cta_url: "https://example.com/prints",
    coupon_code: "EARLY10",
    background_color: "",
    text_color: "",
    active_from: null,
    active_until: null,
    is_active: true,
    ...overrides,
  };
}

describe("PublicGalleryBanners", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockTrack.mockReset();
    mockTrack.mockResolvedValue(true);
  });

  it("fires banner_impression on mount with banner id", async () => {
    render(
      <PublicGalleryBanners slug="my-slug" initialBanners={[fakeBanner()]} />,
    );
    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith("my-slug", "banner_impression", {
        banner_id: "banner-xyz",
      });
    });
  });

  it("fires banner_click when CTA is clicked", async () => {
    render(
      <PublicGalleryBanners slug="my-slug" initialBanners={[fakeBanner()]} />,
    );
    // Wait for initial impression to settle so the click assertion is clean.
    await waitFor(() => expect(mockTrack).toHaveBeenCalled());

    const cta = screen.getByRole("link", { name: /shop prints/i });
    fireEvent.click(cta);

    expect(mockTrack).toHaveBeenCalledWith("my-slug", "banner_click", {
      banner_id: "banner-xyz",
    });
  });

  it("renders nothing when there are no banners", () => {
    const { container } = render(
      <PublicGalleryBanners slug="my-slug" initialBanners={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("falls back to client-side fetch when initialBanners are not supplied", async () => {
    mockList.mockResolvedValueOnce([fakeBanner({ id: "banner-fetched" })]);
    render(<PublicGalleryBanners slug="my-slug" />);

    await waitFor(() => expect(mockList).toHaveBeenCalledWith("my-slug"));
    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith("my-slug", "banner_impression", {
        banner_id: "banner-fetched",
      });
    });
  });
});
