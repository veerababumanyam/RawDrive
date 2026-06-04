import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DealerTerritoryPage from "../page";

// The page composes three live calls from @/lib/api/dealer:
//   getDealerDashboard()    -> the dealer record (state_id, territory_type, ...)
//   getStates()             -> [{ id, name }] to resolve state_id -> name
//   getDealerPhotographers() -> coverage count (photographers in territory)
// Mock the module so the test exercises rendering/composition, not the network.
const getDealerDashboard = vi.fn();
const getStates = vi.fn();
const getDealerPhotographers = vi.fn();

vi.mock("@/lib/api/dealer", () => ({
  getDealerDashboard: () => getDealerDashboard(),
  getStates: () => getStates(),
  getDealerPhotographers: () => getDealerPhotographers(),
}));

const approvedDealer = {
  id: "dealer-1",
  user_id: "user-1",
  state_id: 1,
  business_name: "Veera Studios",
  territory_type: "primary",
  status: "approved",
  commission_rate_pct: 12.5,
  bank_account: null,
  pan_number: "ABCDE1234F",
  gstin: "",
  referral_code: "VEERA10",
  approved_at: "2026-04-01T00:00:00Z",
  approved_by: "admin-1",
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DealerTerritoryPage — functional territory view", () => {
  it("resolves state_id to a state name and renders territory + coverage", async () => {
    getDealerDashboard.mockResolvedValue(approvedDealer);
    getStates.mockResolvedValue([
      { id: 1, name: "Karnataka" },
      { id: 2, name: "Maharashtra" },
    ]);
    getDealerPhotographers.mockResolvedValue([
      {
        user_id: "p1",
        full_name: "A",
        email: "a@x.com",
        subscription_plan: "pro",
        subscription_status: "active",
      },
      {
        user_id: "p2",
        full_name: "B",
        email: "b@x.com",
        subscription_plan: "",
        subscription_status: "none",
      },
      {
        user_id: "p3",
        full_name: "C",
        email: "c@x.com",
        subscription_plan: "pro",
        subscription_status: "active",
      },
    ]);

    render(<DealerTerritoryPage />);

    // Resolved state NAME (not the raw "#1") proves getStates() wiring.
    await waitFor(() => {
      expect(screen.getByText("Karnataka")).toBeInTheDocument();
    });
    // The unrelated state must NOT leak into the view.
    expect(screen.queryByText("Maharashtra")).not.toBeInTheDocument();

    // Territory type from the dealer record.
    expect(screen.getByText(/primary/i)).toBeInTheDocument();

    // Coverage = number of photographers returned (3).
    expect(screen.getByText(/^3 photographers$/)).toBeInTheDocument();

    // Commission rate + referral code wired from the dealer record.
    expect(screen.getByText(/12\.5\s*%/)).toBeInTheDocument();
    expect(screen.getByText("VEERA10")).toBeInTheDocument();

    // The "coming soon" placeholder is gone.
    expect(
      screen.queryByText(/will be available here/i),
    ).not.toBeInTheDocument();
  });

  it("renders a friendly register prompt when the user is not a dealer (404)", async () => {
    // getDealerDashboard throws on a 404 from the endpoint.
    getDealerDashboard.mockRejectedValue(
      new Error("Failed to fetch dealer dashboard"),
    );
    getStates.mockResolvedValue([{ id: 1, name: "Karnataka" }]);
    getDealerPhotographers.mockResolvedValue([]);

    render(<DealerTerritoryPage />);

    await waitFor(() => {
      expect(screen.getByText(/register as a dealer/i)).toBeInTheDocument();
    });

    // No territory data should render in the not-a-dealer state.
    expect(screen.queryByText("Karnataka")).not.toBeInTheDocument();
  });
});
