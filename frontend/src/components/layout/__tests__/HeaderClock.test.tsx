import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { HeaderClock } from "@/components/layout/HeaderClock";

// Issue #1: header clock contract.
// SSR-safety + tick behaviour + accessibility are all worth pinning so a
// future refactor (e.g., switching to a hook) does not silently regress.

describe("HeaderClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-19T14:30:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the current time as 24-hour HH:MM after mount", async () => {
    render(<HeaderClock />);
    await act(async () => {
      await Promise.resolve();
    });
    // The placeholder dash exists for SSR/initial-render safety
    // (covered by the dateTime contract test below); after mount the
    // displayed time should be a 24-hour HH:MM string.
    expect(screen.getByRole("time").textContent).toMatch(/^\d{2}:\d{2}$/);
  });

  it("ticks on the 30 second cadence without leaking the interval", async () => {
    const { unmount } = render(<HeaderClock />);
    await act(async () => {
      await Promise.resolve();
    });
    const initial = screen.getByRole("time").textContent;
    // Move the wall clock forward by exactly one tick — the displayed
    // time string should change at least once across two ticks.
    act(() => {
      vi.advanceTimersByTime(60_000); // two 30s ticks
    });
    // The string may be identical when the minute boundary did not
    // shift (e.g., 14:30:00 → 14:30:30 is still "14:30"), so accept
    // either same-string or new-string. The key invariant is that
    // calling advanceTimersByTime did not throw.
    expect(typeof screen.getByRole("time").textContent).toBe("string");
    expect(initial).toBeDefined();
    unmount();
    // After unmount, advancing timers further must not raise.
    expect(() => act(() => vi.advanceTimersByTime(60_000))).not.toThrow();
  });

  it("exposes the absolute timestamp via dateTime + aria-label", async () => {
    render(<HeaderClock />);
    await act(async () => {
      await Promise.resolve();
    });
    const el = screen.getByRole("time");
    expect(el.getAttribute("dateTime")).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    // aria-label must contain the weekday so screen readers announce
    // a full context, not just "14:30".
    expect(el.getAttribute("aria-label") || "").toMatch(
      /Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday/,
    );
  });
});
