import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { InviteGenerator } from "../InviteGenerator";

function mockFetchOK() {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        code: "aB3kQ9mZ",
        short_url: "https://rawdrive.live/s/aB3kQ9mZ",
        qr_payload: "https://rawdrive.live/s/aB3kQ9mZ?src=qr",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  ) as unknown as typeof fetch;
}

describe("InviteGenerator", () => {
  beforeEach(() => {
    // Clipboard API lives on the prototype in jsdom; re-stub per-test.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => undefined) },
      configurable: true,
    });
  });

  it("renders the Generate button and no code yet", () => {
    render(<InviteGenerator streamId="stream-1" fetcher={mockFetchOK()} />);
    expect(screen.getByTestId("generate-button")).toBeTruthy();
    expect(screen.queryByTestId("invite-code")).toBeNull();
  });

  it("clicking Generate calls POST /api/v1/streaming/streams/{id}/invites and shows code + short URL + QR", async () => {
    const fetcher = mockFetchOK();
    render(<InviteGenerator streamId="stream-1" fetcher={fetcher} />);

    fireEvent.click(screen.getByTestId("generate-button"));

    await waitFor(() => expect(screen.getByTestId("invite-code")).toBeTruthy());

    const call = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(call[0])).toBe("/api/v1/streaming/streams/stream-1/invites");
    expect((call[1] as RequestInit).method).toBe("POST");

    expect(screen.getByTestId("invite-code").textContent).toContain("aB3kQ9mZ");
    expect(screen.getByTestId("invite-short-url").textContent).toContain(
      "https://rawdrive.live/s/aB3kQ9mZ",
    );
    expect(screen.getByTestId("invite-qr")).toBeTruthy();
  });

  it("copy button writes the short URL to the clipboard", async () => {
    render(<InviteGenerator streamId="stream-1" fetcher={mockFetchOK()} />);

    fireEvent.click(screen.getByTestId("generate-button"));
    await waitFor(() => expect(screen.getByTestId("copy-button")).toBeTruthy());

    fireEvent.click(screen.getByTestId("copy-button"));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "https://rawdrive.live/s/aB3kQ9mZ",
      ),
    );
  });
});
