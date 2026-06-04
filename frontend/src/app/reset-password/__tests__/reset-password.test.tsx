import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Public-pages review 2026-06-04, P0 #2 (design-token compliance), #3 (12-char
// password requirement shown before submit), #5 (error tied to inputs).

const nav = vi.hoisted(() => ({ push: vi.fn(), params: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => nav.params,
}));

vi.mock("@/lib/api/auth", () => ({
  resetPassword: vi.fn().mockResolvedValue(undefined),
}));

import { resetPassword } from "@/lib/api/auth";
import ResetPasswordPage from "../page";

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    nav.push.mockReset();
    vi.mocked(resetPassword).mockReset().mockResolvedValue(undefined);
  });

  it("uses design-token inputs/buttons and shows the 12-char requirement", () => {
    const { container } = render(<ResetPasswordPage />);

    const inputs = Array.from(container.querySelectorAll("input"));
    expect(inputs.length).toBeGreaterThan(0);
    inputs.forEach((input) => {
      expect(input.className).toContain("input-base");
      expect(input.className).not.toMatch(/rounded-md/);
    });

    expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: /reset password/i });
    expect(submit.className).toContain("btn-primary");
    expect(container.innerHTML).not.toMatch(/shadow-lg/);
    expect(container.innerHTML).not.toMatch(/bg-accent/);
  });

  it("declares minLength 12 on both password fields and links the hint", () => {
    const { container } = render(<ResetPasswordPage />);
    const pw = container.querySelector("#reset-password") as HTMLInputElement;
    const confirm = container.querySelector(
      "#reset-confirm",
    ) as HTMLInputElement;
    expect(pw.getAttribute("minlength")).toBe("12");
    expect(confirm.getAttribute("minlength")).toBe("12");
    expect(pw.getAttribute("aria-describedby")).toContain("reset-password-hint");
  });

  it("ties the error to the credential inputs on password mismatch", async () => {
    const { container } = render(<ResetPasswordPage />);

    // Fill every required field so native constraint validation does not block
    // the submit; only the two passwords intentionally differ.
    fireEvent.change(container.querySelector("#reset-email")!, {
      target: { value: "user@example.com" },
    });
    fireEvent.change(container.querySelector("#reset-otp")!, {
      target: { value: "123456" },
    });
    fireEvent.change(container.querySelector("#reset-password")!, {
      target: { value: "LongPassword12!" },
    });
    fireEvent.change(container.querySelector("#reset-confirm")!, {
      target: { value: "DifferentPass12!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("id", "reset-error");

    const pw = container.querySelector("#reset-password") as HTMLInputElement;
    expect(pw).toHaveAttribute("aria-invalid", "true");
    expect(pw.getAttribute("aria-describedby")).toContain("reset-error");

    // Client-side mismatch must short-circuit before the network call.
    expect(resetPassword).not.toHaveBeenCalled();
  });
});
