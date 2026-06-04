import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Public-pages review 2026-06-04, P0 #2 (design-token compliance) + #5 (error
// messages programmatically tied to inputs).

const nav = vi.hoisted(() => ({ push: vi.fn(), params: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => nav.params,
}));

vi.mock("@/lib/api/auth", () => ({
  requestPasswordReset: vi.fn().mockResolvedValue(undefined),
}));

import { requestPasswordReset } from "@/lib/api/auth";
import ForgotPasswordPage from "../page";

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    nav.push.mockReset();
    vi.mocked(requestPasswordReset).mockReset().mockResolvedValue(undefined);
  });

  it("builds the email field and buttons from design tokens (no raw primitives)", () => {
    const { container } = render(<ForgotPasswordPage />);

    const input = container.querySelector("#forgot-email") as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.className).toContain("input-base");
    expect(input.className).not.toMatch(/rounded-md/);
    expect(input.className).not.toMatch(/\bbg-surface\b/);

    const submit = screen.getByRole("button", { name: /send reset code/i });
    expect(submit.className).toContain("btn-primary");
    expect(submit.className).not.toMatch(/bg-accent/);

    // No Tailwind primitive shadow on the card.
    expect(container.innerHTML).not.toMatch(/shadow-lg/);
  });

  it("ties the error message to the email input when submission fails", async () => {
    vi.mocked(requestPasswordReset).mockRejectedValueOnce(
      new Error("Network down"),
    );
    render(<ForgotPasswordPage />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send reset code/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("id", "forgot-email-error");
    expect(input).toHaveAttribute("aria-describedby", "forgot-email-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
