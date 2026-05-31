import { Suspense } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import DeliveryPage from "../[id]/delivery/page";

// The page reads its route params via React's use(params) hook, which
// suspends until the params promise resolves — exactly as it does under the
// Next.js App Router. Wrap renders in a Suspense boundary so the suspended
// tree resolves in the test environment (Next supplies this boundary in
// production), then flush microtasks so the resolved params (and the data
// effects they unblock) commit before assertions run.
async function renderPage(id: string) {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <DeliveryPage params={Promise.resolve({ id })} />
      </Suspense>,
    );
    // Flush the use(params) suspense promise plus the data-loading effects it
    // unblocks (getGallery / listProofingSelections / listGalleryAssets).
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  });
}

// Delivery continuity sub-route (re-homed 2026-05-31). The page mirrors the
// ai/page.tsx re-mount pattern: use(params) for the id, a once-per-mount
// token snapshot via getStoredAccessToken, getGallery(token, id), the shared
// GalleryWorkspaceNav, a "Back to gallery" link, and the panel rendered only
// when a token is present. The wiring under test is the REAL proofing math:
// selectedCount = distinct asset_ids among 'selected' proofing rows, and
// totalCount = the gallery's linked asset count.

// next/link renders a plain anchor in the test environment so href
// assertions resolve against real DOM attributes.
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// GalleryWorkspaceNav reads usePathname/useRouter — supply them so the nav
// mounts on the delivery sub-route.
vi.mock("next/navigation", () => ({
  usePathname: () => "/galleries/gallery-1/delivery",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "t"),
}));

vi.mock("@/lib/api/galleries", () => ({
  getGallery: vi.fn(async () => ({
    id: "gallery-1",
    workspace_id: "ws-1",
    title: "Anika + Rohan Wedding",
    slug: "anika-rohan",
    description: "",
    gallery_type: "proofing",
    is_published: true,
    max_selections: 0,
    status: "active",
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  })),
  // Four assets linked to the gallery → totalCount must resolve to 4.
  listGalleryAssets: vi.fn(async () => [
    { id: "ga-1", gallery_id: "gallery-1", asset_id: "a-1", sort_order: 0, is_hero: false },
    { id: "ga-2", gallery_id: "gallery-1", asset_id: "a-2", sort_order: 1, is_hero: false },
    { id: "ga-3", gallery_id: "gallery-1", asset_id: "a-3", sort_order: 2, is_hero: false },
    { id: "ga-4", gallery_id: "gallery-1", asset_id: "a-4", sort_order: 3, is_hero: false },
  ]),
}));

vi.mock("@/lib/api/proofing", () => ({
  // Two distinct 'selected' assets (a-1 selected by two different clients
  // → dedupe to one), plus a rejected row that must NOT count. selectedCount
  // must resolve to 2 ("2 of 4 selected").
  listProofingSelections: vi.fn(async () => [
    { id: "s-1", gallery_id: "gallery-1", asset_id: "a-1", client_name: "Anika", client_email: "a@x.com", status: "selected", note: "", created_at: "2026-04-02T00:00:00Z" },
    { id: "s-2", gallery_id: "gallery-1", asset_id: "a-1", client_name: "Rohan", client_email: "r@x.com", status: "selected", note: "", created_at: "2026-04-02T00:00:00Z" },
    { id: "s-3", gallery_id: "gallery-1", asset_id: "a-2", client_name: "Anika", client_email: "a@x.com", status: "selected", note: "", created_at: "2026-04-02T00:00:00Z" },
    { id: "s-4", gallery_id: "gallery-1", asset_id: "a-3", client_name: "Anika", client_email: "a@x.com", status: "rejected", note: "", created_at: "2026-04-02T00:00:00Z" },
  ]),
}));

vi.mock("@/lib/api/analytics", () => ({
  getAnalyticsSummary: vi.fn(async () => ({
    views: 120,
    unique_visitors: 40,
    downloads: 17,
    favorites: 9,
    shares: 3,
  })),
}));

describe("Gallery delivery continuity sub-route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the delivery continuity panel with REAL proofing counts", async () => {
    await renderPage("gallery-1");

    // The panel mounts only once the token snapshot is present.
    await waitFor(() => {
      expect(screen.getByTestId("delivery-continuity-panel")).toBeInTheDocument();
    });

    // 2 distinct selected assets (a-1 deduped, a-2; a-3 rejected excluded)
    // out of 4 linked assets — sourced from listProofingSelections +
    // listGalleryAssets, NOT faked. The panel renders "2 of 4 selected".
    await waitFor(() => {
      expect(screen.getByText("2 of 4 selected")).toBeInTheDocument();
    });

    // The panel's own (h2) header + analytics-driven download figure prove
    // the panel is wired. Scope to level 2 so the page's h1 ("… delivery
    // continuity") doesn't ambiguate the match.
    expect(
      screen.getByRole("heading", { level: 2, name: /delivery continuity/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument(); // downloads from analytics summary
  });

  it("renders the workspace nav and a back-to-gallery link", async () => {
    await renderPage("gallery-1");

    await waitFor(() => {
      expect(screen.getByTestId("delivery-continuity-panel")).toBeInTheDocument();
    });

    expect(screen.getByRole("navigation", { name: "Gallery workspace" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to gallery/i })).toHaveAttribute(
      "href",
      "/galleries/gallery-1",
    );
  });
});
