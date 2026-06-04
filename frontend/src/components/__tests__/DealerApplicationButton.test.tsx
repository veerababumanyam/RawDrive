import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Public-pages review 2026-06-04, P0 #4: project rule is named exports only.
vi.mock("../DealerApplicationModal", () => ({
  default: () => null,
}));

import { DealerApplicationButton } from "../DealerApplicationButton";

describe("DealerApplicationButton", () => {
  it("is a named export", () => {
    expect(typeof DealerApplicationButton).toBe("function");
  });

  it("renders the partner-application CTA", () => {
    render(<DealerApplicationButton />);
    expect(
      screen.getByRole("button", { name: /start partner application/i }),
    ).toBeInTheDocument();
  });
});
