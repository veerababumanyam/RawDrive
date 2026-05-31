import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { GalleryWorkspaceNav } from "../gallery-workspace-nav";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/galleries/gallery-1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

describe("GalleryWorkspaceNav", () => {
  it("groups the gallery lifecycle into one CRM-connected workspace", () => {
    render(<GalleryWorkspaceNav galleryId="gallery-1" />);

    const nav = screen.getByRole("navigation", { name: "Gallery workspace" });
    for (const label of [
      "Galleries",
      "Overview",
      "Cover & Design",
      // AI tab removed from workspace nav 2026-05-19 — page still
      // accessible via deep links from gallery-ai-panel.tsx.
      // Webcam-driven "find me in this gallery" search. The standalone
      // People tab was removed 2026-05-18 in favor of Photo Search,
      // which subsumes the use case for the dashboard surface.
      "Photo Search",
      // Delivery + Sales re-homed as workspace sub-pages 2026-05-31 — the
      // two continuity panels were orphaned when commit 46d5188 removed the
      // gallery detail aside; they now live at /delivery and /sales.
      "Delivery",
      "Sales",
      "Settings",
    ]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }

    // Galleries leads back to the list (first, top-down by scope).
    // Overview points to the current gallery's detail page so users can
    // jump back to the main view from any sub-page.
    expect(within(nav).getByRole("link", { name: "Galleries" })).toHaveAttribute("href", "/galleries");
    expect(within(nav).getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/galleries/gallery-1");
    expect(within(nav).getByRole("link", { name: "Cover & Design" })).toHaveAttribute("href", "/galleries/gallery-1/cover");
    expect(within(nav).queryByRole("link", { name: "AI" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "People" })).toBeNull();
    expect(within(nav).getByRole("link", { name: "Photo Search" })).toHaveAttribute(
      "href",
      "/galleries/gallery-1/photo-search",
    );
    // Delivery + Sales continuity sub-pages (re-homed 2026-05-31).
    expect(within(nav).getByRole("link", { name: "Delivery" })).toHaveAttribute(
      "href",
      "/galleries/gallery-1/delivery",
    );
    expect(within(nav).getByRole("link", { name: "Sales" })).toHaveAttribute(
      "href",
      "/galleries/gallery-1/sales",
    );
    expect(within(nav).queryByRole("link", { name: "Gallery" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Photos" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Albums" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Proofing" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Insights" })).toBeNull();
  });
});
