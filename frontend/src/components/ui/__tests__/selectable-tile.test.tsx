import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SelectableTile } from "@/components/ui/selectable-tile";

describe("SelectableTile", () => {
  it("renders a token-backed pressed option", () => {
    render(
      <SelectableTile
        selected
        title="Classic Wedding"
        description="Centered, timeless"
      />,
    );

    const tile = screen.getByRole("button", { name: /Classic Wedding/i });

    expect(tile).toHaveAttribute("aria-pressed", "true");
    expect(tile).toHaveAttribute("data-state", "selected");
    expect(tile.className).toContain("selectable-tile");
    expect(screen.getByText("Centered, timeless")).toBeInTheDocument();
  });

  it("keeps the caller click handler intact", () => {
    const onClick = vi.fn();

    render(
      <SelectableTile
        selected={false}
        title="Luxury Dark"
        description="Reception-ready"
        onClick={onClick}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Luxury Dark/i }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders optional media inside the shared tile frame", () => {
    render(
      <SelectableTile
        selected={false}
        media={<span data-testid="tile-media">Preview</span>}
        title="Cover photo"
        description="Current cover"
      />,
    );

    expect(screen.getByTestId("tile-media")).toBeInTheDocument();
    expect(
      document.querySelector(".selectable-tile__media"),
    ).toBeInTheDocument();
  });
});
