import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { IngestHealthCard } from "../live/IngestHealthCard";
import { ViewerMetricsCard } from "../live/ViewerMetricsCard";
import { ChatModeratorPanel } from "../live/ChatModeratorPanel";
import { WaitingRoomPreview } from "../live/WaitingRoomPreview";
import { CreditDepletionBanner } from "../live/CreditDepletionBanner";
import { AutoEndModal } from "../live/AutoEndModal";

describe("IngestHealthCard", () => {
  it("renders tier/bitrate/fps fields with live state", () => {
    render(
      <IngestHealthCard
        data={{
          connected: true,
          bitrate_kbps: 4500,
          fps: 30,
          video_codec: "h264",
          audio_codec: "aac",
          last_pushed_at: "2026-04-14T00:00:00Z",
          status: "connected",
        }}
      />,
    );
    expect(screen.getByTestId("ingest-health-card")).toBeTruthy();
    expect(screen.getByText(/4500/)).toBeTruthy();
    expect(screen.getByText(/30/)).toBeTruthy();
    expect(screen.getByTestId("ingest-status").textContent).toMatch(
      /connected/i,
    );
  });

  it("renders degraded / disconnected state visually", () => {
    const { rerender } = render(
      <IngestHealthCard
        data={{
          connected: false,
          bitrate_kbps: 0,
          fps: 0,
          video_codec: "",
          audio_codec: "",
          last_pushed_at: "",
          status: "disconnected",
        }}
      />,
    );
    expect(screen.getByTestId("ingest-status").textContent).toMatch(
      /disconnected/i,
    );
    rerender(
      <IngestHealthCard
        data={{
          connected: true,
          bitrate_kbps: 100,
          fps: 10,
          video_codec: "h264",
          audio_codec: "aac",
          last_pushed_at: "",
          status: "degraded",
        }}
      />,
    );
    expect(screen.getByTestId("ingest-status").textContent).toMatch(
      /degraded/i,
    );
  });
});

describe("ViewerMetricsCard", () => {
  it("renders current/peak/unique counts", () => {
    render(
      <ViewerMetricsCard
        data={{ current: 42, peak: 120, unique: 95, as_of: "" }}
      />,
    );
    expect(screen.getByTestId("viewer-current").textContent).toContain("42");
    expect(screen.getByTestId("viewer-peak").textContent).toContain("120");
    expect(screen.getByTestId("viewer-unique").textContent).toContain("95");
  });
});

describe("ChatModeratorPanel", () => {
  const messages = [
    {
      id: "m1",
      viewer_id: "v1",
      viewer_name: "Alice",
      body: "hello",
      created_at: "",
    },
    {
      id: "m2",
      viewer_id: "v2",
      viewer_name: "Bob",
      body: "hi",
      created_at: "",
    },
  ];

  it("renders message list with moderation buttons", () => {
    render(
      <ChatModeratorPanel
        messages={messages}
        slowModeSeconds={0}
        onModerate={vi.fn()}
        onSetSlowMode={vi.fn()}
      />,
    );
    expect(screen.getByText("hello")).toBeTruthy();
    expect(screen.getByText("hi")).toBeTruthy();
    expect(screen.getAllByLabelText(/delete message/i).length).toBe(2);
    expect(screen.getAllByLabelText(/timeout/i).length).toBe(2);
    expect(screen.getAllByLabelText(/ban/i).length).toBe(2);
  });

  it("submits slow-mode form with new value", () => {
    const onSetSlowMode = vi.fn();
    render(
      <ChatModeratorPanel
        messages={[]}
        slowModeSeconds={0}
        onModerate={vi.fn()}
        onSetSlowMode={onSetSlowMode}
      />,
    );
    const input = screen.getByTestId("slow-mode-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.click(screen.getByTestId("slow-mode-apply"));
    expect(onSetSlowMode).toHaveBeenCalledWith(5);
  });

  it("invokes onModerate with ban action", () => {
    const onModerate = vi.fn();
    render(
      <ChatModeratorPanel
        messages={messages}
        slowModeSeconds={0}
        onModerate={onModerate}
        onSetSlowMode={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByLabelText(/ban/i)[0]);
    expect(onModerate).toHaveBeenCalledWith("m1", "ban", undefined);
  });
});

describe("WaitingRoomPreview", () => {
  it("renders preview thumbnail placeholder with title", () => {
    render(
      <WaitingRoomPreview
        data={{
          title: "Wedding Ceremony",
          scheduled_at: "2026-05-01T10:00:00Z",
          brand_color: "#fff",
        }}
      />,
    );
    expect(screen.getByTestId("waiting-room-preview")).toBeTruthy();
    expect(screen.getByText("Wedding Ceremony")).toBeTruthy();
  });
});

describe("CreditDepletionBanner", () => {
  it("renders nothing at phase ok", () => {
    const { container } = render(
      <CreditDepletionBanner phase="ok" remainingSec={9999} />,
    );
    expect(container.textContent).toBe("");
  });

  it("renders warning variants for warn5 / warn1 / warn30", () => {
    const { rerender } = render(
      <CreditDepletionBanner phase="warn5" remainingSec={300} />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/5/);
    rerender(<CreditDepletionBanner phase="warn1" remainingSec={60} />);
    expect(screen.getByRole("alert").textContent).toMatch(/1/);
    rerender(<CreditDepletionBanner phase="warn30" remainingSec={30} />);
    expect(screen.getByRole("alert").textContent).toMatch(/30/);
  });
});

describe("AutoEndModal", () => {
  it("confirms stream end on click", () => {
    const onConfirm = vi.fn();
    render(
      <AutoEndModal
        phase="grace"
        graceEndsAt={null}
        onConfirmEnd={onConfirm}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("auto-end-confirm"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("does not mount when phase is ok", () => {
    const { container } = render(
      <AutoEndModal
        phase="ok"
        graceEndsAt={null}
        onConfirmEnd={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(container.textContent).toBe("");
  });
});
