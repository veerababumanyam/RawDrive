import { describe, expect, it } from "vitest";
import { galleryAccentCssVars, resolveGalleryAccent } from "../gallery-accent";

describe("resolveGalleryAccent", () => {
  it("prefers the per-gallery design brand colour", () => {
    const accent = resolveGalleryAccent({
      design: { branding: { brandColor: "#ff8800" }, theme: { accentColor: "#112233" } },
      branding: { can_customize: true, accent_color: "#445566" },
    });
    expect(accent).toBe("#ff8800");
  });

  it("falls back to the design theme accent when no brand colour", () => {
    const accent = resolveGalleryAccent({
      design: { theme: { accentColor: "#112233" } },
      branding: { can_customize: true, accent_color: "#445566" },
    });
    expect(accent).toBe("#112233");
  });

  it("falls back to the workspace accent when the design has none", () => {
    const accent = resolveGalleryAccent({
      design: null,
      branding: { can_customize: true, accent_color: "#445566" },
    });
    expect(accent).toBe("#445566");
  });

  it("ignores the workspace accent when the tier cannot customise", () => {
    const accent = resolveGalleryAccent({
      design: null,
      branding: { can_customize: false, accent_color: "#445566" },
    });
    expect(accent).toBeNull();
  });

  it("ignores malformed hex values", () => {
    expect(
      resolveGalleryAccent({ design: { branding: { brandColor: "not-a-color" } }, branding: null }),
    ).toBeNull();
  });

  it("returns null when nothing is configured", () => {
    expect(resolveGalleryAccent({ design: null, branding: null })).toBeNull();
  });
});

describe("galleryAccentCssVars", () => {
  it("returns undefined when there is no accent", () => {
    expect(galleryAccentCssVars(null)).toBeUndefined();
  });

  it("overrides both accent custom properties", () => {
    expect(galleryAccentCssVars("#ff8800")).toEqual({
      "--accent-default": "#ff8800",
      "--accent-primary": "#ff8800",
    });
  });
});
