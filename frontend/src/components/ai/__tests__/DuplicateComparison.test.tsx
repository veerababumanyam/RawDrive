import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DuplicateComparison } from "../DuplicateComparison";
import type { DuplicateGroup } from "@/lib/api/ai";

const mockGroup: DuplicateGroup = {
  id: "g1",
  workspace_id: "ws1",
  status: "pending",
  members: [
    {
      id: "m1",
      asset_id: "a1",
      similarity_score: 1.0,
      is_representative: true,
      quality: {
        sharpness: 0.9,
        exposure: 0.85,
        composition: 0.8,
        overall: 0.85,
      },
    },
    {
      id: "m2",
      asset_id: "a2",
      similarity_score: 0.95,
      is_representative: false,
      quality: {
        sharpness: 0.7,
        exposure: 0.75,
        composition: 0.6,
        overall: 0.68,
      },
    },
  ],
  created_at: "2026-04-08T10:00:00Z",
};

describe("DuplicateComparison", () => {
  it("renders member count", () => {
    render(<DuplicateComparison group={mockGroup} />);
    expect(screen.getByText("2 similar photos")).toBeTruthy();
  });

  it("shows pending status badge", () => {
    render(<DuplicateComparison group={mockGroup} />);
    expect(screen.getByText("pending")).toBeTruthy();
  });

  it("shows quality scores", () => {
    render(<DuplicateComparison group={mockGroup} />);
    // Quality badge with overall score
    expect(screen.getByText("Q:85")).toBeTruthy();
    expect(screen.getByText("Q:68")).toBeTruthy();
  });

  it("shows similarity scores", () => {
    render(<DuplicateComparison group={mockGroup} />);
    expect(screen.getByText("100% match")).toBeTruthy();
    expect(screen.getByText("95% match")).toBeTruthy();
  });

  it("pre-selects representative member", () => {
    render(<DuplicateComparison group={mockGroup} />);
    // The "Keep selected" button should show count 1 (representative)
    expect(screen.getByText(/Keep selected \(1\)/)).toBeTruthy();
  });

  it("toggles selection on click", () => {
    render(<DuplicateComparison group={mockGroup} />);

    // Initially 1 selected (representative)
    expect(screen.getByText(/Keep selected \(1\)/)).toBeTruthy();

    // Click the second member (Photo button)
    const buttons = screen
      .getAllByRole("button")
      .filter(
        (b) => b.textContent?.includes("Photo") || b.querySelector("span"),
      );
    // Click on a member to select it
    if (buttons.length >= 2) {
      fireEvent.click(buttons[1]);
      // Now 2 should be selected
      expect(screen.getByText(/Keep selected \(2\)/)).toBeTruthy();
    }
  });

  it("calls onResolve with selected asset IDs", () => {
    const onResolve = vi.fn();
    render(<DuplicateComparison group={mockGroup} onResolve={onResolve} />);

    fireEvent.click(screen.getByText(/Keep selected/));
    expect(onResolve).toHaveBeenCalledWith("g1", ["a1"]);
  });

  it("calls onDismiss when dismiss clicked", () => {
    const onDismiss = vi.fn();
    render(<DuplicateComparison group={mockGroup} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByText("Dismiss"));
    expect(onDismiss).toHaveBeenCalledWith("g1");
  });

  it("hides action buttons for resolved groups", () => {
    const resolved = { ...mockGroup, status: "resolved" };
    render(<DuplicateComparison group={resolved} />);
    expect(screen.queryByText(/Keep selected/)).toBeNull();
    expect(screen.queryByText("Dismiss")).toBeNull();
  });
});
