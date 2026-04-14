import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

import { ViewerCount } from "../ViewerCount";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("ViewerCount", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 20 });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders current viewer count from the API", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ current: 42, as_of: "2026-04-14T10:00:00Z" })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ViewerCount shortlink="abc" token="vjwt" />);

    await waitFor(() => {
      expect(screen.getByTestId("viewer-count-value").textContent).toMatch(/42/);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/api/v1/public/streams/abc/viewer-count");
  });

  it("polls every 5s and updates the count", async () => {
    let n = 1;
    const fetchMock = vi.fn(async () =>
      jsonResponse({ current: n++, as_of: "2026-04-14T10:00:00Z" })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ViewerCount shortlink="abc" token="vjwt" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("handles 404 without throwing and surfaces error state", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: "not_found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    render(<ViewerCount shortlink="missing" token="vjwt" />);

    await waitFor(() => {
      expect(screen.getByTestId("viewer-count")).toHaveAttribute("data-state", "error");
    });
  });

  it("pauses polling while the document is hidden", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ current: 7, as_of: "2026-04-14T10:00:00Z" })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ViewerCount shortlink="abc" token="vjwt" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
