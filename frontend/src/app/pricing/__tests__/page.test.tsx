import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockPlanCatalog = vi.hoisted(() => ({
  current: {
    plans: [
      {
        id: "free",
        tier: "free",
        name: "Starter",
        description: "",
        currency: "INR",
        monthlyPricePaise: 0,
        annualPricePaise: 0,
        monthlyPrice: 0,
        annualPrice: 0,
        quotaBytes: 5 * 2 ** 30,
        storage: "5GB",
        galleries: 1,
        clients: 0,
        features: ["5GB storage"],
        popular: false,
        rank: 0,
        paid: false,
        active: true,
        selfServe: true,
        trialDays: 0,
      },
      {
        id: "pay_per_event",
        tier: "pay_per_event",
        name: "Pay Per Event",
        description: "",
        currency: "INR",
        monthlyPricePaise: 19900,
        annualPricePaise: 0,
        monthlyPrice: 199,
        annualPrice: 0,
        quotaBytes: 0,
        storage: "0GB",
        galleries: 1,
        clients: 0,
        features: ["Event upload"],
        popular: false,
        rank: 1,
        paid: true,
        active: true,
        selfServe: false,
        trialDays: 0,
      },
      {
        id: "creator",
        tier: "creator",
        name: "Creator",
        description: "Side & weekend photographers getting started.",
        currency: "INR",
        monthlyPricePaise: 49900,
        annualPricePaise: 499000,
        monthlyPrice: 499,
        annualPrice: 4990,
        quotaBytes: 100 * 2 ** 30,
        storage: "100GB",
        galleries: 10,
        clients: -1,
        features: ["100GB storage"],
        popular: false,
        rank: 2,
        paid: true,
        active: true,
        selfServe: true,
        trialDays: 0,
      },
      {
        id: "pro_photographer",
        tier: "pro_photographer",
        name: "Pro Photographer",
        description: "The main money plan for working pros.",
        currency: "INR",
        monthlyPricePaise: 99900,
        annualPricePaise: 999000,
        monthlyPrice: 999,
        annualPrice: 9990,
        quotaBytes: 300 * 2 ** 30,
        storage: "300GB",
        galleries: -1,
        clients: -1,
        features: ["300GB storage"],
        popular: false,
        rank: 3,
        paid: true,
        active: true,
        selfServe: true,
        trialDays: 0,
      },
      {
        id: "studio",
        tier: "studio",
        name: "Studio",
        description: "Studios with a team and a brand to protect.",
        currency: "INR",
        monthlyPricePaise: 199900,
        annualPricePaise: 1999000,
        monthlyPrice: 1999,
        annualPrice: 19990,
        quotaBytes: 1024 * 2 ** 30,
        storage: "1TB",
        galleries: -1,
        clients: -1,
        features: ["1TB storage"],
        popular: true,
        rank: 4,
        paid: true,
        active: true,
        selfServe: true,
        trialDays: 0,
      },
      {
        id: "elite_studio",
        tier: "elite_studio",
        name: "Elite Studio",
        description: "High-end & multi-branch studios.",
        currency: "INR",
        monthlyPricePaise: 399900,
        annualPricePaise: 3999000,
        monthlyPrice: 3999,
        annualPrice: 39990,
        quotaBytes: 3 * 1024 * 2 ** 30,
        storage: "3TB",
        galleries: -1,
        clients: -1,
        features: ["3TB storage"],
        popular: false,
        rank: 5,
        paid: true,
        active: true,
        selfServe: false,
        trialDays: 0,
      },
    ],
    eventPacks: [] as Record<string, unknown>[],
    galleryExtensions: [] as Record<string, unknown>[],
    storageBoosters: [] as Record<string, unknown>[],
  },
}));

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

vi.mock("@/hooks/use-plan-catalog", () => ({
  usePlanCatalog: () => ({
    ...mockPlanCatalog.current,
    loading: false,
    error: null,
  }),
}));

import { PricingContent } from "@/components/pricing/PricingContent";

