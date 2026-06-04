import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { ReplayPlayer } from "../ReplayPlayer";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("ReplayPlayer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a video element with the signed playback URL when allowed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          playback_url: "https://cf.example/signed.m3u8",
          expires_at: "2099-01-01T00:00:00Z",
          banner_flag: false,
        }),
      ),
    );

    render(<ReplayPlayer shortlink="abc" token="vjwt" />);

    const video = await waitFor(() => screen.getByTestId("replay-video"));
    expect(video.tagName).toBe("VIDEO");
    expect(video.getAttribute("src")).toBe("https://cf.example/signed.m3u8");
    expect(video.hasAttribute("autoplay")).toBe(false);
    expect(screen.queryByTestId("expiry-banner")).toBeNull();
  });

  it("mounts ExpiryBanner when banner_flag is true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          playback_url: "https://cf.example/signed.m3u8",
          expires_at: "2026-04-16T00:00:00Z",
          banner_flag: true,
        }),
      ),
    );

    render(<ReplayPlayer shortlink="abc" token="vjwt" />);

    await waitFor(() => screen.getByTestId("replay-video"));
    expect(screen.getByTestId("expiry-banner")).toBeTruthy();
  });

  it("shows the replay-expired UI on 410", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { error: "replay_expired", expires_at: "2026-04-10T00:00:00Z" },
          410,
        ),
      ),
    );

    render(<ReplayPlayer shortlink="abc" token="vjwt" />);

    await waitFor(() => {
      expect(screen.getByTestId("replay-expired")).toBeTruthy();
    });
    expect(screen.queryByTestId("replay-video")).toBeNull();
  });
});
