import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useCreditBalance } from "../useCreditBalance";

function mockBalance(partial: Partial<{ balance_minutes: number; balance_paise: number; low_balance: boolean }> = {}) {
  return {
    workspace_id: "ws-1",
    balance_paise: 100000,
    balance_minutes: 120,
    last_entry_at: "2026-04-14T00:00:00.000Z",
    low_balance: false,
    ...partial,
  };
}

// Wait for a predicate by flushing microtasks and advancing fake timers slightly.
async function flushAsync() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("useCreditBalance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fetches /api/v1/credits/balance on mount and exposes balance", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mockBalance(),
    }) as unknown as Response);
    vi.stubGlobal("fetch", fetcher);

    const { result } = renderHook(() => useCreditBalance());

    await flushAsync();
    expect(result.current.balance?.balanceMinutes).toBe(120);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/credits/balance"),
      expect.anything(),
    );
  });

  it("polls at 60s baseline by default", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mockBalance(),
    }) as unknown as Response);
    vi.stubGlobal("fetch", fetcher);

    renderHook(() => useCreditBalance());
    await flushAsync();
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("elevates polling to 5s when intervalMs=5000", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mockBalance(),
    }) as unknown as Response);
    vi.stubGlobal("fetch", fetcher);

    renderHook(() => useCreditBalance({ intervalMs: 5000 }));

    await flushAsync();
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("propagates low_balance flag on the returned balance", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mockBalance({ balance_minutes: 10, low_balance: true }),
    }) as unknown as Response);
    vi.stubGlobal("fetch", fetcher);

    const { result } = renderHook(() => useCreditBalance());
    await flushAsync();
    expect(result.current.balance?.lowBalance).toBe(true);
    expect(result.current.balance?.balanceMinutes).toBe(10);
  });

  it("clears the interval on unmount", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mockBalance(),
    }) as unknown as Response);
    vi.stubGlobal("fetch", fetcher);

    const { unmount } = renderHook(() => useCreditBalance());
    await flushAsync();
    expect(fetcher).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("pauses polling when paused=true", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mockBalance(),
    }) as unknown as Response);
    vi.stubGlobal("fetch", fetcher);

    renderHook(() => useCreditBalance({ paused: true }));
    await flushAsync();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(0);
  });
});
