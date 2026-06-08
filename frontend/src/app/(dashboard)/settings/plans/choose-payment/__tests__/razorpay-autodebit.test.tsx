import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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
      {
        id: "elite_studio",
        tier: "elite_studio",
        name: "Elite Studio",
        description: "High-end studio plan.",
        currency: "INR",
        monthlyPricePaise: 399900,
        annualPricePaise: 3999000,
        monthlyPrice: 3999,
        annualPrice: 39990,
        quotaBytes: 3 * 2 ** 40,
        storage: "3TB",
        galleries: -1,
        clients: -1,
        features: ["Payment gateway checkout"],
        popular: false,
        rank: 5,
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

function stubProvidersFetch(razorpayConfigured = true) {
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
          default_provider: razorpayConfigured ? "razorpay" : "",
          providers: [
            { id: "razorpay", configured: razorpayConfigured },
            { id: "phonepe", configured: true },
          ],
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  pushMock.mockReset();
  navigationState.search = "tier=creator&interval=monthly";
});

describe("ChoosePaymentPage Razorpay auto-debit checkout", () => {
  it("shows GST-inclusive Razorpay auto-debit checkout and hides PhonePe", async () => {
    vi.stubGlobal("fetch", stubProvidersFetch());

    render(<ChoosePaymentPage />);

    await screen.findByText("GST (18%)");
    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    expect(screen.getByText("₹499")).toBeInTheDocument();
    expect(screen.getByText("₹89.82")).toBeInTheDocument();
    expect(screen.getAllByText(/₹588\.82/).length).toBeGreaterThan(0);
    expect(screen.getByText("Razorpay Auto Debit")).toBeInTheDocument();
    expect(screen.getByText("Auto debit")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: /pay ₹588\.82 with razorpay auto debit/i,
      }),
    ).toBeEnabled();
    expect(screen.queryByText(/phonepe/i)).not.toBeInTheDocument();
  });

  it("does not show a PhonePe fallback when Razorpay is not configured", async () => {
    vi.stubGlobal("fetch", stubProvidersFetch(false));

    render(<ChoosePaymentPage />);

    const payButton = await screen.findByRole("button", {
      name: /razorpay auto debit not configured/i,
    });
    expect(payButton).toBeDisabled();
    expect(screen.queryByText(/phonepe/i)).not.toBeInTheDocument();
  });

  it("starts a self-serve upgrade through Razorpay for Elite Studio URLs", async () => {
    navigationState.search = "tier=elite_studio&interval=monthly";
    const razorpayOpen = vi.fn();
    Object.defineProperty(window, "Razorpay", {
      configurable: true,
      writable: true,
      value: vi.fn(function Razorpay() {
        return { open: razorpayOpen };
      }),
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
            providers: [{ id: "razorpay", configured: true }],
          }),
        } as unknown as Response;
      }
      if (url.includes("/workspace/subscription/upgrade")) {
        expect(init?.body).toBe(
          JSON.stringify({
            to_tier: "elite_studio",
            provider: "razorpay",
            billing_interval: "monthly",
          }),
        );
        return {
          ok: true,
          status: 200,
          json: async () => ({
            provider: "razorpay",
            upgrade_order_id: "uo-elite-1",
            amount_paise: 471882,
            currency: "INR",
            razorpay_order_id: "rzp-elite-1",
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
      name: /pay .* with razorpay auto debit/i,
    });
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/workspace/subscription/upgrade"),
        expect.objectContaining({
          method: "POST",
        }),
      );
      expect(razorpayOpen).toHaveBeenCalled();
    });
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
            providers: [{ id: "razorpay", configured: true }],
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
            amount_paise: 23482,
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
      name: /pay .* with razorpay auto debit/i,
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
      expect(razorpayOpen).toHaveBeenCalled();
    });
  });
});
