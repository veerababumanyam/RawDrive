import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DealerAdminReview from "../DealerAdminReview";

const dealerApi = vi.hoisted(() => ({
  listDealers: vi.fn(),
  approveDealer: vi.fn(),
  rejectDealer: vi.fn(),
  suspendDealer: vi.fn(),
  enableDealer: vi.fn(),
  getAdminDealerStateReports: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: () => "admin-token",
}));

vi.mock("@/lib/api/dealer", () => dealerApi);

const pendingDealer = {
  id: "dealer-1",
  user_id: "user-1",
  state_id: 1,
  business_name: "Telangana Dealer",
  territory_type: "primary",
  status: "pending",
  commission_rate_pct: null,
  bank_account: null,
  pan_number: "ABCDE1234F",
  gstin: "",
  referral_code: "",
  approved_at: null,
  approved_by: null,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};

const reportResponse = {
  year: 2026,
  month: 6,
  period_start: "2026-06-01T00:00:00Z",
  period_end: "2026-07-01T00:00:00Z",
  default_commission_rate_pct: 20,
  total_subscription_paisa: 1000000,
  total_projected_dealer_share_paisa: 200000,
  reports: [
    {
      dealer_id: "dealer-1",
      business_name: "Telangana Dealer",
      state_id: 1,
      state_name: "Telangana",
      territory_type: "primary",
      status: "pending",
      commission_rate_pct: 20,
      total_subscription_paisa: 1000000,
      dealer_share_paisa: 200000,
      subscriber_count: 7,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  dealerApi.listDealers.mockResolvedValue([pendingDealer]);
  dealerApi.getAdminDealerStateReports.mockResolvedValue(reportResponse);
  dealerApi.approveDealer.mockResolvedValue({
    ...pendingDealer,
    status: "approved",
    commission_rate_pct: 20,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ states: [{ id: 1, name: "Telangana" }] }),
    })),
  );
});

describe("DealerAdminReview reports toggle", () => {
  it("loads statewide dealer reports with the 20 percent default", async () => {
    render(<DealerAdminReview />);

    await screen.findByText("Dealer Applications");
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));

    await waitFor(() => {
      expect(dealerApi.getAdminDealerStateReports).toHaveBeenCalledWith(
        "admin-token",
        { commission_rate_pct: 20 },
      );
    });
    expect(
      await screen.findByText("Statewide dealer report"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Telangana Dealer").length).toBeGreaterThan(0);
    expect(screen.getByText("Default commission: 20%")).toBeInTheDocument();
  });

  it("starts dealer approval reviews at 20 percent commission", async () => {
    render(<DealerAdminReview />);

    await screen.findByText("Telangana Dealer");
    fireEvent.click(screen.getByRole("button", { name: "Review" }));

    const input = screen.getByLabelText("Commission Rate (%)");
    expect(input).toHaveValue(20);
  });
});
