import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@/lib/streaming/ledger", () => ({
  fetchLedger: vi.fn(),
  exportLedgerCSV: vi.fn(),
  LEDGER_ENTRY_TYPES: [
    "debit_reservation",
    "credit_topup",
    "refund",
    "adjustment",
    "fee",
  ],
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "test-token"),
}));

import { fetchLedger, exportLedgerCSV } from "@/lib/streaming/ledger";
import { LedgerExplorer } from "../LedgerExplorer";

const mockFetch = vi.mocked(fetchLedger);
const mockExport = vi.mocked(exportLedgerCSV);

const samplePage = {
  rows: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      workspace: "ws-aaaa",
      type: "credit_topup",
      amount: 49900,
      minutes_delta: 60,
      purchase_id: "pur-1",
      reservation_id: null,
      stream_id: null,
      idempotency_key: "idem-1",
      created_by: "actor-aaaa",
      created_at: "2026-04-10T10:00:00Z",
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      workspace: "ws-bbbb",
      type: "debit_reservation",
      amount: -1500,
      minutes_delta: -15,
      purchase_id: null,
      reservation_id: "res-1",
      stream_id: "stream-1",
      idempotency_key: "idem-2",
      created_by: "actor-bbbb",
      created_at: "2026-04-11T10:00:00Z",
    },
  ],
  next_cursor: "cursor-page-2",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue(samplePage);
  mockExport.mockResolvedValue({
    truncated: false,
    filename: "streaming_ledger.csv",
  });
});

describe("LedgerExplorer", () => {
  it("renders ledger rows in a table", async () => {
    render(<LedgerExplorer />);
    await waitFor(() => {
      expect(screen.getByText("ws-aaaa")).toBeTruthy();
      expect(screen.getByText("ws-bbbb")).toBeTruthy();
      // entry type appears once in the dropdown <option> and once per row
      expect(screen.getAllByText("credit_topup").length).toBeGreaterThanOrEqual(
        1,
      );
      expect(
        screen.getAllByText("debit_reservation").length,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders a header row with expected columns", async () => {
    render(<LedgerExplorer />);
    await waitFor(() => {
      expect(screen.getByText(/created at/i)).toBeTruthy();
      // "Workspace" label exists (filter field + table header)
      expect(screen.getAllByText(/workspace/i).length).toBeGreaterThanOrEqual(
        1,
      );
      expect(screen.getAllByText(/actor/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/entry type/i).length).toBeGreaterThanOrEqual(
        1,
      );
      expect(screen.getByText(/Δ minutes/i)).toBeTruthy();
    });
  });

  it("applies filters when Apply is clicked", async () => {
    render(<LedgerExplorer />);
    await waitFor(() => screen.getByText("ws-aaaa"));

    const wsInput = screen.getByLabelText(/workspace id/i) as HTMLInputElement;
    fireEvent.change(wsInput, { target: { value: "ws-filter-1" } });

    const fromInput = screen.getByLabelText(/from/i) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "2026-04-01T00:00" } });

    const typeSelect = screen.getByLabelText(
      /entry type/i,
    ) as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: "credit_topup" } });

    const apply = screen.getByRole("button", { name: /apply filter/i });
    fireEvent.click(apply);

    await waitFor(() => {
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(lastCall[0]).toBe("test-token");
      expect(lastCall[1]).toEqual(
        expect.objectContaining({
          workspace: "ws-filter-1",
          entryTypes: ["credit_topup"],
        }),
      );
      expect(lastCall[1].from).toBeTruthy();
    });
  });

  it("paginates via next_cursor when Load more is clicked", async () => {
    render(<LedgerExplorer />);
    await waitFor(() => screen.getByText("ws-aaaa"));

    mockFetch.mockResolvedValueOnce({ rows: [], next_cursor: undefined });
    const more = screen.getByRole("button", { name: /load more/i });
    fireEvent.click(more);

    await waitFor(() => {
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(lastCall[1]).toEqual(
        expect.objectContaining({ cursor: "cursor-page-2" }),
      );
    });
  });

  it("triggers CSV export when Export CSV is clicked", async () => {
    render(<LedgerExplorer />);
    await waitFor(() => screen.getByText("ws-aaaa"));

    const exportBtn = screen.getByRole("button", { name: /export csv/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledWith("test-token", expect.any(Object));
    });
  });

  it("warns the user when the CSV export was truncated", async () => {
    mockExport.mockResolvedValueOnce({
      truncated: true,
      filename: "streaming_ledger.csv",
    });
    render(<LedgerExplorer />);
    await waitFor(() => screen.getByText("ws-aaaa"));

    const exportBtn = screen.getByRole("button", { name: /export csv/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByText(/truncated/i)).toBeTruthy();
    });
  });

  it("renders an empty state when no rows are returned", async () => {
    mockFetch.mockResolvedValue({ rows: [], next_cursor: undefined });
    render(<LedgerExplorer />);
    await waitFor(() => {
      expect(screen.getByText(/no ledger entries/i)).toBeTruthy();
    });
  });

  it("handles API errors gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("boom"));
    render(<LedgerExplorer />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeTruthy();
    });
  });
});
