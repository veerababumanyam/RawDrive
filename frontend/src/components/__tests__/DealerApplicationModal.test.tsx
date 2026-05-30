import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import DealerApplicationModal from "../DealerApplicationModal";

/**
 * Regression test for F-044.
 *
 * The modal's close button was a raw <button> at h-8 w-8 (32px) rendering a
 * "✕" text glyph. 32px is below the 44px WCAG 2.1 AA / project touch-target
 * floor, and ad-hoc icon <button>s are forbidden — icon actions must use
 * GlassIconButton (which provides a >=44px hit area at size="md" plus the
 * required accessible label).
 *
 * These tests assert:
 *   - the close control is GlassIconButton at the WCAG 44px size (h-11 w-11),
 *   - it never reintroduces the sub-44px h-8/w-8 hit area,
 *   - it carries an accessible name and still invokes onClose.
 */

function stubStatesFetch() {
  return vi.fn(async () =>
    ({ ok: true, status: 200, json: async () => ({ states: [] }) }) as unknown as Response,
  );
}

describe("DealerApplicationModal — F-044 touch target", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when closed", () => {
    vi.stubGlobal("fetch", stubStatesFetch());
    const { container } = render(<DealerApplicationModal open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders an accessible close control", () => {
    vi.stubGlobal("fetch", stubStatesFetch());
    render(<DealerApplicationModal open onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("close control meets the 44px WCAG touch target and is not the old 32px hit area", () => {
    vi.stubGlobal("fetch", stubStatesFetch());
    render(<DealerApplicationModal open onClose={() => {}} />);
    const close = screen.getByRole("button", { name: "Close" });
    // GlassIconButton size="md" => h-11 w-11 (44px)
    expect(close.className).toContain("h-11");
    expect(close.className).toContain("w-11");
    // The failing baseline was h-8 w-8 (32px) — it must not return.
    expect(close.className).not.toMatch(/\bh-8\b/);
    expect(close.className).not.toMatch(/\bw-8\b/);
  });

  it("close control uses no Tailwind primitive color scales or arbitrary values", () => {
    vi.stubGlobal("fetch", stubStatesFetch());
    render(<DealerApplicationModal open onClose={() => {}} />);
    const close = screen.getByRole("button", { name: "Close" });
    expect(close.className).not.toMatch(/\b(?:bg|text|border)-(?:neutral|gray)-\d/);
    expect(close.className).not.toMatch(/\[#[0-9a-fA-F]{3,8}\]/);
  });

  it("clicking the close control invokes onClose", () => {
    vi.stubGlobal("fetch", stubStatesFetch());
    const onClose = vi.fn();
    render(<DealerApplicationModal open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
