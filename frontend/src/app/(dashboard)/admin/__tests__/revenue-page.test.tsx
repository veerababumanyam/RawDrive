import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api/admin", () => ({
  getRevenueDashboard: vi.fn(),
  getRevenueTimeSeries: vi.fn(),
  getRevenueStateBreakdown: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "test-token"),
}));

import { getRevenueDashboard, getRevenueTimeSeries, getRevenueStateBreakdown } from "@/lib/api/admin";
import AdminRevenuePage from "../revenue/page";

const mockRevenue = vi.mocked(getRevenueDashboard);
const mockTimeSeries = vi.mocked(getRevenueTimeSeries);
const mockStateBreakdown = vi.mocked(getRevenueStateBreakdown);

const sampleRevenue = {
  mrr_paisa: 5000000,
  arr_paisa: 60000000,
  churn_rate: 2.5,
  total_subscribers: 450,
  state_breakdown: [
    { state_name: "Karnataka", revenue_paisa: 2000000, subscriber_count: 150 },
    { state_name: "Maharashtra", revenue_paisa: 1500000, subscriber_count: 120 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRevenue.mockResolvedValue(sampleRevenue);
  mockTimeSeries.mockResolvedValue([
    { period: "2026-01", revenue_paisa: 4500000, subscribers: 400 },
    { period: "2026-02", revenue_paisa: 4800000, subscribers: 420 },
    { period: "2026-03", revenue_paisa: 5000000, subscribers: 450 },
  ]);
  mockStateBreakdown.mockResolvedValue(sampleRevenue.state_breakdown);
});

describe("AdminRevenuePage", () => {
  it("renders MRR card", async () => {
    render(<AdminRevenuePage />);
    await waitFor(() => {
      expect(screen.getByText(/MRR/i)).toBeTruthy();
    });
  });

  it("renders ARR card", async () => {
    render(<AdminRevenuePage />);
    await waitFor(() => {
      expect(screen.getByText(/ARR/i)).toBeTruthy();
    });
  });

  it("shows churn rate", async () => {
    render(<AdminRevenuePage />);
    await waitFor(() => {
      expect(screen.getByText(/2\.5%/)).toBeTruthy();
    });
  });

  it("shows total subscriber count", async () => {
    render(<AdminRevenuePage />);
    await waitFor(() => {
      expect(screen.getAllByText("450").length).toBeGreaterThan(0);
    });
  });

  it("renders state breakdown table", async () => {
    render(<AdminRevenuePage />);
    await waitFor(() => {
      expect(screen.getByText("Karnataka")).toBeTruthy();
      expect(screen.getByText("Maharashtra")).toBeTruthy();
    });
  });

  it("shows loading state", () => {
    mockRevenue.mockReturnValue(new Promise(() => {}));
    render(<AdminRevenuePage />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it("calls getRevenueDashboard on mount", async () => {
    render(<AdminRevenuePage />);
    await waitFor(() => {
      expect(mockRevenue).toHaveBeenCalledWith("test-token");
    });
  });

  it("formats currency in INR", async () => {
    render(<AdminRevenuePage />);
    await waitFor(() => {
      // 5000000 paisa = ₹50,000 — appears in MRR card and state table
      expect(screen.getAllByText(/50,000/).length).toBeGreaterThan(0);
    });
  });

  it("handles API error gracefully", async () => {
    mockRevenue.mockRejectedValue(new Error("fail"));
    render(<AdminRevenuePage />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeTruthy();
    });
  });

  it("has revenue dashboard heading", async () => {
    render(<AdminRevenuePage />);
    await waitFor(() => {
      expect(screen.getByText(/revenue/i)).toBeTruthy();
    });
  });

  it("shows subscriber count per state", async () => {
    render(<AdminRevenuePage />);
    await waitFor(() => {
      expect(screen.getByText("150")).toBeTruthy();
      expect(screen.getByText("120")).toBeTruthy();
    });
  });

  it("fetches time series data", async () => {
    render(<AdminRevenuePage />);
    await waitFor(() => {
      expect(mockTimeSeries).toHaveBeenCalledWith("test-token", expect.any(Object));
    });
  });
});
