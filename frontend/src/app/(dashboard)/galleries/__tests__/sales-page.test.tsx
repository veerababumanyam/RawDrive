import { Suspense } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import SalesPage from "../[id]/sales/page";

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
        <SalesPage params={Promise.resolve({ id })} />
      </Suspense>,
    );
    // Flush the use(params) suspense promise plus the getGallery effect it
    // unblocks so the panel commits before assertions run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  });
}

// Sales continuity sub-route (re-homed 2026-05-31). Mirrors ai/page.tsx:
// use(params) for the id, a token snapshot via getStoredAccessToken,
// getGallery(token, id), the shared GalleryWorkspaceNav, a "Back to gallery"
// link, and the panel rendered only when a token is present. The wiring under
// test is that the SalesContinuityPanel receives the gallery's REAL CRM
// linkage ids (invoice_id / deal_id / project_id), so a linked invoice
// surfaces the "View invoice" link to /invoices/{invoice_id}.

// next/link renders a plain anchor in the test environment so href
// assertions resolve against real DOM attributes.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Both GalleryWorkspaceNav and the SalesContinuityPanel's invoice link read
// next/navigation / next/link — supply them so the nav mounts on the sales
// sub-route.
vi.mock("next/navigation", () => ({
  usePathname: () => "/galleries/gallery-1/sales",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
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
    // Real CRM linkage carried on the Gallery object — these feed the panel.
    invoice_id: "invoice-77",
    deal_id: "deal-42",
    project_id: "project-9",
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  })),
}));

describe("Gallery sales continuity sub-route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the sales continuity panel wired to the gallery's invoice link", async () => {
    await renderPage("gallery-1");

    await waitFor(() => {
      expect(screen.getByTestId("sales-continuity-panel")).toBeInTheDocument();
    });

    // invoice_id from the gallery surfaces the View invoice link to the real
    // /invoices/{id} route — proves the gallery's invoice_id was wired in.
    const invoiceLink = screen.getByTestId("sales-invoice-link");
    expect(invoiceLink).toHaveAttribute("href", "/invoices/invoice-77");

    // deal_id + project_id both present → both rows read "Linked". Scope the
    // heading to level 2 (the panel's own h2) so the page's h1 ("… sales
    // continuity") doesn't ambiguate the match.
    expect(
      screen.getByRole("heading", { level: 2, name: /sales continuity/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Linked").length).toBeGreaterThanOrEqual(2);

    // cartCount stays 0 (no per-gallery cart helper exists yet).
    expect(screen.getByTestId("sales-cart-count")).toHaveTextContent("0");
  });

  it("renders the workspace nav and a back-to-gallery link", async () => {
    await renderPage("gallery-1");

    await waitFor(() => {
      expect(screen.getByTestId("sales-continuity-panel")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("navigation", { name: "Gallery workspace" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to gallery/i }),
    ).toHaveAttribute("href", "/galleries/gallery-1");
  });
});
