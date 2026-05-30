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
 * F-041: hover states must use semantic tokens (feedback-error,
 *        feedback-success, accent-secondary) — NOT Tailwind color primitives
 *        (red-*, green-*, blue-*) which are absent from the theme color map
 *        and therefore do not adapt per theme.
 */

function classNamesFor(variant: Parameters<typeof GlassIconButton>[0]["variant"]) {
  const { getByRole, unmount } = render(
    <GlassIconButton variant={variant} label={`${variant} action`}>
      <svg />
    </GlassIconButton>,
  );
  const className = getByRole("button").className;
  unmount();
  return className;
}

const ALL_VARIANTS = ["glass", "solid", "ghost", "danger", "success", "accent"] as const;

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
      expect(className).not.toMatch(/\b(?:bg|border|text)-(?:red|green|blue)-\d/);
    },
  );

  it("danger hover uses the feedback-error token (matching its base/active)", () => {
    const className = classNamesFor("danger");
    expect(className).toContain("hover:bg-feedback-error/[0.25]");
    expect(className).toContain("hover:border-feedback-error/[0.35]");
  });

  it("success hover uses the feedback-success token (matching its base/active)", () => {
    const className = classNamesFor("success");
    expect(className).toContain("hover:bg-feedback-success/[0.25]");
    expect(className).toContain("hover:border-feedback-success/[0.35]");
  });

  it("accent hover uses the accent-secondary token (matching its base/active)", () => {
    const className = classNamesFor("accent");
    expect(className).toContain("hover:bg-accent-secondary/[0.25]");
    expect(className).toContain("hover:border-accent-secondary/[0.35]");
  });

  it("meets the WCAG 44px touch target at the default size", () => {
    const className = classNamesFor("glass");
    // md = h-11 w-11 = 44px
    expect(className).toContain("h-11");
    expect(className).toContain("w-11");
  });
});
