import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";

/**
 * Regression tests for F-040 and F-041.
 *
 * F-040: GlassIconButton must NOT use Tailwind `dark:` modifiers. Tailwind v4
 *        has no `@custom-variant dark` defined in globals.css, so `dark:`
 *        resolves to @media (prefers-color-scheme: dark) and tracks the OS,
 *        NOT the in-app data-theme toggle (liquid-glass / liquid-glass-dark /
 *        midnight). Theming must be token/data-theme driven.
 *
 * F-041: hover states must use semantic token-backed component classes,
 *        not Tailwind color primitives or arbitrary opacity/color utilities.
 */

function classNamesFor(
  variant: Parameters<typeof GlassIconButton>[0]["variant"],
) {
  const { getByRole, unmount } = render(
    <GlassIconButton variant={variant} label={`${variant} action`}>
      <svg />
    </GlassIconButton>,
  );
  const className = getByRole("button").className;
  unmount();
  return className;
}

const ALL_VARIANTS = [
  "glass",
  "solid",
  "ghost",
  "danger",
  "success",
  "accent",
] as const;

describe("GlassIconButton — theme-aware token usage", () => {
  it("renders an accessible button with the provided label", () => {
    const { getByRole } = render(
      <GlassIconButton label="Close dialog">
        <svg />
      </GlassIconButton>,
    );
    const btn = getByRole("button");
    expect(btn).toHaveAttribute("aria-label", "Close dialog");
  });

  // F-040 — no OS-bound dark: modifiers on any variant
  it.each(ALL_VARIANTS)(
    "variant %s uses no Tailwind `dark:` modifier (theming is data-theme driven, not prefers-color-scheme)",
    (variant) => {
      const className = classNamesFor(variant);
      expect(className).not.toMatch(/(^|\s|:)dark:/);
    },
  );

  // F-041 — no Tailwind color primitives on any variant
  it.each(ALL_VARIANTS)(
    "variant %s uses no Tailwind color primitives (red-/green-/blue-)",
    (variant) => {
      const className = classNamesFor(variant);
      expect(className).not.toMatch(
        /\b(?:bg|border|text)-(?:red|green|blue)-\d/,
      );
    },
  );

  it("danger variant uses the token-backed danger component class", () => {
    const className = classNamesFor("danger");
    expect(className).toContain("glass-icon-button--danger");
  });

  it("success variant uses the token-backed success component class", () => {
    const className = classNamesFor("success");
    expect(className).toContain("glass-icon-button--success");
  });

  it("accent variant uses the token-backed accent component class", () => {
    const className = classNamesFor("accent");
    expect(className).toContain("glass-icon-button--accent");
  });

  it("meets the WCAG 44px touch target at the default size", () => {
    const className = classNamesFor("glass");
    // md = 44px through the component token CSS.
    expect(className).toContain("glass-icon-button--md");
  });
});
