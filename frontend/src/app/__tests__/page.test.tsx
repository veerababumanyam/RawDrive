import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LandingPage from "@/app/page";

// These tests used to target the pre-cinematic-redesign landing copy
// ("Professional Photography, Simplified", "Start Free Trial",
// "Gallery Management", etc.) and broke when the page was rewritten
// as a set of componentized sections (Hero, TrustRow, WorkflowPipeline,
// GallerySection, AiMomentSection, StudioControlSection, FinalCta).
// The current copy is set in frontend/src/components/landing/*.tsx.
//
// The rewrite below asserts against CURRENT copy and prefers
// less-brittle queries: we check for the hero H1's distinctive
// phrase, for the primary CTA link, and for a couple of anchor
// phrases from later sections. Marketing copy will drift again —
// when it does, update this file against the components in
// frontend/src/components/landing/, not the other way around.
describe("Landing Page", () => {
  it("renders the hero H1 with the editorial headline", () => {
    render(<LandingPage />);
    // The headline is split across three lines via <br/>, so we match
    // the "Run every wedding" opener which lives on its own line and
    // is uniquely stable.
    const hero = screen.getByRole("heading", { level: 1 });
    expect(hero).toHaveTextContent(/Run every wedding/i);
    expect(hero).toHaveTextContent(/final delivery/i);
  });

  it("renders the hero subheadline", () => {
    render(<LandingPage />);
    // The subhead is a single <p> string — matches exactly.
    expect(
      screen.getByText(/Galleries, proofing, AI culling, bookings, invoices/i),
    ).toBeInTheDocument();
  });

  it("renders the primary hero CTAs linking to /register and /pricing", () => {
    render(<LandingPage />);
    // "Start free trial" appears in both the Hero and FinalCta CTAs,
    // so we assert "at least one" instead of "exactly one" and verify
    // every instance points to /register.
    const registerLinks = screen.getAllByRole("link", { name: /start free trial/i });
    expect(registerLinks.length).toBeGreaterThan(0);
    registerLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "/register");
    });

    // "See pricing" may appear in multiple places (Hero ghost CTA,
    // nav, footer). Assert at least one exists and every instance
    // routes to /pricing.
    const pricingLinks = screen.getAllByRole("link", { name: /see pricing/i });
    expect(pricingLinks.length).toBeGreaterThan(0);
    pricingLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "/pricing");
    });
  });

  it("renders the RawDrive eyebrow brand mark on the hero", () => {
    render(<LandingPage />);
    // The small uppercase "RawDrive" eyebrow above the H1 is the
    // brand anchor — stable across any future hero copy revisions.
    const eyebrows = screen.getAllByText(/^RawDrive$/);
    expect(eyebrows.length).toBeGreaterThan(0);
  });

  it("renders the final CTA section", () => {
    render(<LandingPage />);
    // FinalCta.tsx ships the closing "Your studio, finally in one place"
    // headline. One-line editorial type — assert on it directly.
    expect(
      screen.getByText(/Your studio, finally in one place/i),
    ).toBeInTheDocument();
  });
});
