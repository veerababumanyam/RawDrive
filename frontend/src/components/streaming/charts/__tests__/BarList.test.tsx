import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { BarList } from "../BarList";

describe("BarList", () => {
  it("renders one row per item with label + value", () => {
    render(
      <BarList
        ariaLabel="conversion by source"
        items={[
          { label: "QR", value: 40 },
          { label: "WhatsApp", value: 20 },
          { label: "Email", value: 10 },
        ]}
      />,
    );
    expect(screen.getByText("QR")).toBeTruthy();
    expect(screen.getByText("WhatsApp")).toBeTruthy();
    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
  });

  it("sizes bars proportionally to the largest value", () => {
    const { container } = render(
      <BarList
        ariaLabel="x"
        items={[
          { label: "A", value: 100 },
          { label: "B", value: 50 },
          { label: "C", value: 25 },
        ]}
      />,
    );
    const bars = container.querySelectorAll("[data-testid='barlist-fill']");
    expect(bars.length).toBe(3);
    const widths = Array.from(bars).map((b) =>
      parseFloat((b as HTMLElement).style.width),
    );
    expect(widths[0]).toBe(100);
    expect(widths[1]).toBe(50);
    expect(widths[2]).toBe(25);
  });

  it("exposes role=list with focusable listitem rows labelled label: value", () => {
    const { container } = render(
      <BarList
        ariaLabel="sources"
        items={[
          { label: "QR", value: 40, hint: "scans" },
          { label: "WhatsApp", value: 20 },
        ]}
      />,
    );
    const list = container.querySelector("ul");
    expect(list?.getAttribute("role")).toBe("list");
    const items = container.querySelectorAll("li");
    expect(items.length).toBe(2);
    items.forEach((li) => {
      expect(li.getAttribute("role")).toBe("listitem");
      expect(li.getAttribute("tabindex")).toBe("0");
    });
    expect(items[0].getAttribute("aria-label")).toMatch(/QR: 40/);
    expect(items[1].getAttribute("aria-label")).toMatch(/WhatsApp: 20/);
  });

  it("respects maxItems", () => {
    render(
      <BarList
        ariaLabel="x"
        maxItems={2}
        items={[
          { label: "A", value: 1 },
          { label: "B", value: 2 },
          { label: "C", value: 3 },
        ]}
      />,
    );
    expect(screen.queryByText("A")).toBeNull();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("C")).toBeTruthy();
  });
});
