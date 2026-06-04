import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { PreflightPanel } from "../PreflightPanel";

type FetchCall = { url: string; init?: RequestInit };

function buildFetcher(
  handlers: Record<
    string,
    (init?: RequestInit) => Response | Promise<Response>
  >,
) {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const match = Object.keys(handlers).find((k) => url.includes(k));
    if (!match) {
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
        blob: async () => new Blob([]),
        headers: new Headers(),
      } as unknown as Response;
    }
    return handlers[match](init);
  });
  return { fn, calls };
}

function jsonRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)]),
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as Response;
}

const startBody = {
  sessionId: "sess-123",
  rtmpsUrl: "rtmps://test.cloudflare.com/live/",
  rtmpsKey: "test-key",
  expiresAt: new Date(Date.now() + 60000).toISOString(),
};

describe("PreflightPanel", () => {
  beforeEach(() => {
    // Mock URL.createObjectURL for blob download path in jsdom.
    if (!("createObjectURL" in URL)) {
      (URL as unknown as { createObjectURL: () => string }).createObjectURL =
        () => "blob:mock";
    }
    (URL as unknown as { createObjectURL: () => string }).createObjectURL =
      vi.fn(() => "blob:mock");
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL =
      vi.fn();
  });

  it("renders the Start Preflight button initially", () => {
    render(<PreflightPanel streamId="stream-1" />);
    expect(screen.getByTestId("preflight-start")).toBeTruthy();
  });

  it("clicking Start calls /start and shows the bandwidth gauge", async () => {
    const highBandwidthTransport = { uploadProbe: async () => 500 }; // ~80 Mbps
    const { fn } = buildFetcher({
      "/preflight/start": () => jsonRes(200, startBody),
      "/bandwidth": () => jsonRes(200, { accepted: true }),
    });
    render(
      <PreflightPanel
        streamId="stream-1"
        fetcher={fn}
        transport={highBandwidthTransport}
      />,
    );
    fireEvent.click(screen.getByTestId("preflight-start"));
    await waitFor(() => {
      expect(screen.getByTestId("bandwidth-gauge")).toBeTruthy();
    });
    expect(fn).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/streaming/streams/preflight/start"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows poor verdict and downgrade recommendation when bandwidth < 3 Mbps", async () => {
    const lowTransport = { uploadProbe: async () => 20971 }; // ~2 Mbps
    const { fn } = buildFetcher({
      "/preflight/start": () => jsonRes(200, startBody),
      "/bandwidth": () => jsonRes(200, { accepted: true }),
    });
    render(
      <PreflightPanel
        streamId="stream-1"
        fetcher={fn}
        transport={lowTransport}
      />,
    );
    fireEvent.click(screen.getByTestId("preflight-start"));
    await waitFor(() => {
      expect(
        screen.getByTestId("verdict-chip").textContent?.toLowerCase(),
      ).toContain("poor");
    });
    expect(
      screen.getByTestId("recommendations").textContent?.toLowerCase(),
    ).toMatch(/below 3 mbps|upgrade|downgrade/);
  });

  it("clicking Download OBS Profile hits /obs-profile and triggers download", async () => {
    const transport = { uploadProbe: async () => 500 };
    const blobBody = new Blob(["[OBS profile contents]"], {
      type: "text/plain",
    });
    const obsRes = {
      ok: true,
      status: 200,
      blob: async () => blobBody,
      json: async () => ({}),
      headers: new Headers({
        "content-disposition":
          'attachment; filename="rawdrive-obs-1080p60.ini"',
      }),
    } as unknown as Response;
    const { fn } = buildFetcher({
      "/preflight/start": () => jsonRes(200, startBody),
      "/bandwidth": () => jsonRes(200, { accepted: true }),
      "/obs-profile": () => obsRes,
    });
    render(
      <PreflightPanel streamId="stream-1" fetcher={fn} transport={transport} />,
    );
    fireEvent.click(screen.getByTestId("preflight-start"));
    await waitFor(() => screen.getByTestId("download-obs"));
    fireEvent.click(screen.getByTestId("download-obs"));
    await waitFor(() => {
      expect(fn).toHaveBeenCalledWith(
        expect.stringContaining("/obs-profile"),
        expect.anything(),
      );
    });
  });

  it("clicking Run Test Broadcast calls start then stop", async () => {
    const transport = { uploadProbe: async () => 500 };
    const { fn, calls } = buildFetcher({
      "/preflight/start": () => jsonRes(200, startBody),
      "/bandwidth": () => jsonRes(200, { accepted: true }),
      "/test-broadcast/start": () =>
        jsonRes(200, { status: "active", expiresAt: startBody.expiresAt }),
      "/test-broadcast/stop": () => jsonRes(200, { status: "stopped" }),
    });
    render(
      <PreflightPanel streamId="stream-1" fetcher={fn} transport={transport} />,
    );
    fireEvent.click(screen.getByTestId("preflight-start"));
    await waitFor(() => screen.getByTestId("test-broadcast"));
    fireEvent.click(screen.getByTestId("test-broadcast"));
    await waitFor(() => {
      const urls = calls.map((c) => c.url);
      expect(urls.some((u) => u.includes("/test-broadcast/start"))).toBe(true);
      expect(urls.some((u) => u.includes("/test-broadcast/stop"))).toBe(true);
    });
  });
});
