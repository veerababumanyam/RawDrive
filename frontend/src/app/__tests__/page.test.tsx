import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import LandingPage from "@/app/page";

// AuthRedirect (rendered at the top of LandingPage) fires a useEffect on
// mount that calls refreshAuthSession(API_BASE) → fetch(`${API_BASE}/auth/refresh`).
// API_BASE is empty in tests, which produces the relative URL "/auth/refresh".
// Node's undici fetch (used by vitest 4 / jsdom) rejects with
// "TypeError: Failed to parse URL from /auth/refresh" — surfaced as an
// unhandled rejection that fails the suite even though the assertions
// would pass. These tests are about landing-page copy, not the auth
// redirect, so we stub the auth module: getStoredAccessToken returns
// null (no token cached) and refreshAuthSession resolves "" (no session
// refreshable) → AuthRedirect short-circuits and renders nothing.
vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: () => null,
  getPostLoginPath: () => "/dashboard",
  refreshAuthSession: () => Promise.resolve(""),
}));

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
    // the "Run every celebration" opener which lives on its own line and
    // is uniquely stable.
    const hero = screen.getByRole("heading", { level: 1 });
    expect(hero).toHaveTextContent(/Run every celebration/i);
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
    const registerLinks = screen.getAllByRole("link", {
      name: /start free trial/i,
    });
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

  it("renders the five requested tier plans on the home page", () => {
    render(<LandingPage />);

    const heading = screen.getByRole("heading", {
      name: /Start free, scale studio-wide\./i,
    });
    const section = heading.closest("section");
    expect(section).not.toBeNull();
    const plans = within(section as HTMLElement);

    expect(plans.getByText("Starter")).toBeInTheDocument();
    expect(plans.getByText("Creator")).toBeInTheDocument();
    expect(plans.getByText("Pro Photographer")).toBeInTheDocument();
    expect(plans.getByText("Studio")).toBeInTheDocument();
    expect(plans.getByText("Elite Studio")).toBeInTheDocument();

    expect(plans.queryByText("Pay Per Event")).not.toBeInTheDocument();
    expect(plans.queryByText("Most Popular")).not.toBeInTheDocument();
    expect(plans.getByText("Best Value")).toBeInTheDocument();
    expect(plans.getByText(/^₹499/)).toBeInTheDocument();
    expect(plans.getByText(/^₹999/)).toBeInTheDocument();
    expect(plans.getByText(/^₹1,999/)).toBeInTheDocument();
    expect(plans.getByText(/^₹3,999/)).toBeInTheDocument();
    expect(plans.getByRole("link", { name: /Elite Studio/i })).toHaveAttribute(
      "href",
      "/register?plan=elite_studio",
    );
  });
});
