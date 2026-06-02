import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    nav.params = new URLSearchParams("email=photo%40rawdrive.test");
    nav.push.mockReset();
    auth.persistAuthTokens.mockReset();
  });

  it("resends the registration activation OTP for the current email", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: "If an unverified account exists for this email, a new activation code has been sent.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getByRole } = render(<ActivateForm />);

    fireEvent.click(getByRole("button", { name: /send new activation code/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/auth/resend-otp",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "photo@rawdrive.test" }),
        }),
      );
    });
    expect(getByRole("status").textContent).toContain("new activation code has been sent");
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
          body: JSON.stringify({ email: "photo@rawdrive.test", code: "123456" }),
        }),
      );
      expect(auth.persistAuthTokens).toHaveBeenCalledWith("access-token");
      expect(nav.push).toHaveBeenCalledWith("/dashboard");
    });
  });
});
