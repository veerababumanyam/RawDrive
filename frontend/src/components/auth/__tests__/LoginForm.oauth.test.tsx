import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  refreshAuthSession: vi.fn(),
  openPageInChrome: vi.fn(),
  persistAuthTokens: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => nav.params,
}));

vi.mock("@/lib/auth", () => ({
  getGoogleOAuthStartUrl: () => "/auth/oauth/google",
  getPostLoginPath: () => "/dashboard",
  isAndroidWebView: () => false,
  openPageInChrome: auth.openPageInChrome,
  persistAuthTokens: auth.persistAuthTokens,
  refreshAuthSession: auth.refreshAuthSession,
}));

import { LoginForm } from "../LoginForm";

describe("LoginForm Google OAuth callback handling", () => {
  beforeEach(() => {
    nav.params = new URLSearchParams();
    nav.push.mockReset();
    nav.replace.mockReset();
    auth.refreshAuthSession.mockReset();
    window.sessionStorage.clear();
  });

  it("stores an OAuth MFA challenge token and routes to TOTP verification", async () => {
    nav.params = new URLSearchParams("mfa_required=1&mfa_token=challenge-token");

    render(<LoginForm />);

    await waitFor(() => {
      expect(window.sessionStorage.getItem("rawdrive_mfa_token")).toBe("challenge-token");
    });
    expect(nav.replace).toHaveBeenCalledWith("/login/mfa");
    expect(auth.refreshAuthSession).not.toHaveBeenCalled();
  });

  it("refreshes the cookie-backed OAuth session before entering the app", async () => {
    nav.params = new URLSearchParams("authenticated=1");
    auth.refreshAuthSession.mockResolvedValue("access-token");

    render(<LoginForm />);

    await waitFor(() => {
      expect(auth.refreshAuthSession).toHaveBeenCalled();
      expect(nav.replace).toHaveBeenCalledWith("/dashboard");
    });
  });
});
