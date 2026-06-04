import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { StreamAnalyticsPanel } from "../StreamAnalyticsPanel";

const dto = {
  streamId: "s-1",
  peakViewers: 42,
  uniqueViewers: 80,
  watchTimeSec: 7200,
  avgWatchTimeSec: 90,
  chatMessages: 120,
  chatMsgsPerMin: 2.5,
  reactions: 37,
  replayViews: 14,
  conversionBySrc: { qr: 4, wa: 2, email: 1, invite: 0, direct: 1 },
  sampledAt: new Date().toISOString(),
};

function fetcher() {
  return vi.fn(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => dto,
        headers: new Headers(),
      }) as unknown as Response,
  );
}

describe("StreamAnalyticsPanel", () => {
  it("loads then renders all KPI tiles", async () => {
    const fn = fetcher();
    render(<StreamAnalyticsPanel streamId="s-1" fetcher={fn} />);
    await waitFor(() => {
      expect(screen.getByText(/Peak Viewers/i)).toBeTruthy();
    });
    expect(screen.getByText("42")).toBeTruthy(); // peak
    expect(screen.getByText("80")).toBeTruthy(); // unique
    expect(screen.getByText(/2\.5/)).toBeTruthy(); // chat/min
    expect(screen.getByText("37")).toBeTruthy(); // reactions
    expect(screen.getByText("14")).toBeTruthy(); // replay views
    // conversion buckets render as a barlist
    expect(screen.getByText(/QR/i)).toBeTruthy();
    expect(screen.getByText(/WhatsApp/i)).toBeTruthy();
  });

  it("renders forbidden message when fetch returns 403", async () => {
    const fn = vi.fn(
      async () =>
        ({
          ok: false,
          status: 403,
          json: async () => ({ error: "forbidden" }),
          headers: new Headers(),
        }) as unknown as Response,
    );
    render(<StreamAnalyticsPanel streamId="s-1" fetcher={fn} />);
    await waitFor(() => {
      expect(screen.getByText(/don't have access/i)).toBeTruthy();
    });
  });

  it("shows loading skeleton initially", () => {
    const fn = vi.fn(() => new Promise<Response>(() => {})); // never resolves
    render(<StreamAnalyticsPanel streamId="s-1" fetcher={fn} />);
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
