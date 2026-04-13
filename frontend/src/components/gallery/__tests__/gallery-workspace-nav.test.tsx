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
}));

describe("GalleryWorkspaceNav", () => {
  it("groups the gallery lifecycle into one CRM-connected workspace", () => {
    render(<GalleryWorkspaceNav galleryId="gallery-1" />);

    const nav = screen.getByRole("navigation", { name: "Gallery workspace" });
    for (const label of [
      "Overview",
      "Photos",
      "Albums",
      "Cover & Design",
      "Share",
      "Proofing",
      "Delivery",
      "Sales",
      "Insights",
      "AI",
      "Settings",
    ]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }

    expect(within(nav).getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/galleries/gallery-1");
    expect(within(nav).getByRole("link", { name: "Proofing" })).toHaveAttribute("href", "/galleries/gallery-1/proofing");
    expect(within(nav).getByRole("link", { name: "Insights" })).toHaveAttribute("href", "/galleries/gallery-1/analytics");
    expect(within(nav).getByRole("link", { name: "AI" })).toHaveAttribute("href", "/galleries/gallery-1/ai");
  });
});
