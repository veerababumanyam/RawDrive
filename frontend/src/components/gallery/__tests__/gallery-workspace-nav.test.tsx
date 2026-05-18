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
      "Overview",
      "Galleries",
      "Cover & Design",
      "AI",
      "Settings",
    ]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }

    // Overview points to the current gallery's detail page so users can
    // jump back to the main view from any sub-page; Galleries is the
    // escape hatch out to the gallery list.
    expect(within(nav).getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/galleries/gallery-1");
    expect(within(nav).getByRole("link", { name: "Galleries" })).toHaveAttribute("href", "/galleries");
    expect(within(nav).getByRole("link", { name: "Cover & Design" })).toHaveAttribute("href", "/galleries/gallery-1/cover");
    expect(within(nav).getByRole("link", { name: "AI" })).toHaveAttribute("href", "/galleries/gallery-1/ai");
    expect(within(nav).queryByRole("link", { name: "Gallery" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Photos" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Albums" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Delivery" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Proofing" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Insights" })).toBeNull();
  });
});
