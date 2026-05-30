import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Regression test for F-052: the PhonePe redirect_url returned by
// /workspace/subscription/upgrade must be scheme-checked (https only)
// before window.location.assign(). Without the guard a javascript:/data:/http:
// payload in a misconfigured or tampered backend response would navigate
// (open redirect / XSS). This mirrors the existing guard in
// components/streams/RechargeModal.tsx.
//
// The PhonePe *tile* is currently hidden (PHONEPE_ENABLED = false), but the
// guard lives in the startPayment() PhonePe branch, which fires whenever the
// backend response has provider === "phonepe" — independent of which tile the
// user clicked. So we click the rendered Razorpay tile and have the mocked
// /upgrade endpoint answer with provider: "phonepe", exercising the exact code
// path under test.

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
  // tier=starter is a valid paid plan in pricingPlans (id "starter").
  useSearchParams: () => new URLSearchParams("tier=starter&interval=monthly"),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: () => "test-token",
}));

import ChoosePaymentPage from "../page";

// Build a fetch stub whose /upgrade response carries a PhonePe order with the
// supplied redirect_url.
function stubUpgradeFetch(redirectUrl: string) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
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
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  });
}

let assignSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
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
    vi.stubGlobal("fetch", stubUpgradeFetch("javascript:alert(document.cookie)"));

    render(<ChoosePaymentPage />);

    // The only visible payment tile is Razorpay (PhonePe tile is gated off).
    // Clicking it triggers startPayment(); the mocked /upgrade answers with a
    // PhonePe order, driving the guarded branch.
    const payButton = await screen.findByRole("button", {
      name: /pay .* with razorpay/i,
    });
    fireEvent.click(payButton);

    // Guard must reject the URL: error banner shown, no navigation.
    await waitFor(() => {
      expect(screen.getByText("Invalid payment redirect URL")).toBeInTheDocument();
    });
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("navigates for a valid https redirect_url (control)", async () => {
    vi.stubGlobal("fetch", stubUpgradeFetch("https://mercury.phonepe.com/pay/abc123"));

    render(<ChoosePaymentPage />);

    const payButton = await screen.findByRole("button", {
      name: /pay .* with razorpay/i,
    });
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith("https://mercury.phonepe.com/pay/abc123");
    });
    expect(
      screen.queryByText("Invalid payment redirect URL"),
    ).not.toBeInTheDocument();
  });
});
