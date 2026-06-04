import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  params: new URLSearchParams("email=photo%40rawdrive.test"),
  push: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  persistAuthTokens: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => nav.params,
}));

vi.mock("@/lib/auth", () => ({
  getPostLoginPath: () => "/dashboard",
  persistAuthTokens: auth.persistAuthTokens,
}));

import { ActivateForm } from "../ActivateForm";

describe("ActivateForm", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    nav.params = new URLSearchParams("email=photo%40rawdrive.test");
    nav.push.mockReset();
    auth.persistAuthTokens.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resends the registration activation OTP for the current email and starts a cooldown", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getByLabelText, getByRole } = render(<ActivateForm />);

    fireEvent.change(getByLabelText(/activation code/i), {
      target: { value: "123456" },
    });
    await act(async () => {
      fireEvent.click(
        getByRole("button", { name: /send new activation code/i }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/resend-otp",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "photo@rawdrive.test" }),
      }),
    );
    expect(getByRole("status").textContent).toContain("Use the newest code");
    expect(getByLabelText(/activation code/i)).toHaveValue("");
    expect(
      getByRole("button", { name: /send new code in 30s/i }),
    ).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(
      getByRole("button", { name: /send new activation code/i }),
    ).not.toBeDisabled();
  });

  it("activates the account with a valid OTP and stores the access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "access-token" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getByLabelText, getByRole } = render(<ActivateForm />);

    fireEvent.change(getByLabelText(/activation code/i), {
      target: { value: "123456" },
    });
    fireEvent.click(getByRole("button", { name: /verify & activate/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/auth/verify-otp",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            email: "photo@rawdrive.test",
            code: "123456",
          }),
        }),
      );
      expect(auth.persistAuthTokens).toHaveBeenCalledWith("access-token");
      expect(nav.push).toHaveBeenCalledWith("/dashboard");
    });
  });
});
