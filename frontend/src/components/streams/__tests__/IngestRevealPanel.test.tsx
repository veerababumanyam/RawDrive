import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { IngestRevealPanel } from "../IngestRevealPanel";

function fixedFetcher(status: number, body?: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body ?? {},
  }) as unknown as Response);
}

const scheduled = new Date("2026-05-01T18:00:00.000Z");
const preT30 = new Date(scheduled.getTime() - 45 * 60 * 1000); // 45 min before → locked
const inWindow = new Date(scheduled.getTime() - 20 * 60 * 1000); // 20 min before → ready

describe("IngestRevealPanel", () => {
  // T-UX-01 — renders countdown pre-T-30, hides key
  it("shows countdown and hides key before T-30", () => {
    render(
      <IngestRevealPanel
        streamId="s-1"
        scheduledStartAt={scheduled.toISOString()}
        now={preT30}
      />,
    );
    expect(screen.getByTestId("locked-state")).toBeTruthy();
    expect(screen.getByTestId("countdown").textContent).toMatch(/until unlock/);
    expect(screen.queryByTestId("revealed-state")).toBeNull();
    expect(screen.queryByTestId("reveal-button")).toBeNull();
  });

  // T-UX-02 — enables Reveal button at T-30
  it("enables Reveal button inside the T-30 window", () => {
    render(
      <IngestRevealPanel
        streamId="s-1"
        scheduledStartAt={scheduled.toISOString()}
        now={inWindow}
      />,
    );
    const btn = screen.getByTestId("reveal-button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  // T-UX-03 — on reveal, fetches and displays credentials with copy buttons
  it("displays credentials after successful reveal", async () => {
    const fetcher = fixedFetcher(200, {
      rtmps_url: "rtmps://live.cloudflare.com:443/live/",
      stream_key: "live_abcdef",
      srt_url: "srt://live.cloudflare.com:778",
      srt_passkey: "srt_pass",
      revealed_at: new Date().toISOString(),
    });
    render(
      <IngestRevealPanel
        streamId="s-1"
        scheduledStartAt={scheduled.toISOString()}
        now={inWindow}
        fetcher={fetcher}
      />,
    );
    fireEvent.click(screen.getByTestId("reveal-button"));
    await waitFor(() => {
      expect(screen.getByTestId("revealed-state")).toBeTruthy();
    });
    expect(screen.getByTestId("value-stream-key").textContent).toBe("live_abcdef");
    expect(screen.getByTestId("copy-stream-key")).toBeTruthy();
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/streaming/streams/s-1/reveal-ingest",
      expect.objectContaining({ method: "POST" }),
    );
  });

  // T-UX-04 — copy button uses GlassIconButton (has required `label` aria attribute)
  it("copy controls expose accessible labels", async () => {
    const fetcher = fixedFetcher(200, {
      rtmps_url: "u",
      stream_key: "k",
      srt_url: "s",
      srt_passkey: "p",
      revealed_at: new Date().toISOString(),
    });
    render(
      <IngestRevealPanel
        streamId="s-1"
        scheduledStartAt={scheduled.toISOString()}
        now={inWindow}
        fetcher={fetcher}
      />,
    );
    fireEvent.click(screen.getByTestId("reveal-button"));
    await waitFor(() => screen.getByTestId("revealed-state"));
    const copyBtn = screen.getByTestId("copy-stream-key");
    expect(copyBtn.getAttribute("aria-label")).toContain("Copy");
  });

  // T-UX-05 — revealed-at timestamp visible
  it("displays revealed-at timestamp", async () => {
    const now = new Date("2026-05-01T17:45:00.000Z");
    const fetcher = fixedFetcher(200, {
      rtmps_url: "u", stream_key: "k", srt_url: "s", srt_passkey: "p",
      revealed_at: now.toISOString(),
    });
    render(
      <IngestRevealPanel
        streamId="s-1"
        scheduledStartAt={scheduled.toISOString()}
        now={inWindow}
        fetcher={fetcher}
      />,
    );
    fireEvent.click(screen.getByTestId("reveal-button"));
    await waitFor(() => screen.getByTestId("revealed-at"));
    expect(screen.getByTestId("revealed-at").textContent).toContain("Revealed");
  });

  // T-UX-06 — audit link shown only to super-admin
  it("shows audit link only to super-admins", () => {
    const { rerender } = render(
      <IngestRevealPanel
        streamId="s-1"
        scheduledStartAt={scheduled.toISOString()}
        now={inWindow}
      />,
    );
    expect(screen.queryByTestId("audit-link")).toBeNull();
    rerender(
      <IngestRevealPanel
        streamId="s-1"
        scheduledStartAt={scheduled.toISOString()}
        now={inWindow}
        isSuperAdmin
      />,
    );
    expect(screen.getByTestId("audit-link")).toBeTruthy();
  });

  // T-UX-07 — handles 425 Too Early gracefully
  it("handles 425 Too Early from backend", async () => {
    const fetcher = fixedFetcher(425);
    render(
      <IngestRevealPanel
        streamId="s-1"
        scheduledStartAt={scheduled.toISOString()}
        now={inWindow}
        fetcher={fetcher}
      />,
    );
    fireEvent.click(screen.getByTestId("reveal-button"));
    await waitFor(() => screen.getByTestId("error-message"));
    expect(screen.getByTestId("error-message").textContent).toMatch(/cannot be revealed yet/i);
    expect(screen.queryByTestId("revealed-state")).toBeNull();
  });
});
