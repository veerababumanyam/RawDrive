import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Footer } from "@/components/layout/Footer";

describe("Footer", () => {
  it("renders the CoBolt powered-by logo", () => {
    render(<Footer />);
    expect(screen.getByAltText("CoBolt Logo")).toBeInTheDocument();
  });

  it("renders RawDrive contact details without public Swaz branding", () => {
    const { container } = render(<Footer />);

    expect(screen.getByAltText("RawDrive Logo")).toBeInTheDocument();
    expect(screen.getByText("info@rawdrive.in")).toBeInTheDocument();
    expect(screen.getByText("support@rawdrive.in")).toBeInTheDocument();
    expect(screen.getByText("contactus@rawdrive.in")).toBeInTheDocument();
    // Each phone number is its own formatted tel: link — no "contact:" prefix,
    // no two-numbers-but-one-href bug (public-pages review 2026-06-04, P0 #1).
    const firstPhone = screen.getByText("+91 92811 2993");
    expect(firstPhone.closest("a")).toHaveAttribute("href", "tel:+91928112993");
    const secondPhone = screen.getByText("+91 90100 12299");
    expect(secondPhone.closest("a")).toHaveAttribute(
      "href",
      "tel:+919010012299",
    );
    expect(screen.queryByText(/contact:\+91/)).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(/Swaz Consultants/i);
    expect(container.innerHTML).not.toMatch(/swaz-consultants-logo/i);

    // No arbitrary hex utility (text-[#......]) anywhere in the rendered footer.
    expect(container.innerHTML).not.toMatch(/text-\[#[0-9a-fA-F]{3,8}\]/);
  });

  it("uses footer component tokens instead of tall one-off utility layout", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/layout/Footer.tsx"),
      "utf8",
    );
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const tokens = JSON.parse(
      readFileSync(resolve(process.cwd(), "../design-tokens.json"), "utf8"),
    );

    expect(tokens.components.footer).toBeTruthy();
    expect(css).toContain("--footer-padding-y-desktop");
    expect(css).toContain("--footer-link-min-height: var(--touch-target-min)");
    expect(source).toContain("site-footer__inner");
    expect(source).not.toMatch(
      /\b(?:py-12|mt-12|gap-8|max-w-7xl|lg:grid-cols-5|lg:col-span-2)\b/,
    );
  });
});
