import { describe, expect, it } from "vitest";
import { normalizeApiPlan } from "@/lib/plans";

describe("normalizeApiPlan", () => {
  it("normalizes the public pricing-catalog snake_case plan shape", () => {
    const plan = normalizeApiPlan({
      tier: "creator",
      name: "Creator",
      description: "Side & weekend photographers getting started.",
      currency: "INR",
      monthly_price_paise: 49900,
      annual_price_paise: 499000,
      quota_bytes: 100 * 2 ** 30,
      gallery_limit: 10,
      client_limit: -1,
      features: ["100 GB storage", ""],
      popular: false,
      rank: 2,
      paid: true,
      active: true,
      self_serve: true,
      trial_days: 0,
    });

    expect(plan).toMatchObject({
      id: "creator",
      name: "Creator",
      monthlyPrice: 499,
      storage: "100GB",
      galleries: 10,
      clients: -1,
      features: ["100 GB storage"],
      paid: true,
      active: true,
      selfServe: true,
    });
  });

  it("normalizes the legacy PascalCase plan shape returned by older pricing-catalog deployments", () => {
    const plan = normalizeApiPlan({
      Tier: "studio",
      Name: "Studio",
      Description: "Studios with a team and a brand to protect.",
      Currency: "INR",
      MonthlyPricePaise: 199900,
      AnnualPricePaise: 1999000,
      QuotaBytes: 1 * 2 ** 40,
      GalleryLimit: -1,
      ClientLimit: -1,
      Features: ["1 TB storage", "Unlimited everything"],
      Popular: true,
      Rank: 4,
      Paid: true,
      Active: true,
      SelfServe: true,
      TrialDays: 0,
    });

    expect(plan).toMatchObject({
      id: "studio",
      tier: "studio",
      name: "Studio",
      monthlyPrice: 1999,
      annualPrice: 19990,
      storage: "1TB",
      galleries: -1,
      clients: -1,
      features: ["1 TB storage", "Unlimited everything"],
      popular: true,
      rank: 4,
      paid: true,
      active: true,
      selfServe: true,
    });
  });
});
