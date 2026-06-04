import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../../../../../..");
const cameraRentalsPagePath = path.join(
  frontendRoot,
  "src/app/(dashboard)/marketplace/camera-rentals/page.tsx",
);
const globalsPath = path.join(frontendRoot, "src/app/globals.css");

const read = (p: string): string => fs.readFileSync(p, "utf8");

describe("camera rentals marketplace design-system contracts", () => {
  const source = read(cameraRentalsPagePath);
  const css = read(globalsPath);

  it("uses shared page, card, alert, badge, and button primitives", () => {
    expect(source).toContain("@/components/ui/page-container");
    expect(source).toContain("@/components/ui/page-header");
    expect(source).toContain("@/components/ui/card");
    expect(source).toContain("@/components/ui/glass-button");
    expect(source).toContain("@/components/ui/inline-alert");
    expect(source).toContain("@/components/ui/badge");
    expect(source).toContain("<PageContainer");
    expect(source).toContain("<PageHeader");
    expect(source).toContain("<Card");
    expect(source).toContain("<GlassButton");
    expect(source).toContain("<InlineAlert");
    expect(source).toContain("<Badge");
    expect(source).toContain("glass-button");
    expect(source).toContain("glass-segmented");
  });

  it("keeps rental layout on token-backed marketplace CSS hooks", () => {
    [
      "marketplace-page-tabs",
      "marketplace-category-tabs",
      "marketplace-card-grid",
      "marketplace-listing-card",
      "marketplace-listing-skeleton",
      "marketplace-empty-state",
      "marketplace-gear-card",
      "marketplace-gear-media",
      "marketplace-gear-row",
      "marketplace-action-row",
      "marketplace-confirm-inline",
      "marketplace-rate__unit",
    ].forEach((className) => {
      expect(source).toContain(className);
      expect(css).toContain(`.${className}`);
    });
  });

  it("does not reintroduce legacy local marketplace styling", () => {
    [
      "availabilityClasses",
      "btn-primary",
      "surface-button",
      "rounded-2xl",
      "rounded-xl",
      "bg-surface-raised",
      "bg-surface-sunken",
      "border-border-default",
      "segmented-control-button",
      "min-w-[",
      "h-40",
      "h-64",
      "h-28",
      "py-12",
      "animate-pulse",
      "border-feedback-error",
      "bg-feedback-error",
      "text-feedback-error",
    ].forEach((legacyClass) => {
      expect(source).not.toContain(legacyClass);
    });
  });
});
