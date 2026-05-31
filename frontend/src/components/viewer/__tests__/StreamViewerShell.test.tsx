import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { StreamViewerShell } from "../StreamViewerShell";

const base = {
  streamId: "s1",
  brand: { display_name: "Studio One" },
  scheduled_at: "2099-01-01T00:00:00.000Z",
  access_level: "link" as const,
};

describe("StreamViewerShell sub-view routing", () => {
  it("renders Countdown for scheduled state", () => {
    render(<StreamViewerShell streamId="s1" initialState="scheduled" initialPayload={base} />);
    expect(screen.getByTestId("viewer-countdown")).toBeTruthy();
  });

  it("renders the pending state (not a zeroed countdown) for scheduled state with no scheduled_at", () => {
    const noSchedule = { ...base, scheduled_at: undefined };
    render(
      <StreamViewerShell streamId="s1" initialState="scheduled" initialPayload={noSchedule} />,
    );
    expect(screen.getByTestId("viewer-countdown-pending")).toBeTruthy();
    expect(screen.queryByTestId("viewer-countdown")).toBeNull();
  });

  it("renders WaitingRoom for waiting state", () => {
    render(<StreamViewerShell streamId="s1" initialState="waiting_room" initialPayload={base} />);
    expect(screen.getByTestId("viewer-waiting-room")).toBeTruthy();
  });

  it("renders LivePlayer for live state with playback_url", () => {
    render(
      <StreamViewerShell
        streamId="s1"
        initialState="live"
        initialPayload={{ ...base, playback_url: "https://cf.example/stream.m3u8" }}
      />,
    );
    expect(screen.getByTestId("viewer-live-player")).toBeTruthy();
  });

  it("renders ReplayPlayer for replay state", () => {
    render(
      <StreamViewerShell
        streamId="s1"
        initialState="replay"
        initialPayload={{ ...base, playback_url: "https://cf.example/replay.m3u8" }}
      />,
    );
    expect(screen.getByTestId("viewer-replay-player")).toBeTruthy();
  });

  it("renders Ended view for ended state", () => {
    render(<StreamViewerShell streamId="s1" initialState="ended" initialPayload={base} />);
    expect(screen.getByTestId("viewer-ended")).toBeTruthy();
  });
});
