import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  refreshAuthSessionResult: vi.fn(),
  openPageInChrome: vi.fn(),
  persistAuthTokens: vi.fn(),
  isAndroidWebView: vi.fn(() => false),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => nav.params,
}));

vi.mock("@/lib/auth", () => ({
  getGoogleOAuthStartUrl: () => "/auth/oauth/google",
  getPostLoginPath: () => "/dashboard",
  isAndroidWebView: auth.isAndroidWebView,
  openPageInChrome: auth.openPageInChrome,
  persistAuthTokens: auth.persistAuthTokens,
  refreshAuthSessionResult: auth.refreshAuthSessionResult,
}));

// Pin OAuth availability so these callback-handling tests stay deterministic
// and the Google button always renders (OBS-2 gating is covered separately in
// LoginForm.oauthAvailability.test.tsx).
vi.mock("@/hooks/useOAuthAvailability", () => ({
  useOAuthAvailability: () => ({ enabled: true, loading: false }),
}));

import { LoginForm } from "../LoginForm";

describe("LoginForm Google OAuth callback handling", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    nav.params = new URLSearchParams();
    nav.push.mockReset();
    nav.replace.mockReset();
    auth.refreshAuthSessionResult.mockReset();
    auth.isAndroidWebView.mockReset();
    auth.isAndroidWebView.mockReturnValue(false);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    window.sessionStorage.clear();
  });

  it("routes OAuth MFA challenge to TOTP verification without storing URL tokens", async () => {
    nav.params = new URLSearchParams("mfa_required=1&mfa_token=legacy-url-token");
    window.sessionStorage.setItem("rawdrive_mfa_token", "stale-token");

    render(<LoginForm />);

    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith("/login/mfa");
    });
    expect(window.sessionStorage.getItem("rawdrive_mfa_token")).toBeNull();
    expect(window.sessionStorage.getItem("rawdrive_mfa_token")).not.toBe("legacy-url-token");
    expect(auth.refreshAuthSessionResult).not.toHaveBeenCalled();
  });

  it("refreshes the cookie-backed OAuth session before entering the app", async () => {
    nav.params = new URLSearchParams("authenticated=1");
    auth.refreshAuthSessionResult.mockResolvedValue({ ok: true, accessToken: "access-token" });

    render(<LoginForm />);

    await waitFor(() => {
      expect(auth.refreshAuthSessionResult).toHaveBeenCalled();
      expect(nav.replace).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows a safe error when OAuth session refresh fails", async () => {
    nav.params = new URLSearchParams("authenticated=1");
    auth.refreshAuthSessionResult.mockResolvedValue({ ok: false, reason: "network_error" });

    const { getByRole } = render(<LoginForm />);

    await waitFor(() => {
      expect(getByRole("alert").textContent).toContain("RawDrive couldn't reach the server");
      expect(nav.replace).toHaveBeenCalledWith(
        "/login?error=oauth_refresh_failed&reason=network_error",
      );
    });
  });

  it("uses reason-specific recovery copy for a failed OAuth refresh redirect", () => {
    nav.params = new URLSearchParams("error=oauth_refresh_failed&reason=no_session");

    const { getByRole } = render(<LoginForm />);

    expect(getByRole("alert").textContent).toContain("session cookie was not available");
    expect(getByRole("alert").textContent).toContain("allow cookies");
  });

  it("shows an actionable message when Google OAuth is misconfigured", () => {
    nav.params = new URLSearchParams("error=oauth_config_unavailable");

    const { getByRole } = render(<LoginForm />);

    expect(getByRole("alert").textContent).toContain(
      "Google sign-in is not configured correctly",
    );
    expect(getByRole("alert").textContent).toContain("Use your password");
  });

  it("renders a friendly expired-state message without refreshing", async () => {
    nav.params = new URLSearchParams("error=oauth_state_expired&state=sensitive");

    const { getByRole } = render(<LoginForm />);

    expect(getByRole("alert").textContent).toBe(
      "That Google sign-in link expired. Start again from this page.",
    );
    expect(getByRole("alert").textContent).not.toContain("sensitive");
    expect(auth.refreshAuthSessionResult).not.toHaveBeenCalled();
  });

  it("routes cookie-backed OAuth MFA redirects to TOTP verification", async () => {
    nav.params = new URLSearchParams("mfa_required=1");

    render(<LoginForm />);

    await waitFor(() => {
      expect(nav.replace).toHaveBeenCalledWith("/login/mfa");
    });
  });

  it("shows a redirecting state immediately after starting Google sign-in", () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...window.location, assign } as unknown as Location,
    });

    const { getByRole } = render(<LoginForm />);

    fireEvent.click(getByRole("button", { name: /sign in with google/i }));

    expect(assign).toHaveBeenCalledWith("/auth/oauth/google");
    expect(getByRole("button", { name: /redirecting to google/i })).toBeDisabled();
  });

  it("keeps Google sign-in on the form when the browser is offline", () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...window.location, assign } as unknown as Location,
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    const { getByRole } = render(<LoginForm />);

    fireEvent.click(getByRole("button", { name: /sign in with google/i }));

    expect(assign).not.toHaveBeenCalled();
    expect(getByRole("alert").textContent).toContain("RawDrive couldn't be reached");
  });

  it("uses customer-facing copy for password network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { getByLabelText, getByRole } = render(<LoginForm />);

    fireEvent.change(getByLabelText(/email address/i), {
      target: { value: "photographer@example.com" },
    });
    fireEvent.change(getByLabelText(/password/i), {
      target: { value: "Password123!" },
    });
    fireEvent.click(getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(getByRole("alert").textContent).toContain("RawDrive couldn't be reached");
    });
  });

  it("keeps password sessions alive by navigating without a hard reload", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...window.location, assign } as unknown as Location,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "access-token" }),
      }),
    );

    const { getByLabelText, getByRole } = render(<LoginForm />);

    fireEvent.change(getByLabelText(/email address/i), {
      target: { value: "photographer@example.com" },
    });
    fireEvent.change(getByLabelText(/password/i), {
      target: { value: "Password123!" },
    });
    fireEvent.click(getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(auth.persistAuthTokens).toHaveBeenCalledWith("access-token");
      expect(nav.push).toHaveBeenCalledWith("/dashboard");
    });
    expect(assign).not.toHaveBeenCalled();
  });

  it("announces in-app browser Google recovery instructions", () => {
    auth.isAndroidWebView.mockReturnValue(true);

    const { getByRole } = render(<LoginForm />);

    fireEvent.click(getByRole("button", { name: /sign in with google/i }));

    const recovery = getByRole("status");
    expect(recovery.textContent).toContain("Google sign-in requires Chrome");
    expect(getByRole("button", { name: /sign in with google/i })).toHaveAttribute(
      "aria-describedby",
      "google-webview-recovery",
    );
  });
});
