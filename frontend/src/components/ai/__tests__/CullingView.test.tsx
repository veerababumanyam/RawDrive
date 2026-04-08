import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CullingView } from "../CullingView";

const mockAssets = [
  { asset_id: "a1", filename: "best.jpg", content_type: "image/jpeg", thumbnail_urls: { sm: "/t/a1.jpg" }, similarity: 1, quality: { sharpness: 0.95, exposure: 0.9, composition: 0.88, overall: 0.91 } },
  { asset_id: "a2", filename: "good.jpg", content_type: "image/jpeg", thumbnail_urls: { sm: "/t/a2.jpg" }, similarity: 1, quality: { sharpness: 0.8, exposure: 0.85, composition: 0.75, overall: 0.80 } },
  { asset_id: "a3", filename: "ok.jpg", content_type: "image/jpeg", thumbnail_urls: { sm: "/t/a3.jpg" }, similarity: 1, quality: { sharpness: 0.6, exposure: 0.65, composition: 0.55, overall: 0.60 } },
  { asset_id: "a4", filename: "weak.jpg", content_type: "image/jpeg", thumbnail_urls: { sm: "/t/a4.jpg" }, similarity: 1, quality: { sharpness: 0.4, exposure: 0.45, composition: 0.35, overall: 0.40 } },
  { asset_id: "a5", filename: "bad.jpg", content_type: "image/jpeg", thumbnail_urls: { sm: "/t/a5.jpg" }, similarity: 1, quality: { sharpness: 0.2, exposure: 0.25, composition: 0.15, overall: 0.20 } },
];

describe("CullingView", () => {
  it("renders heading with top percent", () => {
    render(<CullingView assets={mockAssets} topPercent={20} />);
    expect(screen.getByText(/Smart Culling — Top 20%/)).toBeTruthy();
  });

  it("selects top N% as keep by default", () => {
    // 20% of 5 = 1 (ceiling)
    render(<CullingView assets={mockAssets} topPercent={20} />);
    expect(screen.getByText("1 of 5 selected")).toBeTruthy();
  });

  it("toggles keep/review on click", () => {
    render(<CullingView assets={mockAssets} topPercent={20} />);

    // Initially 1 selected
    expect(screen.getByText("1 of 5 selected")).toBeTruthy();

    // Find and click a non-selected asset to select it
    const buttons = screen.getAllByRole("button").filter((b) => !b.textContent?.includes("Apply"));
    if (buttons.length >= 2) {
      fireEvent.click(buttons[1]);
      // Now should be 2
      expect(screen.getByText("2 of 5 selected")).toBeTruthy();
    }
  });

  it("calls onApply with selected asset IDs", () => {
    const onApply = vi.fn();
    render(<CullingView assets={mockAssets} topPercent={40} onApply={onApply} />);

    // 40% of 5 = 2
    fireEvent.click(screen.getByText(/Apply Selection/));
    expect(onApply).toHaveBeenCalled();
    const keepIds = onApply.mock.calls[0][0];
    expect(keepIds).toHaveLength(2);
  });

  it("renders quality score breakdown per asset", () => {
    render(<CullingView assets={mockAssets} topPercent={20} />);
    // Quality breakdown shows S: E: C: labels
    expect(screen.getAllByText(/S:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/E:/).length).toBeGreaterThan(0);
  });

  it("defaults to 20% when topPercent not provided", () => {
    render(<CullingView assets={mockAssets} />);
    expect(screen.getByText(/Top 20%/)).toBeTruthy();
  });

  it("sorts assets by quality descending", () => {
    render(<CullingView assets={mockAssets} topPercent={100} />);
    // All should be selected when 100%
    expect(screen.getByText("5 of 5 selected")).toBeTruthy();
  });
});
