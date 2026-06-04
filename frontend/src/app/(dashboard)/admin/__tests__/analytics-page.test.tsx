import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api/admin", () => ({
  getEngagementMetrics: vi.fn(),
  getGrowthMetrics: vi.fn(),
  getFeatureAdoption: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "test-token"),
}));

import {
  getEngagementMetrics,
  getGrowthMetrics,
  getFeatureAdoption,
} from "@/lib/api/admin";
import AdminAnalyticsPage from "../analytics/page";

const mockEngagement = vi.mocked(getEngagementMetrics);
const mockGrowth = vi.mocked(getGrowthMetrics);
const mockFeatureAdoption = vi.mocked(getFeatureAdoption);

beforeEach(() => {
  vi.clearAllMocks();
  mockEngagement.mockResolvedValue({
    dau: 1200,
    wau: 5400,
    mau: 18000,
    uploads_today: 3500,
    galleries_created: 120,
    avg_session_minutes: 14.5,
  });
  mockGrowth.mockResolvedValue({
    total_users: 25000,
    new_users_today: 45,
    new_users_week: 280,
    new_users_month: 1100,
    timeseries: [
      { date: "2026-04-01", new_users: 40, cumulative: 24900 },
      { date: "2026-04-02", new_users: 45, cumulative: 24945 },
    ],
  });
  mockFeatureAdoption.mockResolvedValue([
    { feature: "AI Tagging", adoption_pct: 72, active_users: 13000 },
    { feature: "Proofing", adoption_pct: 45, active_users: 8100 },
    { feature: "Face Detection", adoption_pct: 38, active_users: 6840 },
  ]);
});

describe("AdminAnalyticsPage", () => {
  it("renders DAU/WAU/MAU metrics", async () => {
    render(<AdminAnalyticsPage />);
    await waitFor(() => {
      expect(screen.getByText(/DAU/i)).toBeTruthy();
      expect(screen.getByText("1,200")).toBeTruthy();
    });
  });

  it("shows total users", async () => {
    render(<AdminAnalyticsPage />);
    await waitFor(() => {
      expect(screen.getByText("25,000")).toBeTruthy();
    });
  });

  it("shows new users today", async () => {
    render(<AdminAnalyticsPage />);
    await waitFor(() => {
      expect(screen.getByText("45")).toBeTruthy();
    });
  });

  it("renders feature adoption table", async () => {
    render(<AdminAnalyticsPage />);
    await waitFor(() => {
      expect(screen.getByText("AI Tagging")).toBeTruthy();
      expect(screen.getByText("72%")).toBeTruthy();
    });
  });

  it("shows uploads today metric", async () => {
    render(<AdminAnalyticsPage />);
    await waitFor(() => {
      expect(screen.getByText("3,500")).toBeTruthy();
    });
  });

  it("shows average session duration", async () => {
    render(<AdminAnalyticsPage />);
    await waitFor(() => {
      expect(screen.getByText(/14\.5/)).toBeTruthy();
    });
  });

  it("shows loading state", () => {
    mockEngagement.mockReturnValue(new Promise(() => {}));
    render(<AdminAnalyticsPage />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it("calls engagement API on mount", async () => {
    render(<AdminAnalyticsPage />);
    await waitFor(() => {
      expect(mockEngagement).toHaveBeenCalledWith("test-token");
    });
  });

  it("handles API error", async () => {
    mockEngagement.mockRejectedValue(new Error("fail"));
    render(<AdminAnalyticsPage />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeTruthy();
    });
  });

  it("shows galleries created metric", async () => {
    render(<AdminAnalyticsPage />);
    await waitFor(() => {
      expect(screen.getByText("120")).toBeTruthy();
    });
  });

  it("renders growth data", async () => {
    render(<AdminAnalyticsPage />);
    await waitFor(() => {
      expect(mockGrowth).toHaveBeenCalledWith("test-token");
    });
  });

  it("shows new users this month", async () => {
    render(<AdminAnalyticsPage />);
    await waitFor(() => {
      expect(screen.getByText("1,100")).toBeTruthy();
    });
  });
});
