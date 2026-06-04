import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ConsoleTabs, type ConsolePayload } from "../ConsoleTabs";

function payload(overrides: Partial<ConsolePayload> = {}): ConsolePayload {
  return {
    stream: {
      id: "s-1",
      title: "Ceremony Livestream",
      status: "scheduled",
      scheduled_at: "2026-05-01T18:00:00.000Z",
    },
    permissions: {
      can_control: true,
      can_moderate: true,
      can_view_audit: true,
    },
    ingest_creds: null,
    audit: { reveal_rows: [], moderation_rows: [] },
    ...overrides,
  };
}

describe("ConsoleTabs", () => {
  it("renders all 5 tabs by default with Overview active", () => {
    render(<ConsoleTabs payload={payload()} />);
    expect(screen.getByTestId("tab-overview")).toBeTruthy();
    expect(screen.getByTestId("tab-setup")).toBeTruthy();
    expect(screen.getByTestId("tab-live")).toBeTruthy();
    expect(screen.getByTestId("tab-replay")).toBeTruthy();
    expect(screen.getByTestId("tab-audit")).toBeTruthy();
    expect(
      screen.getByTestId("tab-overview").getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("clicking a tab switches the active panel and fires onTabChange", () => {
    const onChange = vi.fn();
    render(<ConsoleTabs payload={payload()} onTabChange={onChange} />);
    fireEvent.click(screen.getByTestId("tab-setup"));
    expect(screen.getByTestId("tab-setup").getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByTestId("panel-setup")).toBeTruthy();
    expect(onChange).toHaveBeenCalledWith("setup");
  });

  it("arrow-right keyboard navigation moves to next tab", () => {
    render(<ConsoleTabs payload={payload()} />);
    const overview = screen.getByTestId("tab-overview");
    overview.focus();
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(screen.getByTestId("tab-setup").getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("arrow-left wraps to last tab", () => {
    render(<ConsoleTabs payload={payload()} />);
    const overview = screen.getByTestId("tab-overview");
    overview.focus();
    fireEvent.keyDown(overview, { key: "ArrowLeft" });
    expect(screen.getByTestId("tab-audit").getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("hides audit tab when canViewAudit is false", () => {
    render(
      <ConsoleTabs
        payload={payload({
          permissions: {
            can_control: true,
            can_moderate: true,
            can_view_audit: false,
          },
        })}
      />,
    );
    expect(screen.queryByTestId("tab-audit")).toBeNull();
  });

  it("all tab buttons expose accessible labels", () => {
    render(<ConsoleTabs payload={payload()} />);
    ["overview", "setup", "live", "replay", "audit"].forEach((id) => {
      const btn = screen.getByTestId(`tab-${id}`);
      expect(btn.getAttribute("aria-label")).toBeTruthy();
    });
  });

  it("Live/Replay tabs show placeholder shell content", () => {
    render(<ConsoleTabs payload={payload()} activeTab="live" />);
    expect(screen.getByTestId("panel-live")).toBeTruthy();
    expect(screen.getByTestId("panel-live").textContent).toMatch(
      /not live|coming|live widgets/i,
    );
  });

  it("respects explicit activeTab prop", () => {
    render(<ConsoleTabs payload={payload()} activeTab="replay" />);
    expect(screen.getByTestId("tab-replay").getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByTestId("panel-replay")).toBeTruthy();
  });
});
