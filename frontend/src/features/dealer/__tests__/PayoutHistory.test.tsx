import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PayoutHistory from "../PayoutHistory";

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: () => "token",
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("PayoutHistory empty-result handling (F-049)", () => {
  // Regression: the backend serializes a nil []Payout slice as JSON `null`
  // (payout_repository.go declares `var payouts []Payout` and respondJSON does
  // not normalize nil slices). Before the fix, `.then(setPayouts)` set state to
  // null and useDataTable's `[...data]` spread threw "null is not iterable",
  // crashing the page for any dealer with zero payout rows.
  it("renders the empty state without crashing when the API returns null", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => null,
    });

    render(<PayoutHistory />);

    await waitFor(() => {
      expect(screen.getByText("No payouts found.")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("heading", { name: "Payout History" }),
    ).toBeInTheDocument();
  });

  it("renders the empty state when the API returns an empty array", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    render(<PayoutHistory />);

    await waitFor(() => {
      expect(screen.getByText("No payouts found.")).toBeInTheDocument();
    });
  });

  it("renders a payout row when the API returns data", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "payout-1",
          period_start: "2026-04-01T00:00:00Z",
          period_end: "2026-04-30T23:59:59Z",
          gross_attributed_revenue: 1000000,
          commission_earned: 100000,
          tds_withheld: 10000,
          net_payable: 90000,
          status: "paid",
          paid_at: "2026-05-01T00:00:00Z",
        },
      ],
    });

    render(<PayoutHistory />);

    await waitFor(() => {
      expect(screen.getByText("paid")).toBeInTheDocument();
    });

    expect(screen.queryByText("No payouts found.")).not.toBeInTheDocument();
  });
});
