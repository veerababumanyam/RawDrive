import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { UploadCreditPill } from "../UploadCreditPill";
import { persistAuthTokens, clearAuthTokens } from "@/lib/auth";

// authFetch reads the token via getStoredAccessToken, so we prime the
// in-memory cache the same way the login flow does in production.
beforeEach(() => {
  persistAuthTokens("test-token");
});

afterEach(() => {
  clearAuthTokens();
  vi.restoreAllMocks();
});

describe("UploadCreditPill", () => {
  it("renders available credits from /api/v1/uploads/balance", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("/api/v1/uploads/balance")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            available_credits: 1234,
            plan_granted: 200,
            purchased: 1000,
            reserved: 0,
            consumed: -66,
            refunded: 100,
            updated_at: "2026-04-21T10:00:00Z",
            low_balance: false,
            low_balance_threshold: 100,
          }),
        } as Response);
      }
      // Other URLs (uploads/packages when modal opens) return empty
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ packages: [] }) } as Response);
    });

    render(<UploadCreditPill />);

    await waitFor(() => {
      expect(screen.getByTestId("upload-credit-pill-credits").textContent).toBe("1,234 credits");
    });
    // Low-balance data attribute reflects the response (false here).
    expect(screen.getByTestId("upload-credit-pill").getAttribute("data-low-balance")).toBe("false");
  });

  it("marks pill as low-balance when server flag is set", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        available_credits: 42,
        low_balance: true,
        low_balance_threshold: 100,
      }),
    } as Response);

    render(<UploadCreditPill />);

    await waitFor(() => {
      expect(screen.getByTestId("upload-credit-pill-credits").textContent).toBe("42 credits");
    });
    expect(screen.getByTestId("upload-credit-pill").getAttribute("data-low-balance")).toBe("true");
  });

  it("hides entirely when the backend returns 404 (feature flag off)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "not_found" }),
    } as Response);

    const { container } = render(<UploadCreditPill />);

    await waitFor(() => {
      // The pill should NOT be in the DOM — it returns null when disabled.
      expect(container.querySelector("[data-testid='upload-credit-pill']")).toBeNull();
    });
  });

  it("opens the RechargeModal on the uploads tab when clicked", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("/uploads/balance")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ available_credits: 500, low_balance: false }),
        } as Response);
      }
      if (String(url).includes("/uploads/packages")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            packages: [
              {
                code: "starter",
                credits: 500,
                price_paise: 29900,
                currency: "INR",
                display_name: "Starter — 500 credits",
              },
            ],
            next_cursor: "",
          }),
        } as Response);
      }
      // Streaming packages — RechargeModal also fires this hook on mount
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ packages: [] }) } as Response);
    });

    render(<UploadCreditPill />);

    await waitFor(() => {
      expect(screen.getByTestId("upload-credit-pill-button")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("upload-credit-pill-button"));

    // Modal opens DIRECTLY on the uploads tab (initialSurface="uploads").
    // The Starter tier from the uploads catalogue renders — proves the
    // default-tab wiring is the uploads surface, not streaming.
    await waitFor(() => {
      expect(screen.getByTestId("upload-package-starter")).toBeDefined();
    });
    // Uploads tab aria-selected confirms the default-tab contract.
    expect(
      screen.getByTestId("recharge-tab-uploads").getAttribute("aria-selected"),
    ).toBe("true");
  });
});
