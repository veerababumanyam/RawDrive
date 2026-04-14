import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { Sparkline } from "../Sparkline";

describe("Sparkline", () => {
  it("renders an SVG with a polyline path covering all points", () => {
    const points = [
      { x: 0, y: 1 },
      { x: 1, y: 4 },
      { x: 2, y: 2 },
      { x: 3, y: 8 },
      { x: 4, y: 5 },
    ];
    const { container } = render(
      <Sparkline points={points} ariaLabel="viewer trend" />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("aria-label")).toBe("viewer trend");
    const path = container.querySelector("polyline");
    expect(path).toBeTruthy();
    const pts = path?.getAttribute("points") ?? "";
    // 5 coordinate pairs separated by whitespace
    expect(pts.trim().split(/\s+/).length).toBe(5);
  });

  it("renders a flat zero-line when points are empty", () => {
    const { container } = render(
      <Sparkline points={[]} ariaLabel="empty" />,
    );
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders a <title> describing the trend and is keyboard focusable", () => {
    const { container } = render(
      <Sparkline
        points={[
          { x: 0, y: 1 },
          { x: 1, y: 5 },
          { x: 2, y: 9 },
        ]}
        ariaLabel="viewers"
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("tabindex")).toBe("0");
    const title = container.querySelector("title");
    expect(title?.textContent).toMatch(/3 data points/);
    expect(title?.textContent).toMatch(/trending up/);
  });

  it("describes a downward trend in <title>", () => {
    const { container } = render(
      <Sparkline
        points={[
          { x: 0, y: 9 },
          { x: 1, y: 1 },
        ]}
        ariaLabel="errors"
      />,
    );
    expect(container.querySelector("title")?.textContent).toMatch(/trending down/);
  });

  it("uses the requested stroke token via CSS var class", () => {
    const { container } = render(
      <Sparkline points={[{ x: 0, y: 1 }, { x: 1, y: 2 }]} ariaLabel="t" strokeToken="success" />,
    );
    const polyline = container.querySelector("polyline");
    expect(polyline?.getAttribute("stroke")).toContain("var(--color-feedback-success");
  });
});
