// M41 FR-UCRT-10 — tests for the upload credits tab in RechargeModal.
//
// Kept in a separate file from the streaming tests (RechargeModal.test.tsx)
// because they exercise a different fetch endpoint and a different expected
// DOM shape; mixing them would make the fetch-mock matrix harder to reason
// about. The streaming tests use `fakePackages` for /streaming/packages;
// these use `fakeUploadPackages` for /uploads/packages.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { RechargeModal } from "../RechargeModal";
import { persistAuthTokens, clearAuthTokens } from "@/lib/auth";

const fakeUploadPackages = {
  packages: [
    {
      code: "starter",
      credits: 500,
      price_paise: 29900,
      currency: "INR",
      display_name: "Starter — 500 credits",
    },
    {
      code: "pro",
      credits: 2000,
      price_paise: 149900,
      currency: "INR",
      display_name: "Pro — 2,000 credits",
    },
    {
      code: "studio",
      credits: 8000,
      price_paise: 349900,
      currency: "INR",
      display_name: "Studio — 8,000 credits",
    },
  ],
  next_cursor: "",
};

beforeEach(() => {
  // useUploadPackages reads the access token via getStoredAccessToken.
  // The module keeps the token in an in-memory cache (accessTokenCache),
  // so we prime it via the public persistAuthTokens helper — exactly
  // how the login flow populates the cache in production.
  persistAuthTokens("test-token");
});

afterEach(() => {
  clearAuthTokens();
  vi.restoreAllMocks();
});

describe("RechargeModal — uploads tab", () => {
  it("renders tab switcher with both tabs", () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ packages: [] }),
    } as Response);

    render(<RechargeModal open onClose={vi.fn()} />);

    // Tab switcher is visible regardless of active surface.
    expect(screen.getByTestId("recharge-tab-streaming")).toBeDefined();
    expect(screen.getByTestId("recharge-tab-uploads")).toBeDefined();
  });

  it("switches to uploads tab and fetches upload packages", async () => {
    const fetchMock = vi
      .fn()
      // First call: streaming packages (initial mount is streaming tab)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ packages: [] }),
      } as Response)
      // Second call: upload packages when user clicks the Uploads tab
      .mockResolvedValueOnce({
        ok: true,
        json: async () => fakeUploadPackages,
      } as Response);
    global.fetch = fetchMock;

    render(<RechargeModal open onClose={vi.fn()} />);

    // Click the uploads tab.
    fireEvent.click(screen.getByTestId("recharge-tab-uploads"));

    await waitFor(() => {
      expect(screen.getByTestId("upload-package-starter")).toBeDefined();
    });

    // Both tiers visible.
    expect(screen.getByTestId("upload-package-pro")).toBeDefined();
    expect(screen.getByTestId("upload-package-studio")).toBeDefined();

    // Display names + credit counts + paise prices render correctly.
    expect(screen.getByText("Starter — 500 credits")).toBeDefined();
    expect(screen.getByText("Pro — 2,000 credits")).toBeDefined();
    expect(screen.getByText("Studio — 8,000 credits")).toBeDefined();
    // formatINR(29900) → "299" (no fraction)
    expect(screen.getByText("₹299")).toBeDefined();
    expect(screen.getByText("₹1,499")).toBeDefined();
    expect(screen.getByText("₹3,499")).toBeDefined();

    // The second fetch call is to /api/v1/uploads/packages with the
    // bearer token from localStorage. This is the M41 FR-UCRT-10 wire
    // contract — the guard against a future refactor that silently
    // drops authentication on this endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [uploadsCallUrl, uploadsCallInit] = fetchMock.mock.calls[1];
    expect(String(uploadsCallUrl)).toContain("/api/v1/uploads/packages");
    expect(
      (uploadsCallInit as RequestInit).headers as Record<string, string>,
    ).toMatchObject({
      Authorization: "Bearer test-token",
    });
  });

  it("hides streaming-specific controls when uploads tab is active", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ packages: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => fakeUploadPackages,
      } as Response);

    render(<RechargeModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("recharge-tab-uploads"));

    await waitFor(() => {
      expect(screen.getByTestId("upload-package-starter")).toBeDefined();
    });

    // Provider radios + submit button are streaming-only. The uploads
    // checkout flow lands in a later backend slice; showing a submit
    // button that cannot work would be a deceptive UX.
    expect(screen.queryByTestId("provider-phonepe")).toBeNull();
    expect(screen.queryByTestId("provider-razorpay")).toBeNull();
    expect(screen.queryByTestId("recharge-submit")).toBeNull();

    // Coming-soon notice is visible so the user knows why there's no CTA.
    expect(screen.getByTestId("upload-order-init-unavailable")).toBeDefined();
    expect(
      screen.getByTestId("upload-order-init-unavailable"),
    ).toHaveTextContent(
      "Upload credit checkout is unavailable because the order endpoint is not live yet.",
    );
  });

  it("honours initialSurface prop", async () => {
    // The modal mounts with open=true, so both useEffect branches
    // (streaming + uploads) fire on first render. Order between them is
    // not deterministic across React + vitest passes, so match by URL
    // rather than by mock-call index.
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("/api/v1/uploads/packages")) {
        return Promise.resolve({
          ok: true,
          json: async () => fakeUploadPackages,
        } as Response);
      }
      // streaming packages default — return empty list
      return Promise.resolve({
        ok: true,
        json: async () => ({ packages: [] }),
      } as Response);
    });

    render(<RechargeModal open onClose={vi.fn()} initialSurface="uploads" />);

    await waitFor(() => {
      expect(screen.getByTestId("upload-package-starter")).toBeDefined();
    });
    // The uploads tab element has aria-selected="true" (HTML attribute).
    expect(
      screen.getByTestId("recharge-tab-uploads").getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen
        .getByTestId("recharge-tab-streaming")
        .getAttribute("aria-selected"),
    ).toBe("false");
  });

  it("shows error state when upload packages fetch fails", async () => {
    global.fetch = vi
      .fn()
      // Streaming fetch on initial mount
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ packages: [] }),
      } as Response)
      // Uploads fetch fails
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      } as Response);

    render(<RechargeModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("recharge-tab-uploads"));

    await waitFor(() => {
      expect(screen.getByText(/Failed to load upload packages/)).toBeDefined();
    });
  });
});
