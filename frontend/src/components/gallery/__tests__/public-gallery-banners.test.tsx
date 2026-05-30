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

// F-050: the banner CTA URL is studio/photographer-controlled and lands
// straight in an <a href>. Without scheme validation a `javascript:` (or
// data:/vbscript:/file:…) URI yields stored XSS against every public visitor
// who clicks the CTA — rel="noopener" and CSP unsafe-inline do NOT block
// javascript: href execution. isSafeUrl must drop the CTA for any non-http(s)
// scheme while preserving legitimate http(s) and site-relative links.
describe("PublicGalleryBanners — CTA URL scheme hardening (F-050)", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockTrack.mockReset();
    mockTrack.mockResolvedValue(true);
  });

  it("renders the CTA for a safe https URL", () => {
    render(
      <PublicGalleryBanners
        slug="my-slug"
        initialBanners={[fakeBanner({ cta_url: "https://example.com/prints" })]}
      />,
    );
    expect(
      screen.getByRole("link", { name: /shop prints/i }),
    ).toHaveAttribute("href", "https://example.com/prints");
  });

  it("renders the CTA for a safe http URL", () => {
    render(
      <PublicGalleryBanners
        slug="my-slug"
        initialBanners={[fakeBanner({ cta_url: "http://example.com/prints" })]}
      />,
    );
    expect(screen.getByRole("link", { name: /shop prints/i })).toBeInTheDocument();
  });

  it("renders the CTA for a site-relative path", () => {
    render(
      <PublicGalleryBanners
        slug="my-slug"
        initialBanners={[fakeBanner({ cta_url: "/galleries/my-slug/shop" })]}
      />,
    );
    expect(
      screen.getByRole("link", { name: /shop prints/i }),
    ).toHaveAttribute("href", "/galleries/my-slug/shop");
  });

  it("drops the CTA for a javascript: URI (stored XSS) but keeps the banner", () => {
    render(
      <PublicGalleryBanners
        slug="my-slug"
        initialBanners={[fakeBanner({ cta_url: "javascript:alert(document.cookie)" })]}
      />,
    );
    // The banner content still renders; only the dangerous CTA is removed.
    expect(screen.getByText("Early bird sale")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /shop prints/i })).toBeNull();
  });

  it("drops the CTA when javascript: is obfuscated with whitespace/control chars", () => {
    render(
      <PublicGalleryBanners
        slug="my-slug"
        initialBanners={[fakeBanner({ cta_url: "\t java\nscript:alert(1)" })]}
      />,
    );
    expect(screen.queryByRole("link", { name: /shop prints/i })).toBeNull();
  });

  it("drops the CTA for data:, vbscript:, file:, blob:, and mailto: schemes", () => {
    const hostile = [
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "blob:https://evil.example.com/abc",
      "mailto:victim@example.com",
    ];
    for (const cta_url of hostile) {
      const { unmount } = render(
        <PublicGalleryBanners
          slug="my-slug"
          initialBanners={[fakeBanner({ id: cta_url, cta_url })]}
        />,
      );
      expect(screen.queryByRole("link", { name: /shop prints/i })).toBeNull();
      unmount();
    }
  });
});
