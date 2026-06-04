import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  getPostLoginPath: vi.fn(() => "/dashboard"),
  persistAuthTokens: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
}));

vi.mock("@/lib/auth", () => ({
  getPostLoginPath: auth.getPostLoginPath,
  persistAuthTokens: auth.persistAuthTokens,
}));

import { MFAVerifyForm } from "../MFAVerifyForm";

describe("MFAVerifyForm", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    nav.replace.mockReset();
    auth.getPostLoginPath.mockReset();
    auth.getPostLoginPath.mockReturnValue("/dashboard");
    auth.persistAuthTokens.mockReset();
    window.sessionStorage.clear();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...window.location, assign: vi.fn() } as unknown as Location,
    });
  });

  it("submits only the code for cookie-backed OAuth MFA challenges", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "access-token" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getByLabelText, getByRole } = render(<MFAVerifyForm />);

    fireEvent.change(getByLabelText(/6-digit code/i), {
      target: { value: "123456" },
    });
    fireEvent.click(getByRole("button", { name: /verify & sign in/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/auth/verify-totp"),
        expect.objectContaining({
          credentials: "include",
          method: "POST",
        }),
      );
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ code: "123456" });
    expect(auth.persistAuthTokens).toHaveBeenCalledWith("access-token");
    expect(nav.replace).toHaveBeenCalledWith("/dashboard");
  });

  it("keeps password-login MFA tokens in the request body", async () => {
    window.sessionStorage.setItem("rawdrive_mfa_token", "password-mfa-token");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "invalid code" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getByLabelText, getByRole } = render(<MFAVerifyForm />);

    fireEvent.change(getByLabelText(/6-digit code/i), {
      target: { value: "654321" },
    });
    fireEvent.click(getByRole("button", { name: /verify & sign in/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      mfa_token: "password-mfa-token",
      code: "654321",
    });
    expect(getByRole("alert").textContent).toContain("That code did not match");
  });

  it("shows session-expired recovery copy when no challenge is available", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "mfa_token and code required" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getByLabelText, getByRole } = render(<MFAVerifyForm />);

    fireEvent.change(getByLabelText(/6-digit code/i), {
      target: { value: "123456" },
    });
    fireEvent.click(getByRole("button", { name: /verify & sign in/i }));

    await waitFor(() => {
      expect(getByRole("alert").textContent).toContain(
        "sign-in session expired",
      );
    });
  });
});
