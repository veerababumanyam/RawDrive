import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { PINEntry } from "../PINEntry";

describe("PINEntry", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the PIN input", () => {
    render(<PINEntry streamId="s1" onAuthenticated={vi.fn()} />);
    expect(screen.getByTestId("pin-input")).toBeTruthy();
    expect(screen.getByTestId("pin-submit")).toBeTruthy();
  });

  it("rejects PINs shorter than 4 digits with inline validation", async () => {
    const onAuth = vi.fn();
    render(<PINEntry streamId="s1" onAuthenticated={onAuth} />);
    fireEvent.change(screen.getByTestId("pin-input"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByTestId("pin-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("pin-error").textContent).toMatch(/4/);
    });
    expect(onAuth).not.toHaveBeenCalled();
  });

  it("calls onAuthenticated with token pair on success", async () => {
    const pair = {
      access_token: "a.b.c",
      refresh_token: "r.r.r",
      expires_in: 900,
      token_type: "Bearer" as const,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => pair,
          }) as unknown as Response,
      ),
    );
    const onAuth = vi.fn();
    render(<PINEntry streamId="s1" onAuthenticated={onAuth} />);
    fireEvent.change(screen.getByTestId("pin-input"), {
      target: { value: "1234" },
    });
    fireEvent.click(screen.getByTestId("pin-submit"));
    await waitFor(() => expect(onAuth).toHaveBeenCalledWith(pair));
  });

  it("shows an error on 401 invalid PIN", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 401,
            json: async () => ({ error: "invalid_pin" }),
          }) as unknown as Response,
      ),
    );
    render(<PINEntry streamId="s1" onAuthenticated={vi.fn()} />);
    fireEvent.change(screen.getByTestId("pin-input"), {
      target: { value: "9999" },
    });
    fireEvent.click(screen.getByTestId("pin-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("pin-error").textContent).toMatch(
        /invalid|incorrect/i,
      );
    });
  });
});
