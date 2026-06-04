import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Public-pages review 2026-06-04, P0 #3: registration must surface the unified
// 12-char password requirement under the field, before submit.

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => nav.params,
}));

vi.mock("@/hooks/useOAuthAvailability", () => ({
  useOAuthAvailability: () => ({ enabled: false, loading: false }),
}));

import { RegisterForm } from "../RegisterForm";

describe("RegisterForm password requirement", () => {
  it("shows the 12-character requirement before submit and links it to the field", () => {
    render(<RegisterForm />);

    const hint = screen.getByText(/at least 12 characters/i);
    expect(hint).toBeInTheDocument();
    expect(hint).toHaveAttribute("id", "register-password-hint");

    const password = document.getElementById(
      "register-password",
    ) as HTMLInputElement;
    expect(password.getAttribute("aria-describedby")).toContain(
      "register-password-hint",
    );
  });
});
