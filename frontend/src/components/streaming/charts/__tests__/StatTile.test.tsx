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

  it("exposes role=group with aria-labelledby binding label and value", () => {
    const { container } = render(
      <StatTile label="Peak Viewers" value={1234} />,
    );
    const group = container.querySelector("[role='group']");
    expect(group).toBeTruthy();
    const labelledBy = group?.getAttribute("aria-labelledby") ?? "";
    const ids = labelledBy.split(/\s+/).filter(Boolean);
    expect(ids.length).toBe(2);
    const labelEl = container.querySelector(`#${CSS.escape(ids[0])}`);
    const valueEl = container.querySelector(`#${CSS.escape(ids[1])}`);
    expect(labelEl?.textContent).toBe("Peak Viewers");
    expect(valueEl?.textContent).toBe("1234");
  });

  it("applies tone styling via data attribute", () => {
    const { container } = render(
      <StatTile label="Errors" value={5} tone="danger" />,
    );
    const root = container.querySelector("[data-tone]");
    expect(root?.getAttribute("data-tone")).toBe("danger");
  });
});
