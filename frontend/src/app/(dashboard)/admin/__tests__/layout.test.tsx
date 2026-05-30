import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminLayout from "../layout";

// usePathname() returns "/" so no admin route matches: every nav link renders the
// *inactive* className branch — which is exactly where the hover color token lives
// (the F-086 violation was `hover:text-gray-200` in that branch).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

describe("AdminLayout (F-086 design-token regression)", () => {
  it("renders the admin nav links", () => {
    render(<AdminLayout>content</AdminLayout>);
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Audit Logs" })).toBeInTheDocument();
  });

  it("uses no forbidden Tailwind primitive color scales on nav links", () => {
    render(<AdminLayout>content</AdminLayout>);
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);

    // Tailwind primitive scales (gray-*, neutral-*, slate-*, zinc-*) are forbidden by
    // the RawDrive design-token rule: they are not in the @theme color map and do not
    // adapt per theme. This guards against the exact F-086 regression
    // (`hover:text-gray-200`).
    const forbiddenPrimitive =
      /\b(?:hover:|focus:|active:|dark:)?(?:text|bg|border|ring)-(?:gray|neutral|slate|zinc)-\d{2,3}\b/;

    for (const link of links) {
      expect(link.className).not.toMatch(forbiddenPrimitive);
    }
  });

  it("uses the semantic text token for the inactive nav link hover state", () => {
    render(<AdminLayout>content</AdminLayout>);
    // pathname "/" matches no admin route, so links render the inactive branch.
    const usersLink = screen.getByRole("link", { name: "Users" });
    expect(usersLink.className).toContain("text-text-tertiary");
    expect(usersLink.className).toContain("hover:text-text-primary");
  });
});
