import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeaturesContent } from "@/components/features/FeaturesContent";

// Mock IntersectionObserver
beforeEach(() => {
  class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor() {}
  }
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

describe("Features Page", () => {
  it("renders the features headline", () => {
    render(<FeaturesContent />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Every core workflow a photography studio needs to book, deliver, and grow\./i,
      }),
    ).toBeInTheDocument();
  });

  it("renders all 10 feature sections", () => {
    render(<FeaturesContent />);
    // Each feature name appears in sidebar nav, mobile nav, and section heading
    const featureNames = [
      "Gallery Delivery",
      "Client Proofing",
      "AI Culling",
      "CRM & Bookings",
      "Live Streaming",
      "Marketplaces",
      "Analytics & Insights",
      "Security & Privacy",
      "Indian Localization",
      "White Label & Branding",
    ];
    for (const name of featureNames) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });

  it("renders feature section anchors", () => {
    render(<FeaturesContent />);
    expect(document.getElementById("gallery-delivery")).toBeInTheDocument();
    expect(document.getElementById("ai-culling")).toBeInTheDocument();
    expect(document.getElementById("customization")).toBeInTheDocument();
  });

  it("renders section navigation", () => {
    render(<FeaturesContent />);
    const navs = screen.getAllByRole("navigation");
    expect(navs.length).toBeGreaterThan(0);
  });

  it("renders CTA buttons for each section", () => {
    render(<FeaturesContent />);
    const ctaButtons = screen.getAllByText(/Try .+ Free/);
    expect(ctaButtons.length).toBe(10);
  });

  it("renders the final CTA section", () => {
    render(<FeaturesContent />);
    expect(
      screen.getByText("Ready to Transform Your Photography Business?")
    ).toBeInTheDocument();
  });
});
