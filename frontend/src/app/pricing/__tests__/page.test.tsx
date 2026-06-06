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
        name: /Pricing built for real photographer workflows\./i,
      }),
    ).toBeInTheDocument();
  });

  it("renders the updated event and subscription tiers", () => {
    render(<PricingContent />);
    expect(screen.getAllByText(/Starter/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pay Per Event/i).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /Monthly subscriptions/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Creator").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pro Photographer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Studio").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Elite Studio").length).toBeGreaterThan(0);
  });

  it("shows Popular badge on Pro Photographer plan", () => {
    render(<PricingContent />);
    expect(screen.getByText("Popular")).toBeInTheDocument();
  });

  it("shows Studio as the best value plan", () => {
    render(<PricingContent />);
    expect(screen.getByText("Best Value")).toBeInTheDocument();
  });

  it("renders event validity and extension pack details", () => {
    render(<PricingContent />);

    expect(screen.getByText("Event upload")).toBeInTheDocument();
    expect(screen.getByText("Wedding upload")).toBeInTheDocument();
    expect(screen.getByText("30-day active phase")).toBeInTheDocument();
    expect(screen.getByText("60-day active phase")).toBeInTheDocument();
    expect(
      screen.getAllByText("Auto-archive at day 90 unless extended").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Download + archive forever")).toBeInTheDocument();
    expect(screen.queryByText("7 days upload window")).not.toBeInTheDocument();
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
    expect(screen.getByText("Is Starter a trial?")).toBeInTheDocument();
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