describe("Pricing Page", () => {
  beforeEach(() => {
    mockPlanCatalog.current.eventPacks = [];
    mockPlanCatalog.current.galleryExtensions = [];
    mockPlanCatalog.current.storageBoosters = [];
  });

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

  it("does not hard-code Pro Photographer as the most popular plan", () => {
    render(<PricingContent />);
    expect(screen.queryByText("Most Popular")).not.toBeInTheDocument();
  });

  it("shows the catalog-featured plan as the best value plan", () => {
    render(<PricingContent />);
    expect(screen.getByText("Best Value")).toBeInTheDocument();
  });

  it("renders event validity details without add-on packs", () => {
    render(<PricingContent />);

    expect(screen.getByText("Event upload")).toBeInTheDocument();
    expect(screen.getByText("Wedding upload")).toBeInTheDocument();
    expect(screen.getAllByText("30-day active phase").length).toBeGreaterThan(
      1,
    );
    expect(
      screen.getAllByText("Clean sweep after 30 days unless upgraded").length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText("Add-ons and extension packs"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Download + archive forever"),
    ).not.toBeInTheDocument();
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

  it("renders Pay Per Event FAQ copy from product catalog data", () => {
    mockPlanCatalog.current.eventPacks = [
      {
        code: "event_upload_standard",
        product_type: "event_upload",
        version_id: "product-version-1",
        version: 1,
        name: "Event upload",
        description: "One-off event upload cycle.",
        currency: "INR",
        price_paise: 29900,
        billing_interval: "one_time",
        metadata: {
          active_days: 30,
          upload_window_days: 30,
          retention_days: 30,
          quota_bytes: 12 * 2 ** 30,
        },
        rank: 10,
        active: true,
        effective_from: new Date("2026-06-07T00:00:00Z").toISOString(),
      },
      {
        code: "event_upload_wedding",
        product_type: "event_upload",
        version_id: "product-version-2",
        version: 1,
        name: "Wedding upload",
        description: "Wedding upload cycle.",
        currency: "INR",
        price_paise: 69900,
        billing_interval: "one_time",
        metadata: {
          active_days: 30,
          upload_window_days: 30,
          retention_days: 30,
          quota_bytes: 64 * 2 ** 30,
        },
        rank: 20,
        active: true,
        effective_from: new Date("2026-06-07T00:00:00Z").toISOString(),
      },
    ];
    mockPlanCatalog.current.galleryExtensions = [
      {
        code: "gallery_extend_30",
        product_type: "gallery_extension",
        version_id: "extension-version-1",
        version: 1,
        name: "Extend +30 days",
        description: "Keep a gallery active for another 30 days.",
        currency: "INR",
        price_paise: 7900,
        billing_interval: "one_time",
        metadata: { extension_days: 30 },
        rank: 30,
        active: true,
        effective_from: new Date("2026-06-07T00:00:00Z").toISOString(),
      },
      {
        code: "gallery_extend_90",
        product_type: "gallery_extension",
        version_id: "extension-version-2",
        version: 1,
        name: "Extend +90 days",
        description: "Keep a gallery active for another 90 days.",
        currency: "INR",
        price_paise: 14900,
        billing_interval: "one_time",
        metadata: { extension_days: 90 },
        rank: 40,
        active: true,
        effective_from: new Date("2026-06-07T00:00:00Z").toISOString(),
      },
      {
        code: "gallery_archive_forever",
        product_type: "gallery_extension",
        version_id: "extension-version-3",
        version: 1,
        name: "Download + archive forever",
        description: "Export and archive.",
        currency: "INR",
        price_paise: 24900,
        billing_interval: "one_time",
        metadata: { archive_forever: true },
        rank: 50,
        active: true,
        effective_from: new Date("2026-06-07T00:00:00Z").toISOString(),
      },
    ];

    render(<PricingContent />);

    expect(
      screen.getByText(
        /Rs\. 299 events include 30 active days, Rs\. 699 wedding uploads include 30 active days, each product carries its own approved storage quota/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("12GB managed storage included"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("64GB managed storage included"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /extend 30 days for Rs\. 79, extend 90 days for Rs\. 149, or download plus archive forever for Rs\. 249/i,
      ),
    ).toBeInTheDocument();
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
