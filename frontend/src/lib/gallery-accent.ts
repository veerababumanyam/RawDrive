import type { CSSProperties } from "react";

/**
 * Resolves the accent colour for a public gallery and exposes it as a CSS
 * custom-property override so the studio's brand colour flows through the
 * design-token system instead of being hardcoded per element.
 *
 * Precedence (highest first):
 *   1. Per-gallery design override  (design.branding.brandColor)
 *   2. Per-gallery design theme     (design.theme.accentColor)
 *   3. Workspace studio branding    (branding.accent_color, when the tier can customise)
 *   4. none → fall through to the active theme's token default
 */

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

interface AccentInputs {
  design?: {
    theme?: { accentColor?: string | null } | null;
    branding?: { brandColor?: string | null } | null;
  } | null;
  branding?: { can_customize?: boolean; accent_color?: string | null } | null;
}

function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return HEX_RE.test(trimmed) ? trimmed : null;
}

export function resolveGalleryAccent({ design, branding }: AccentInputs): string | null {
  const candidates: Array<string | null | undefined> = [
    design?.branding?.brandColor,
    design?.theme?.accentColor,
    branding?.can_customize ? branding?.accent_color : null,
  ];
  for (const candidate of candidates) {
    const hex = normalizeHex(candidate);
    if (hex) return hex;
  }
  return null;
}

/**
 * Builds the inline style that overrides the accent token custom properties for
 * a public-gallery subtree. Returns undefined when there is no studio accent so
 * the wrapper keeps the theme default. `color-mix()` token derivations in
 * globals.css reference `--accent-primary`, so they adapt automatically.
 */
export function galleryAccentCssVars(accent: string | null): CSSProperties | undefined {
  if (!accent) return undefined;
  return {
    "--accent-default": accent,
    "--accent-primary": accent,
  } as CSSProperties;
}
