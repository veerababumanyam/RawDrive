import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Regression test for F-052: the PhonePe redirect_url returned by
// /workspace/subscription/upgrade must be scheme-checked (https only)
// before window.location.assign(). Without the guard a javascript:/data:/http:
// payload in a misconfigured or tampered backend response would navigate
// (open redirect / XSS). This mirrors the existing guard in
// components/streams/RechargeModal.tsx.
//
// PhonePe is visible in the payment picker; clicking it exercises the guarded
// redirect branch directly.

const pushMock = vi.fn();
const navigationState = vi.hoisted(() => ({
  search: "tier=creator&interval=monthly",
}));
const mockPlanCatalog = vi.hoisted(() => ({
  current: {
    plans: [
      {
        id: "creator",
        tier: "creator",
        name: "Creator",
        description: "Side photographers.",
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
    ],
    eventPacks: [
      {
        code: "event_upload_standard",
        product_type: "event_upload",
        version_id: "product-version-1",
        version: 1,
        name: "Event upload",
        description: "One-off event upload cycle.",
        currency: "INR",
        price_paise: 19900,
        billing_interval: "one_time",
        metadata: { active_days: 30 },
        rank: 10,
        active: true,
        effective_from: new Date("2026-06-07T00:00:00Z").toISOString(),
      },
    ],
    galleryExtensions: [],
    storageBoosters: [],
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigationState.search),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: () => "test-token",
}));

vi.mock("@/hooks/use-plan-catalog", () => ({
  usePlanCatalog: () => ({
    ...mockPlanCatalog.current,
    loading: false,
    error: null,
  }),
}));

import ChoosePaymentPage from "../page";

// Build a fetch stub whose /upgrade response carries a PhonePe order with the
// supplied redirect_url.
function stubUpgradeFetch(redirectUrl: string, phonePeConfigured = true) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (url.includes("/workspace/subscription/payment-providers")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          default_provider: "razorpay",
          providers: [
            { id: "razorpay", configured: true },
            { id: "phonepe", configured: phonePeConfigured },
          ],
        }),
      } as unknown as Response;
    }
    if (url.includes("/workspace/subscription/upgrade")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          provider: "phonepe",
          upgrade_order_id: "uo-1",
          amount_paise: 9900,
          currency: "INR",
          redirect_url: redirectUrl,
        }),
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
    } as unknown as Response;
  });
}

let assignSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  navigationState.search = "tier=creator&interval=monthly";
  assignSpy = vi.fn();
  // jsdom's window.location is not configurable to reassign wholesale across
  // versions; replacing just .assign is the portable approach.
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { ...window.location, assign: assignSpy } as unknown as Location,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  pushMock.mockReset();
});

describe("ChoosePaymentPage PhonePe redirect scheme guard — F-052", () => {
  it("does NOT navigate and surfaces an error for a non-https redirect_url", async () => {
    vi.stubGlobal(
      "fetch",
      stubUpgradeFetch("javascript:alert(document.cookie)"),
    );

    render(<ChoosePaymentPage />);

    const payButton = await screen.findByRole("button", {
      name: /pay .* with phonepe/i,
    });
    fireEvent.click(payButton);

    // Guard must reject the URL: error banner shown, no navigation.
    await waitFor(() => {
      expect(
        screen.getByText("Invalid payment redirect URL"),
      ).toBeInTheDocument();
    });
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("does NOT navigate to a non-PhonePe https redirect_url", async () => {
    vi.stubGlobal("fetch", stubUpgradeFetch("https://evil.example/pay/abc123"));

    render(<ChoosePaymentPage />);

    const payButton = await screen.findByRole("button", {
      name: /pay .* with phonepe/i,
    });
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(
        screen.getByText("Invalid payment redirect URL"),
      ).toBeInTheDocument();
    });
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("navigates for a valid https redirect_url (control)", async () => {
    vi.stubGlobal(
      "fetch",
      stubUpgradeFetch("https://mercury.phonepe.com/pay/abc123"),
    );

    render(<ChoosePaymentPage />);

    const payButton = await screen.findByRole("button", {
      name: /pay .* with phonepe/i,
    });
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith(
        "https://mercury.phonepe.com/pay/abc123",
      );
    });
    expect(
      screen.queryByText("Invalid payment redirect URL"),
    ).not.toBeInTheDocument();
  });

  it("keeps PhonePe visible but disabled when the backend reports it is not configured", async () => {
    vi.stubGlobal(
      "fetch",
      stubUpgradeFetch("https://mercury.phonepe.com/pay/abc123", false),
    );

    render(<ChoosePaymentPage />);

    await screen.findByRole("button", {
      name: /pay .* with razorpay/i,
    });
    expect(screen.getByText("Not configured")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /phonepe not configured/i }),
    ).toBeDisabled();
  });

  it("posts product_code, provider, target type, and target id for gallery product orders", async () => {
    navigationState.search =
      "product_code=event_upload_standard&target_type=gallery&target_id=gallery-1";
    const razorpayOpen = vi.fn();
    Object.defineProperty(window, "Razorpay", {
      configurable: true,
      writable: true,
      value: vi.fn(function Razorpay() {
        return { open: razorpayOpen };
      }),
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      if (url.includes("/workspace/subscription/payment-providers")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            default_provider: "razorpay",
            providers: [
              { id: "razorpay", configured: true },
              { id: "phonepe", configured: true },
            ],
          }),
        } as unknown as Response;
      }
      if (url.includes("/workspace/billing/orders")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            provider: "razorpay",
            billing_order_id: "bo-1",
            amount_paise: 19900,
            currency: "INR",
            order_type: "event_upload",
            product_code: "event_upload_standard",
            target_type: "gallery",
            target_id: "gallery-1",
            razorpay_order_id: "rzp-1",
            razorpay_key_id: "rzp-key",
          }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ChoosePaymentPage />);

    const payButton = await screen.findByRole("button", {
      name: /pay .* with razorpay/i,
    });
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/workspace/billing/orders"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            product_code: "event_upload_standard",
            provider: "razorpay",
            target_type: "gallery",
            target_id: "gallery-1",
          }),
        }),
      );
    });
  });
});
