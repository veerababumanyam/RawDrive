import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// revenue/page.tsx calls useRouter() from next/navigation (for router.refresh()
// on the Refresh button). Without the app-router context the hook throws
// "invariant expected app router to be mounted" on every render. Mock only the
// hook the page imports — useRouter — mirroring the pattern in
// src/components/auth/__tests__/LoginForm.oauth.test.tsx.
const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: nav.push,
    replace: nav.replace,
    refresh: nav.refresh,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("@/lib/api/admin", () => ({
  downloadRevenueRecordsPDF: vi.fn(),
  emailRevenueRecordsToDealer: vi.fn(),
  getRevenueDashboard: vi.fn(),
  getRevenueTimeSeries: vi.fn(),
  getRevenueStateBreakdown: vi.fn(),
  searchRevenueRecords: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "test-token"),
}));

vi.mock("@/lib/api/dealer", () => ({
  getStates: vi.fn(),
}));

import {
  downloadRevenueRecordsPDF,
  emailRevenueRecordsToDealer,
  getRevenueDashboard,
  getRevenueTimeSeries,
  getRevenueStateBreakdown,
  searchRevenueRecords,
} from "@/lib/api/admin";
import { getStates } from "@/lib/api/dealer";
import AdminRevenuePage from "../revenue/page";

const mockDownloadPDF = vi.mocked(downloadRevenueRecordsPDF);
const mockEmailDealer = vi.mocked(emailRevenueRecordsToDealer);
const mockRevenue = vi.mocked(getRevenueDashboard);
const mockTimeSeries = vi.mocked(getRevenueTimeSeries);
const mockStateBreakdown = vi.mocked(getRevenueStateBreakdown);
const mockSearchRecords = vi.mocked(searchRevenueRecords);
const mockGetStates = vi.mocked(getStates);

const sampleRevenue = {
  mrr_paisa: 5000000,
  arr_paisa: 60000000,
  churn_rate: 2.5,
  total_subscribers: 450,
  state_breakdown: [
    { state_name: "Karnataka", revenue_paisa: 2000000, subscriber_count: 150 },
    {
      state_name: "Maharashtra",
      revenue_paisa: 1500000,
      subscriber_count: 120,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:revenue-report"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLAnchorElement.prototype, "click", {
    configurable: true,
    value: vi.fn(),
  });
  mockRevenue.mockResolvedValue(sampleRevenue);
  mockTimeSeries.mockResolvedValue([
    { period: "2026-01", revenue_paisa: 4500000, subscribers: 400 },
    { period: "2026-02", revenue_paisa: 4800000, subscribers: 420 },
    { period: "2026-03", revenue_paisa: 5000000, subscribers: 450 },
  ]);
  mockStateBreakdown.mockResolvedValue(sampleRevenue.state_breakdown);
  mockGetStates.mockResolvedValue([
    { id: 12, name: "Karnataka" },
    { id: 27, name: "Maharashtra" },
  ]);
  mockSearchRecords.mockResolvedValue({
    state_id: 12,
    state_name: "Karnataka",
    district: "Bengaluru Urban",
    generated_at: "2026-06-06T03:11:00Z",
    default_commission_rate_pct: 20,
    total_revenue_paisa: 100000,
    total_subscribers: 3,
    total_dealer_share_paisa: 20000,
    dealer: {
      dealer_id: "dealer-1",
      business_name: "RawDrive Karnataka",
      email: "dealer@example.test",
      commission_rate_pct: 20,
    },
    records: [
      {
        state_id: 12,
        state_name: "Karnataka",
        district: "Bengaluru Urban",
        revenue_paisa: 100000,
        subscriber_count: 3,
        dealer_share_paisa: 20000,
      },
    ],
  });
  mockDownloadPDF.mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
  mockEmailDealer.mockResolvedValue({
    sent_to: "dealer@example.test",
    dealer_id: "dealer-1",
    business_name: "RawDrive Karnataka",
  });
});

describe("AdminRevenuePage", () => {
  it("renders MRR card", async () => {
    render(<AdminRevenuePage />);
    await waitFor(() => {
      expect(screen.getAllByText(/MRR/i).length).toBeGreaterThan(0);
    });
  });

  it("renders ARR card", async () => {
    render(<AdminRevenuePage />);
    await waitFor(() => {
      expect(screen.getAllByText(/ARR/i).length).toBeGreaterThan(0);
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
      expect(screen.getAllByText("Karnataka").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Maharashtra").length).toBeGreaterThan(0);
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
      expect(mockTimeSeries).toHaveBeenCalledWith(
        "test-token",
        expect.any(Object),
      );
    });
  });

  it("searches revenue records by state and district", async () => {
    render(<AdminRevenuePage />);

    const stateSelect = await screen.findByLabelText("State");
    fireEvent.change(stateSelect, {
      target: { value: "12" },
    });
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Bengaluru Urban" })).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("District"), {
      target: { value: "Bengaluru Urban" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search revenue/i }));

    await waitFor(() => {
      expect(mockSearchRecords).toHaveBeenCalledWith("test-token", {
        state_id: 12,
        district: "Bengaluru Urban",
      });
    });
    expect(await screen.findByText("RawDrive Karnataka")).toBeTruthy();
  });

  it("downloads a PDF for the selected revenue record filter", async () => {
    render(<AdminRevenuePage />);

    const stateSelect = await screen.findByLabelText("State");
    fireEvent.change(stateSelect, {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    await waitFor(() => {
      expect(mockDownloadPDF).toHaveBeenCalledWith("test-token", {
        state_id: 12,
        district: undefined,
      });
    });
  });

  it("emails the selected revenue report to the state dealer", async () => {
    render(<AdminRevenuePage />);

    const stateSelect = await screen.findByLabelText("State");
    fireEvent.change(stateSelect, {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /email dealer/i }));

    await waitFor(() => {
      expect(mockEmailDealer).toHaveBeenCalledWith("test-token", {
        state_id: 12,
        district: undefined,
      });
    });
    expect(await screen.findByText("Report emailed to dealer@example.test.")).toBeTruthy();
  });
});
