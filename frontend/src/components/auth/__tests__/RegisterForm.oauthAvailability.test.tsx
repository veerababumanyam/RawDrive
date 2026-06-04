import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
}));

const oauthAvailability = vi.hoisted(() => ({
  enabled: true,
  loading: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => nav.params,
}));

vi.mock("@/hooks/useOAuthAvailability", () => ({
  useOAuthAvailability: () => ({
    enabled: oauthAvailability.enabled,
    loading: oauthAvailability.loading,
  }),
}));

import { RegisterForm } from "../RegisterForm";

describe("RegisterForm OAuth availability", () => {
  beforeEach(() => {
    nav.params = new URLSearchParams();
    nav.push.mockReset();
    vi.restoreAllMocks();
    oauthAvailability.enabled = true;
    oauthAvailability.loading = false;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  it("keeps Google signup visible and only shows unavailable copy after click", () => {
    oauthAvailability.enabled = false;
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...window.location, assign } as unknown as Location,
    });

    const { getByRole, getByText, queryByText } = render(<RegisterForm />);

    const button = getByRole("button", { name: /continue with google/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toHaveAttribute("aria-disabled", "true");
    expect(
      queryByText(/google sign-up is temporarily unavailable/i),
    ).not.toBeInTheDocument();
    expect(getByText(/or sign up with email/i)).toBeInTheDocument();

    fireEvent.click(button);

    expect(assign).not.toHaveBeenCalled();
    expect(getByRole("alert").textContent).toContain(
      "Google sign-up is temporarily unavailable",
    );
  });

  it("shows a friendly offline error instead of navigating to Google", () => {
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

    const { getByRole } = render(<RegisterForm />);

    fireEvent.click(getByRole("button", { name: /continue with google/i }));

    expect(assign).not.toHaveBeenCalled();
    expect(getByRole("alert").textContent).toContain(
      "RawDrive couldn't be reached",
    );
  });

  it("surfaces duplicate registration errors from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "email already registered" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const { getByLabelText, getByRole } = render(<RegisterForm />);

    fireEvent.change(getByLabelText(/full name/i), {
      target: { value: "Duplicate User" },
    });
    fireEvent.change(getByLabelText(/email address/i), {
      target: { value: "duplicate@example.test" },
    });
    fireEvent.change(getByLabelText(/phone number/i), {
      target: { value: "+919876543210" },
    });
    fireEvent.change(getByLabelText(/^password/i), {
      target: { value: "RawDrive123!" },
    });
    fireEvent.click(getByLabelText(/i accept/i));
    fireEvent.click(getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(getByRole("alert").textContent).toContain(
        "email already registered",
      );
    });
    expect(getByRole("link", { name: /activate account/i })).toHaveAttribute(
      "href",
      "/activate?email=duplicate%40example.test",
    );
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("shows a clear registration throttle message for text rate-limit responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("Too Many Requests\n", {
          status: 429,
          headers: { "content-type": "text/plain" },
        }),
      ),
    );

    const { getByLabelText, getByRole } = render(<RegisterForm />);

    fireEvent.change(getByLabelText(/full name/i), {
      target: { value: "Throttled User" },
    });
    fireEvent.change(getByLabelText(/email address/i), {
      target: { value: "throttled@example.test" },
    });
    fireEvent.change(getByLabelText(/phone number/i), {
      target: { value: "+919876543211" },
    });
    fireEvent.change(getByLabelText(/^password/i), {
      target: { value: "RawDrive123!" },
    });
    fireEvent.click(getByLabelText(/i accept/i));
    fireEvent.click(getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(getByRole("alert").textContent).toContain(
        "Too many registration attempts",
      );
    });
    expect(nav.push).not.toHaveBeenCalled();
  });
});
