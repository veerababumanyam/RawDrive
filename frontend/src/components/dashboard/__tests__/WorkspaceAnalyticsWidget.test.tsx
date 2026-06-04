import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import { WorkspaceAnalyticsWidget } from "../WorkspaceAnalyticsWidget";

const dto = {
  month: "2026-04",
  streamsCount: 12,
  creditsConsumed: 3450,
  topStreams: [
    {
      id: "a",
      title: "Reception Live",
      peakViewers: 180,
      watchTimeSec: 7200,
      chatMessages: 240,
    },
    {
      id: "b",
      title: "Sangeet",
      peakViewers: 90,
      watchTimeSec: 3600,
      chatMessages: 120,
    },
    {
      id: "c",
      title: "Mehendi",
      peakViewers: 45,
      watchTimeSec: 1800,
      chatMessages: 60,
    },
  ],
  byDayCredits: [
    { date: "2026-04-01", credits: 100 },
    { date: "2026-04-02", credits: 250 },
    { date: "2026-04-03", credits: 75 },
  ],
};

function jsonResp(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: new Headers(),
  } as unknown as Response;
}

describe("WorkspaceAnalyticsWidget", () => {
  it("renders monthly streams, credits consumed, and top performers", async () => {
    const fn = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResp(dto),
    );
    render(<WorkspaceAnalyticsWidget defaultMonth="2026-04" fetcher={fn} />);
    await waitFor(() => {
      expect(screen.getByText(/Streams/i)).toBeTruthy();
    });
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText(/3,?450/)).toBeTruthy();
    expect(screen.getByText("Reception Live")).toBeTruthy();
    expect(screen.getByText("Sangeet")).toBeTruthy();
    expect(screen.getByText("Mehendi")).toBeTruthy();
  });

  it("month navigation triggers refetch with adjusted YYYY-MM", async () => {
    const fn = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResp(dto),
    );
    render(<WorkspaceAnalyticsWidget defaultMonth="2026-04" fetcher={fn} />);
    await waitFor(() => screen.getByText("Reception Live"));
    const prev = screen.getByLabelText(/previous month/i);
    fireEvent.click(prev);
    await waitFor(() => {
      const urls = fn.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("2026-03"))).toBe(true);
    });
  });
});
