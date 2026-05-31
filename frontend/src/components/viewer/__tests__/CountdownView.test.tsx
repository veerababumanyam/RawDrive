import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { CountdownView } from "../CountdownView";

// A fixed far-future ISO so the countdown never elapses during the test run.
const FUTURE_ISO = "2099-01-01T00:00:00.000Z";

describe("CountdownView", () => {
  it("renders the live countdown and timestamp once mounted with a valid future date", () => {
    // @testing-library/react flushes effects synchronously, so after render
    // the mounted gate has already opened and the live view is present.
    render(<CountdownView scheduledAt={FUTURE_ISO} brandName="Studio One" />);

    // Normal countdown path is shown (not the pending fallback).
    expect(screen.getByTestId("viewer-countdown")).toBeTruthy();
    expect(screen.queryByTestId("viewer-countdown-pending")).toBeNull();

    // Brand line preserved.
    expect(screen.getByText("Studio One")).toBeTruthy();

    // Four labelled countdown cells render after mount.
    expect(screen.getByText("Days")).toBeTruthy();
    expect(screen.getByText("Hours")).toBeTruthy();
    expect(screen.getByText("Minutes")).toBeTruthy();
    expect(screen.getByText("Seconds")).toBeTruthy();

    // The locale timestamp line is rendered only after mount.
    expect(screen.getByText(/^Scheduled for /)).toBeTruthy();
  });

  it("renders the calm pending state (not a zeroed countdown) for an invalid/empty date", () => {
    const { container } = render(<CountdownView scheduledAt="" brandName="Studio One" />);

    // Pending fallback shown; normal countdown is NOT shown.
    expect(screen.getByTestId("viewer-countdown-pending")).toBeTruthy();
    expect(screen.queryByTestId("viewer-countdown")).toBeNull();

    // Calm copy, never a fabricated 00:00:00 countdown.
    expect(screen.getByText("Starting soon")).toBeTruthy();
    expect(screen.getByText(/begin shortly/i)).toBeTruthy();

    // No "Scheduled for ..." locale string is emitted.
    expect(container.textContent).not.toContain("Scheduled for");
    // No labelled countdown cells either.
    expect(screen.queryByText("Seconds")).toBeNull();
  });

  it("does not emit a locale 'Scheduled for' string for the invalid-date frame (hydration determinism)", () => {
    // The invalid case never renders a locale-derived timestamp, so its output
    // is deterministic across SSR and client hydration.
    const { container } = render(<CountdownView scheduledAt="not-a-date" />);
    expect(container.textContent).not.toContain("Scheduled for");
    expect(screen.getByTestId("viewer-countdown-pending")).toBeTruthy();
  });
});
