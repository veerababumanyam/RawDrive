import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIDesignSuggest } from "../ai-design-suggest";

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: () => "token",
}));

describe("AIDesignSuggest", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an explicit empty result after a successful request with no suggestions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

    render(<AIDesignSuggest galleryId="gallery-1" onApply={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /suggest design/i }));

    await waitFor(() => {
      expect(screen.getByText(/No design suggestions are available/i)).toBeTruthy();
    });
  });

  it("shows an API error when suggestions fail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Gemini key is missing" }),
    } as Response);

    render(<AIDesignSuggest galleryId="gallery-1" onApply={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /suggest design/i }));

    await waitFor(() => {
      expect(screen.getByText("Gemini key is missing")).toBeTruthy();
    });
  });
});
