import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Footer } from "@/components/layout/Footer";

// F-085 regression: the "Swaz Consultants" partner brand name must be styled
// with a semantic design token, never an arbitrary Tailwind hex utility
// (e.g. text-[#e07b39]). Arbitrary hex values are not theme-aware and are
// explicitly forbidden by the project design-token rules.

describe("Footer", () => {
  it("renders the CoBolt powered-by logo", () => {
    render(<Footer />);
    expect(screen.getByAltText("CoBolt Logo")).toBeInTheDocument();
  });

  it("styles the partner brand name with a semantic accent token, not a hardcoded hex", () => {
    const { container } = render(<Footer />);

    // The "Consultants" span carries the semantic accent token class.
    expect(screen.getByText("Consultants")).toHaveClass("text-accent");

    // No arbitrary hex utility (text-[#......]) anywhere in the rendered footer.
    expect(container.innerHTML).not.toMatch(/text-\[#[0-9a-fA-F]{3,8}\]/);
  });
});
