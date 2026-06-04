/**
 * ReactionsBar tests — story 35-3 R4.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { ReactionsBar } from "../ReactionsBar";

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem(
    "rd:viewer:s1",
    JSON.stringify({
      access_token: "tok",
      refresh_token: "r",
      expires_in: 900,
      token_type: "Bearer",
      saved_at: Date.now(),
    }),
  );
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ReactionsBar", () => {
  it("renders 5 GlassIconButton emoji controls with accessible labels", () => {
    render(<ReactionsBar streamId="s1" />);
    const buttons = screen.getAllByTestId(/^reaction-btn-/);
    expect(buttons.length).toBe(5);
    for (const b of buttons) {
      expect(b.getAttribute("aria-label")).toBeTruthy();
    }
  });

  it("debounces rapid same-kind presses into a single batched POST", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ persisted: 5 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ReactionsBar streamId="s1" />);
    const heart = screen.getByTestId("reaction-btn-heart");
    act(() => {
      for (let i = 0; i < 5; i++) fireEvent.click(heart);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/public\/streams\/s1\/reactions$/);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as {
      entries: { kind: string; count: number }[];
    };
    expect(body.entries.length).toBe(1);
    expect(body.entries[0]).toMatchObject({ kind: "heart", count: 5 });
  });

  it("merges presses across different kinds into one batched POST", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ persisted: 3 }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ReactionsBar streamId="s1" />);
    act(() => {
      fireEvent.click(screen.getByTestId("reaction-btn-heart"));
      fireEvent.click(screen.getByTestId("reaction-btn-thumbs_up"));
      fireEvent.click(screen.getByTestId("reaction-btn-laugh"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as {
      entries: { kind: string; count: number }[];
    };
    expect(body.entries.length).toBe(3);
    expect(body.entries.map((e) => e.kind).sort()).toEqual([
      "heart",
      "laugh",
      "thumbs_up",
    ]);
  });
});
