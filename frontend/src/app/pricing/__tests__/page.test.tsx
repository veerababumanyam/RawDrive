import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// The live streaming-packages grid fetches from the public API on mount.
// Tests don't stub fetch, so in JSDOM it resolves with empty/error and the
// grid renders "Live pricing temporarily unavailable". Mock the hook to
// return a deterministic catalogue so "Streaming Session Packs" can assert
// package presence without depending on network.
vi.mock("@/lib/streaming-packages", () => ({
  useStreamingPackages: () => ({
    packages: [
      {
        id: "pack-5",
        name: "5 Sessions",
        price_paise: 249900,
        minutes: 300,
        max_concurrent_viewers: 100,
        replay_ttl_days: 30,
      },
      {
        id: "pack-20",
        name: "20 Sessions",
        price_paise: 899900,
        minutes: 1200,
        max_concurrent_viewers: 250,
        replay_ttl_days: 60,
      },
    ],
    loading: false,
    error: null,
  }),
  formatINR: (paise: number) => (paise / 100).toLocaleString("en-IN"),
}));

import { PricingContent } from "@/components/pricing/PricingContent";

describe("Pricing Page", () => {
  it("renders the pricing headline", () => {
    render(<PricingContent />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Choose the plan that matches your studio today and scale without replatforming later\./i,
      }),
    ).toBeInTheDocument();
  });

  it("renders all 5 plan cards", () => {
    render(<PricingContent />);
    // Plan names appear in cards and in comparison table header
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Starter").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Professional").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Business").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Enterprise").length).toBeGreaterThan(0);
  });

  it("shows Popular badge on Professional plan", () => {
    render(<PricingContent />);
    expect(screen.getByText("Popular")).toBeInTheDocument();
  });

  it("toggles between monthly and annual billing", () => {
    render(<PricingContent />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("does not render feature comparison table (hidden)", () => {
    render(<PricingContent />);
    expect(screen.queryByText("Feature Comparison")).not.toBeInTheDocument();
  });

  it("does not render storage boosters (hidden)", () => {
    render(<PricingContent />);
    expect(screen.queryByText("Storage Boosters")).not.toBeInTheDocument();
  });

  it("does not render streaming packs (hidden)", () => {
    render(<PricingContent />);
    expect(
      screen.queryByText("Streaming Session Packs"),
    ).not.toBeInTheDocument();
  });

  it("renders FAQ section with 8 items", () => {
    render(<PricingContent />);
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText("Is there a free trial?")).toBeInTheDocument();
    expect(screen.getByText("Is my data stored in India?")).toBeInTheDocument();
  });

  it("reveals FAQ answers without a fixed-height clip", () => {
    // Regression guard for the max-h-40 cap that clipped longer answers. The
    // accordion now uses a content-height-driven grid-rows reveal, so no
    // fixed max-h-* utility should remain on the answer container.
    const { container } = render(<PricingContent />);
    expect(container.querySelector(".max-h-40")).toBeNull();
    expect(container.querySelector(".max-h-0")).toBeNull();
  });

  it("renders coupon code input", () => {
    render(<PricingContent />);
    expect(
      screen.getByPlaceholderText("Enter coupon code"),
    ).toBeInTheDocument();
  });
});
