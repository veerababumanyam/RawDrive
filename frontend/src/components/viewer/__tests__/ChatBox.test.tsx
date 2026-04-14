/**
 * ChatBox tests — story 35-3 R4.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { ChatBox } from "../ChatBox";

const sampleMessages = [
  { id: "m1", viewer_id: "v1", viewer_name: "Aki", body: "hello", created_at: "x" },
  { id: "m2", viewer_id: "v2", viewer_name: "Bo", body: "hi back", created_at: "x" },
];

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem(
    "rd:viewer:s1",
    JSON.stringify({ access_token: "tok", refresh_token: "r", expires_in: 900, token_type: "Bearer", saved_at: Date.now() }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ChatBox", () => {
  it("renders the messages list", () => {
    render(<ChatBox streamId="s1" messages={sampleMessages} />);
    expect(screen.getByText("hello")).toBeTruthy();
    expect(screen.getByText("hi back")).toBeTruthy();
  });

  it("disables submit when input exceeds 500 chars and shows count", () => {
    render(<ChatBox streamId="s1" messages={[]} />);
    const input = screen.getByTestId("chat-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "x".repeat(501) } });
    const submit = screen.getByTestId("chat-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByTestId("chat-charcount").textContent).toMatch(/501/);
  });

  it("POSTs to the backend on submit and clears input", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "new", body: "yo", viewer_id: "v", viewer_name: "n", created_at: "x" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatBox streamId="s1" messages={[]} />);
    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "yo" } });
    fireEvent.click(screen.getByTestId("chat-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/public\/streams\/s1\/chat$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ body: "yo" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    await waitFor(() =>
      expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).value).toBe(""),
    );
  });

  it("shows server-driven Retry-After countdown on 429 slow-mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "slow_mode", retry_after: 5 }), {
        status: 429,
        headers: { "content-type": "application/json", "Retry-After": "5" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatBox streamId="s1" messages={[]} />);
    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "spammy" } });
    fireEvent.click(screen.getByTestId("chat-submit"));

    await waitFor(() => expect(screen.getByTestId("chat-slowmode").textContent).toMatch(/5/));
    expect((screen.getByTestId("chat-submit") as HTMLButtonElement).disabled).toBe(true);

    // Real-timer countdown — wait ~2.5s and confirm it ticked down.
    await waitFor(
      () => {
        const t = screen.getByTestId("chat-slowmode").textContent ?? "";
        const n = Number((t.match(/(\d+)s/) ?? ["", "5"])[1]);
        expect(n).toBeLessThan(5);
      },
      { timeout: 4000, interval: 100 },
    );
  });

  it("renders a reconnecting banner only when connectionState='reconnecting'", () => {
    const { rerender, queryByTestId } = render(
      <ChatBox streamId="s1" messages={[]} connectionState="open" />,
    );
    expect(queryByTestId("chat-reconnecting")).toBeNull();
    rerender(<ChatBox streamId="s1" messages={[]} connectionState="reconnecting" />);
    expect(queryByTestId("chat-reconnecting")).not.toBeNull();
    rerender(<ChatBox streamId="s1" messages={[]} connectionState="open" />);
    expect(queryByTestId("chat-reconnecting")).toBeNull();
  });

  it("shows banned state on 403 and disables composer permanently", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "viewer_banned" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatBox streamId="s1" messages={[]} />);
    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("chat-submit"));

    await waitFor(() => expect(screen.getByTestId("chat-banned")).toBeTruthy());
    expect((screen.getByTestId("chat-submit") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).disabled).toBe(true);
  });
});
