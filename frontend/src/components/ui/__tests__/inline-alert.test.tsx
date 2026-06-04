import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InlineAlert } from "@/components/ui/inline-alert";

describe("InlineAlert", () => {
  it("defaults to the error variant with an assertive alert role", () => {
    render(<InlineAlert>Something failed</InlineAlert>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Something failed");
    expect(alert.className).toContain("border-feedback-error/30");
    expect(alert.className).toContain("bg-feedback-error/10");
    expect(alert.className).toContain("text-feedback-error");
  });

  it("announces success as a polite status, not an alert", () => {
    render(<InlineAlert variant="success">Saved</InlineAlert>);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Saved");
    expect(status.className).toContain("text-feedback-success");
  });

  it("uses only token classes, never arbitrary or primitive colors", () => {
    render(<InlineAlert variant="warning">Heads up</InlineAlert>);
    const node = screen.getByRole("alert");
    expect(node.className).not.toMatch(/\[[^\]]+\]/);
    expect(node.className).not.toMatch(/-(red|green|amber|yellow)-[0-9]/);
  });
});
