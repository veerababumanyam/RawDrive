import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useOAuthAvailability } from "../useOAuthAvailability";

function mockFetchResolving(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  });
}

describe("useOAuthAvailability", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("starts optimistic (enabled=true, loading=true) before the probe settles", () => {
    // A fetch that never resolves keeps the hook in its initial state.
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

    const { result } = renderHook(() => useOAuthAvailability("http://api.test"));

    expect(result.current.enabled).toBe(true);
    expect(result.current.loading).toBe(true);
  });

  it("disables OAuth when the status endpoint reports enabled=false", async () => {
    global.fetch = mockFetchResolving({ enabled: false }) as unknown as typeof fetch;

    const { result } = renderHook(() => useOAuthAvailability("http://api.test"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.enabled).toBe(false);
  });

  it("keeps OAuth enabled when the status endpoint reports enabled=true", async () => {
    global.fetch = mockFetchResolving({ enabled: true }) as unknown as typeof fetch;

    const { result } = renderHook(() => useOAuthAvailability("http://api.test"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.enabled).toBe(true);
  });

  it("stays optimistic (enabled stays true) when the probe rejects", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const { result } = renderHook(() => useOAuthAvailability("http://api.test"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.enabled).toBe(true);
  });

  it("stays optimistic when the response is not ok", async () => {
    global.fetch = mockFetchResolving({ enabled: false }, false) as unknown as typeof fetch;

    const { result } = renderHook(() => useOAuthAvailability("http://api.test"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.enabled).toBe(true);
  });

  it("calls the google status endpoint relative to the provided apiBase", async () => {
    const fetchMock = mockFetchResolving({ enabled: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderHook(() => useOAuthAvailability("http://api.test"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://api.test/auth/oauth/google/status",
    );
  });

  it("does not throw when fetch is undefined (SSR-safe)", async () => {
    // @ts-expect-error — deliberately removing fetch to mimic an SSR environment
    global.fetch = undefined;

    const { result } = renderHook(() => useOAuthAvailability("http://api.test"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.enabled).toBe(true);
  });
});
