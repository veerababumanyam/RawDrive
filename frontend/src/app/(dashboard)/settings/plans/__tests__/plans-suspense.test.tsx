import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Regression test for F-048: useSearchParams() must sit inside a <Suspense>
// boundary (Next 15/16 requirement). Without the boundary, a client page that
// reads search params de-opts static prerendering / bails the whole route to
// CSR — and during static generation React throws when a component "suspends"
// outside of a Suspense boundary.
//
// We reproduce that behaviour deterministically: useSearchParams() suspends
// (throws a promise) on its first synchronous render, then resolves. If the
// default-export page does NOT wrap the search-param-reading content in
// <Suspense>, this render throws and the test fails. With the fix in place the
// Suspense fallback shows first, then the resolved content renders.

const pushMock = vi.fn();
const replaceMock = vi.fn();
let mockPlatformRole = "photographer";
let mockAccessToken: string | null = null;

// A one-shot resource that suspends on first read, exactly like Next's
// useSearchParams() does during prerender before params are available.
let resolved = false;
let pending: Promise<void> | null = null;

function suspendOnce() {
  if (resolved) return;
  if (!pending) {
    pending = new Promise<void>((resolve) => {
      setTimeout(() => {
        resolved = true;
        resolve();
      }, 0);
    });
  }
  throw pending;
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: vi.fn() }),
  useSearchParams: () => {
    suspendOnce();
    return new URLSearchParams("");
  },
}));

// No auth token -> the page skips the subscription fetch and lands in the
// not-loading state, keeping the test free of network/DB concerns.
vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: () => mockAccessToken,
  getStoredPlatformRole: () => mockPlatformRole,
}));

vi.mock("@/hooks/use-plan-catalog", () => ({
  usePlanCatalog: () => ({
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
        quotaBytes: 5,
        storage: "5GB",
        galleries: 1,
        clients: 0,
        features: ["Starter storage"],
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
        storage: "Per event",
        galleries: 1,
        clients: 0,
        features: ["One-off event upload"],
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
        description: "",
        currency: "INR",
        monthlyPricePaise: 49900,
        annualPricePaise: 499000,
        monthlyPrice: 499,
        annualPrice: 4990,
        quotaBytes: 100,
        storage: "100GB",
        galleries: 10,
        clients: -1,
        features: ["Creator galleries"],
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
        description: "",
        currency: "INR",
        monthlyPricePaise: 99900,
        annualPricePaise: 999000,
        monthlyPrice: 999,
        annualPrice: 9990,
        quotaBytes: 300,
        storage: "300GB",
        galleries: -1,
        clients: -1,
        features: ["Pro galleries"],
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
        description: "",
        currency: "INR",
        monthlyPricePaise: 299900,
        annualPricePaise: 2999000,
        monthlyPrice: 2999,
        annualPrice: 29990,
        quotaBytes: 1024,
        storage: "1TB",
        galleries: -1,
        clients: -1,
        features: ["Studio workflows"],
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
        description: "",
        currency: "INR",
        monthlyPricePaise: 0,
        annualPricePaise: 0,
        monthlyPrice: 0,
        annualPrice: 0,
        quotaBytes: 3072,
        storage: "3TB",
        galleries: -1,
        clients: -1,
        features: ["Elite support"],
        popular: false,
        rank: 5,
        paid: true,
        active: true,
        selfServe: true,
        trialDays: 0,
      },
    ],
    eventPacks: [],
    galleryExtensions: [],
    storageBoosters: [],
    loading: false,
    error: null,
  }),
}));

import PlansPage from "../page";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  pushMock.mockReset();
  replaceMock.mockReset();
  mockPlatformRole = "photographer";
  mockAccessToken = null;
  resolved = false;
  pending = null;
});

function mockCurrentSubscriptionTier(tier: string) {
  mockAccessToken = "test-token";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/workspace/subscription")) {
        return new Response(JSON.stringify({ plan_tier: tier }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

describe("PlansPage (/settings/plans) Suspense boundary — F-048", () => {
  it("wraps useSearchParams in a Suspense boundary: shows fallback then content", async () => {
    // Before the fix this render throws (component suspends with no Suspense
    // ancestor). After the fix the fallback renders synchronously...
    render(<PlansPage />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    // ...and once the suspended search params resolve, the real page content
    // (the plan-selection heading) appears.
    await waitFor(() => {
      expect(screen.getByText("Choose a Plan")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("heading", { name: "Creator" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Pro Photographer" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Studio" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Elite Studio" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Talk to sales" }));
    expect(pushMock).toHaveBeenCalledWith(
      "/settings/plans/choose-payment?tier=elite_studio&interval=monthly",
    );
  });

  it("hides Pay Per Event from the upgrade grid even for Starter workspaces", async () => {
    mockCurrentSubscriptionTier("free");

    render(<PlansPage />);

    await waitFor(() => {
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole("heading", { name: "Pay Per Event" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Creator" }),
    ).toBeInTheDocument();
  });

  it("redirects super admins to the admin plan catalog", async () => {
    mockPlatformRole = "super_admin";

    render(<PlansPage />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/admin/plans");
    });
    expect(
      await screen.findByText("Opening admin plan catalog…"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Choose a Plan")).not.toBeInTheDocument();
  });
});
