import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../../../../../..");
const freelancersPagePath = path.join(
  frontendRoot,
  "src/app/(dashboard)/marketplace/freelancers/page.tsx",
);
const globalsPath = path.join(frontendRoot, "src/app/globals.css");

const read = (p: string): string => fs.readFileSync(p, "utf8");

describe("freelancer marketplace design-system contracts", () => {
  const source = read(freelancersPagePath);
  const css = read(globalsPath);

  it("uses shared page, card, alert, badge, and button primitives", () => {
    expect(source).toContain("@/components/ui/page-container");
    expect(source).toContain("@/components/ui/page-header");
    expect(source).toContain("@/components/ui/card");
    expect(source).toContain("@/components/ui/glass-button");
    expect(source).toContain("@/components/ui/glass-icon-button");
    expect(source).toContain("@/components/ui/inline-alert");
    expect(source).toContain("@/components/ui/badge");
    expect(source).toContain("<PageContainer");
    expect(source).toContain("<PageHeader");
    expect(source).toContain("<Card");
    expect(source).toContain("<GlassButton");
    expect(source).toContain("<GlassIconButton");
    expect(source).toContain("<InlineAlert");
    expect(source).toContain("<Badge");
    expect(source).toContain("input-base");
    expect(source).toContain("publish-state-toggle");
    expect(source).toContain("glass-segmented");
  });

  it("keeps marketplace layout on token-backed CSS hooks", () => {
    [
      "marketplace-page-tabs",
      "marketplace-filter-panel",
      "marketplace-filter-control",
      "marketplace-card-grid",
      "marketplace-listing-card",
      "marketplace-empty-state",
      "marketplace-profile-card",
      "marketplace-date-chip",
      "marketplace-stat-card",
    ].forEach((className) => {
      expect(source).toContain(className);
      expect(css).toContain(`.${className}`);
    });
  });

  it("does not reintroduce legacy local marketplace styling", () => {
    [
      "btn-primary",
      "surface-button",
      "rounded-2xl",
      "bg-surface-raised",
      "bg-surface-sunken",
      "border-border-default",
      "segmented-control-button",
      "min-w-[",
      "h-24",
      "h-48",
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
