import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => nav.params,
}));

vi.mock("@/lib/auth", () => ({
  getGoogleOAuthStartUrl: () => "/auth/oauth/google",
  getPostLoginPath: () => "/dashboard",
  isAndroidWebView: () => false,
  openPageInChrome: vi.fn(),
  persistAuthTokens: vi.fn(),
  refreshAuthSession: vi.fn(),
}));

// OBS-2: backend OAuth is unconfigured — the availability probe resolves to
// { enabled: false }, so the Google button must NOT render.
vi.mock("@/hooks/useOAuthAvailability", () => ({
  useOAuthAvailability: () => ({ enabled: false, loading: false }),
}));

import { LoginForm } from "../LoginForm";

describe("LoginForm OAuth availability gating", () => {
  beforeEach(() => {
    nav.params = new URLSearchParams();
    nav.push.mockReset();
    nav.replace.mockReset();
    window.sessionStorage.clear();
  });

  it("hides the Google sign-in button when OAuth is unavailable", () => {
    render(<LoginForm />);

    expect(
      screen.queryByRole("button", { name: /sign in with google/i }),
    ).not.toBeInTheDocument();
  });

  it("still renders the password login form when OAuth is unavailable", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.getByText(/enter your details to access your studio/i),
    ).toBeInTheDocument();
  });

  it("does not render an orphan OR divider when OAuth is unavailable", () => {
    render(<LoginForm />);

    expect(screen.queryByText("OR")).not.toBeInTheDocument();
  });
});
