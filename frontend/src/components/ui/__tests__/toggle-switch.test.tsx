import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

describe("ToggleSwitch", () => {
  it("renders a token-backed accessible switch", () => {
    render(
      <ToggleSwitch
        checked={false}
        label="Public profile visibility"
        checkedLabel="Public"
        uncheckedLabel="Private"
      />,
    );

    const toggle = screen.getByRole("switch", {
      name: "Public profile visibility: Private",
    });

    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle.className).toContain("publish-state-toggle");
    expect(screen.getByText("Private")).toBeInTheDocument();
  });

  it("calls onCheckedChange with the next checked state", () => {
    const onCheckedChange = vi.fn();

    render(
      <ToggleSwitch
        checked={false}
        label="Public profile visibility"
        checkedLabel="Public"
        uncheckedLabel="Private"
        onCheckedChange={onCheckedChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Public profile visibility: Private",
      }),
    );

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
