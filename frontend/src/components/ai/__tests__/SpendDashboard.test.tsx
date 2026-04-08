import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SpendDashboard } from "../SpendDashboard";

vi.mock("@/lib/api/ai", () => ({
  getSpend: vi.fn(),
  getCredits: vi.fn(),
}));

import { getSpend, getCredits } from "@/lib/api/ai";

const mockGetSpend = vi.mocked(getSpend);
const mockGetCredits = vi.mocked(getCredits);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SpendDashboard", () => {
  it("renders spend summary cards", async () => {
    mockGetSpend.mockResolvedValue({
      workspace_id: "ws-1",
      period_start: "2026-04-01T00:00:00Z",
      period_end: "2026-04-30T23:59:59Z",
      total_paisa: 125000,
      by_operation: { tagging: 80000, search: 30000, face_detection: 15000 },
      monthly_cap_paisa: 500000,
      cap_used_percent: 25,
    });
    mockGetCredits.mockResolvedValue({
      workspace_id: "ws-1",
      monthly_cap_paisa: 500000,
      spent_this_month_paisa: 125000,
      remaining_paisa: 375000,
      cap_used_percent: 25,
      is_cap_reached: false,
    });

    render(<SpendDashboard token="test" />);

    await waitFor(() => {
      // Should show "This Month" card
      expect(screen.getByText("This Month")).toBeTruthy();
      // Should show cost breakdown
      expect(screen.getByText(/tagging/i)).toBeTruthy();
    });
  });

  it("shows 'No cap' when no cap set", async () => {
    mockGetSpend.mockResolvedValue({
      workspace_id: "ws-1",
      period_start: "2026-04-01",
      period_end: "2026-04-30",
      total_paisa: 5000,
      by_operation: {},
      monthly_cap_paisa: 0,
      cap_used_percent: 0,
    });
    mockGetCredits.mockResolvedValue({
      workspace_id: "ws-1",
      monthly_cap_paisa: 0,
      spent_this_month_paisa: 5000,
      remaining_paisa: -1,
      cap_used_percent: 0,
      is_cap_reached: false,
    });

    render(<SpendDashboard token="test" />);

    await waitFor(() => {
      expect(screen.getByText("No cap")).toBeTruthy();
      expect(screen.getByText("Unlimited")).toBeTruthy();
    });
  });

  it("shows progress bar when cap is set", async () => {
    mockGetSpend.mockResolvedValue({
      workspace_id: "ws-1",
      period_start: "2026-04-01",
      period_end: "2026-04-30",
      total_paisa: 400000,
      by_operation: { tagging: 400000 },
      monthly_cap_paisa: 500000,
      cap_used_percent: 80,
    });
    mockGetCredits.mockResolvedValue({
      workspace_id: "ws-1",
      monthly_cap_paisa: 500000,
      spent_this_month_paisa: 400000,
      remaining_paisa: 100000,
      cap_used_percent: 80,
      is_cap_reached: false,
    });

    render(<SpendDashboard token="test" />);

    await waitFor(() => {
      expect(screen.getByText("80%")).toBeTruthy();
      expect(screen.getByText("Usage")).toBeTruthy();
    });
  });
});
