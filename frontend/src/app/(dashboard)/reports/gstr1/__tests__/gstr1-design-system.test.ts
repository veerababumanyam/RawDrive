import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../../../../../..");
const reportPagePath = path.join(
  frontendRoot,
  "src/app/(dashboard)/reports/gstr1/page.tsx",
);
const globalsPath = path.join(frontendRoot, "src/app/globals.css");

const read = (p: string): string => fs.readFileSync(p, "utf8");

describe("GSTR-1 report design-system contracts", () => {
  const source = read(reportPagePath);
  const css = read(globalsPath);

  it("uses shared dashboard primitives for page chrome and actions", () => {
    expect(source).toContain("@/components/ui/page-container");
    expect(source).toContain("@/components/ui/page-header");
    expect(source).toContain("@/components/ui/inline-alert");
    expect(source).toContain("@/components/ui/card");
    expect(source).toContain("@/components/ui/glass-button");
    expect(source).toContain("<PageContainer");
    expect(source).toContain("<PageHeader");
    expect(source).toContain("<InlineAlert");
    expect(source).toContain("<Card");
    expect(source).toContain("<GlassButton");
    expect(source).toContain("input-base");
  });

  it("keeps report-specific layout on token-backed CSS hooks", () => {
    [
      "gstr-year-field",
      "gstr-report-skeleton",
      "gstr-summary-grid",
      "gstr-metric-card",
      "gstr-filter-tabs",
      "gstr-table-panel",
      "gstr-empty-state",
      "gstr-pagination",
    ].forEach((className) => {
      expect(source).toContain(className);
      expect(css).toContain(`.${className}`);
    });

    expect(css).toContain('.glass-segmented-option[aria-selected="true"]');
  });

  it("does not reintroduce legacy local report styling", () => {
    [
      "input-field",
      "segmented-control-button",
      "border-error",
      "bg-error",
      "text-error",
      "bg-accent-primary",
      "hover:bg-accent-primary",
      "rounded-2xl border border-border-default bg-surface-raised",
      "rounded-lg border border-border-default",
      "min-h-[44px]",
    ].forEach((legacyClass) => {
      expect(source).not.toContain(legacyClass);
    });
  });
});
