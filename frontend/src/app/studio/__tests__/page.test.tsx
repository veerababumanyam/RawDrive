import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicStudioLanding: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/lib/api/galleries", () => ({
  getPublicStudioLanding: mocks.getPublicStudioLanding,
}));

import StudioLandingPage from "@/app/studio/page";

describe("/studio public subdomain landing page", () => {
  beforeEach(() => {
    mocks.getPublicStudioLanding.mockReset();
    mocks.notFound.mockClear();
  });

  it("renders business profile details and published gallery cards", async () => {
    mocks.getPublicStudioLanding.mockResolvedValueOnce({
      studio: {
        id: "workspace-1",
        name: "Kaveri Stories",
        display_name: "Kaveri Stories",
        brand_name: "Kaveri Stories",
        brand_accent_color: "#2563eb",
        public_branding_enabled: true,
        can_customize: true,
        tier_slug: "pro",
        address_line1: "Hyderabad",
        city: "Telangana",
        postal_code: "500001",
        phone: "+91 928112993",
        email: "hello@kaveri.test",
        website: "https://kaveri.test",
        logo_url: "/api/v1/public/studios/kaveri-stories-a1b2c3d4/logo",
        business_profile_slug: "kaveri-stories",
        business_unique_code: "a1b2c3d4",
        business_subdomain: "kaveri-stories-a1b2c3d4",
        public_url: "https://kaveri-stories-a1b2c3d4.rawdrive.in",
      },
      galleries: [
        {
          id: "gallery-1",
          title: "Wedding Veera",
          slug: "wedding-veera",
          description: "Client delivery",
          gallery_type: "delivery",
          cover_thumbnails: {
            thumb_lg_webp: "/storage/thumbnails/gallery-1/thumb_lg_webp.webp",
          },
          created_at: "2026-06-01T00:00:00Z",
          published_at: "2026-06-01T00:00:00Z",
          download_enabled: true,
          public_url:
            "https://kaveri-stories-a1b2c3d4.rawdrive.in/wedding-veera",
        },
      ],
      counts: { published_galleries: 1 },
    });

    const page = await StudioLandingPage({
      searchParams: Promise.resolve({ ws: "kaveri-stories-a1b2c3d4" }),
    });
    render(page);

    expect(
      screen.getByRole("heading", { name: "Kaveri Stories" }),
    ).toBeInTheDocument();
    expect(screen.getByText("+91 928112993")).toBeInTheDocument();
    expect(screen.getByText("hello@kaveri.test")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Wedding Veera/ })).toHaveAttribute(
      "href",
      "https://kaveri-stories-a1b2c3d4.rawdrive.in/wedding-veera",
    );
    expect(mocks.getPublicStudioLanding).toHaveBeenCalledWith(
      "kaveri-stories-a1b2c3d4",
    );
  });

  // PUB-CAP: a studio with more than one page of published galleries must show a
  // "Load more" control; clicking it fetches the next page via the keyset cursor
  // and APPENDS those galleries (galleries 61+ are now reachable).
  it("loads and appends more galleries via the keyset cursor", async () => {
    const studio = {
      id: "workspace-1",
      name: "Kaveri Stories",
      display_name: "Kaveri Stories",
      public_branding_enabled: true,
      can_customize: false,
      tier_slug: "pro",
      business_profile_slug: "kaveri-stories",
      business_unique_code: "a1b2c3d4",
      business_subdomain: "kaveri-stories-a1b2c3d4",
      public_url: "https://kaveri-stories-a1b2c3d4.rawdrive.in",
    };

    // First (server) page: one gallery + a next_cursor (more exist).
    mocks.getPublicStudioLanding.mockResolvedValueOnce({
      studio,
      galleries: [
        {
          id: "gallery-1",
          title: "Page One Gallery",
          slug: "page-one",
          description: "",
          gallery_type: "delivery",
          created_at: "2026-06-02T00:00:00Z",
          published_at: "2026-06-02T00:00:00Z",
          download_enabled: true,
          public_url: "https://kaveri-stories-a1b2c3d4.rawdrive.in/page-one",
        },
      ],
      counts: { published_galleries: 1 },
      next_cursor: "CURSOR_PAGE2",
      has_more: true,
    });

    // Second page (fetched on "Load more"): a distinct gallery, no further cursor.
    mocks.getPublicStudioLanding.mockResolvedValueOnce({
      studio,
      galleries: [
        {
          id: "gallery-61",
          title: "Page Two Gallery",
          slug: "page-two",
          description: "",
          gallery_type: "delivery",
          created_at: "2026-05-20T00:00:00Z",
          published_at: "2026-05-20T00:00:00Z",
          download_enabled: true,
          public_url: "https://kaveri-stories-a1b2c3d4.rawdrive.in/page-two",
        },
      ],
      counts: { published_galleries: 1 },
      next_cursor: null,
      has_more: false,
    });

    const page = await StudioLandingPage({
      searchParams: Promise.resolve({ ws: "kaveri-stories-a1b2c3d4" }),
    });
    render(page);

    // Page-1 gallery is visible; page-2 is not yet.
    expect(
      screen.getByRole("link", { name: /Page One Gallery/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Page Two Gallery/ }),
    ).not.toBeInTheDocument();

    const loadMore = screen.getByRole("button", {
      name: /Load more galleries/i,
    });
    fireEvent.click(loadMore);

    // Page-2 gallery is now appended (galleries 61+ reachable).
    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /Page Two Gallery/ }),
      ).toBeInTheDocument();
    });
    // Page-1 gallery is still present (appended, not replaced).
    expect(
      screen.getByRole("link", { name: /Page One Gallery/ }),
    ).toBeInTheDocument();

    // The cursor was forwarded to the API for the second fetch.
    expect(mocks.getPublicStudioLanding).toHaveBeenNthCalledWith(
      2,
      "kaveri-stories-a1b2c3d4",
      "CURSOR_PAGE2",
    );

    // Last page reached → the "Load more" control disappears.
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Load more galleries/i }),
      ).not.toBeInTheDocument();
    });
  });
});
