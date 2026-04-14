import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { StatTile } from "../StatTile";

describe("StatTile", () => {
  it("renders label and value", () => {
    render(<StatTile label="Peak Viewers" value={1234} />);
    expect(screen.getByText("Peak Viewers")).toBeTruthy();
    expect(screen.getByText("1234")).toBeTruthy();
  });

  it("renders sublabel when provided", () => {
    render(<StatTile label="Chat" value="2.5/min" sublabel="last 10 min" />);
    expect(screen.getByText("last 10 min")).toBeTruthy();
  });

  it("applies tone styling via data attribute", () => {
    const { container } = render(
      <StatTile label="Errors" value={5} tone="danger" />,
    );
    const root = container.querySelector("[data-tone]");
    expect(root?.getAttribute("data-tone")).toBe("danger");
  });
});
