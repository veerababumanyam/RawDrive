import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../../..");
const crmPagePath = path.join(repoRoot, "src/app/(dashboard)/crm/page.tsx");
const crmNavPath = path.join(
  repoRoot,
  "src/components/crm/crm-secondary-nav.tsx",
);
const globalsPath = path.join(repoRoot, "src/app/globals.css");

const read = (p: string): string => fs.readFileSync(p, "utf8");

describe("Studio CRM overview design-system contracts", () => {
  it("uses shared dashboard primitives instead of hand-rolled page chrome", () => {
    const source = read(crmPagePath);

    expect(source).toContain("<PageContainer");
    expect(source).toContain("<PageHeader");
    expect(source).toContain("<InlineAlert");
    expect(source).toContain("<Card");
    expect(source).toContain("glass-button glass-button--surface");
    expect(source).not.toContain(
      "rounded-2xl border border-border-default bg-surface-raised",
    );
  });

  it("keeps repeated CRM overview surfaces on token-backed CSS hooks", () => {
    const source = read(crmPagePath);
    const css = read(globalsPath);

    expect(source).toContain("crm-stat-card");
    expect(source).toContain("crm-overview-list-link");
    expect(source).toContain("crm-overview-skeleton");
    expect(css).toContain(".crm-stat-card");
    expect(css).toContain(".crm-overview-list-link");
    expect(css).toContain(".crm-overview-skeleton");
  });

  it("uses the shared glass segmented control for CRM section navigation", () => {
    const source = read(crmNavPath);

    expect(source).toContain("glass-segmented");
    expect(source).toContain("glass-segmented-option");
    expect(source).toContain("aria-current");
    expect(source).not.toContain("bg-surface-raised p-2");
  });
});
