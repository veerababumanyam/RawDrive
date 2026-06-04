import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../../..");
const projectsPagePath = path.join(
  repoRoot,
  "src/app/(dashboard)/crm/projects/page.tsx",
);
const projectDetailPagePath = path.join(
  repoRoot,
  "src/app/(dashboard)/crm/projects/[id]/page.tsx",
);
const globalsPath = path.join(repoRoot, "src/app/globals.css");

const read = (filePath: string): string => fs.readFileSync(filePath, "utf8");

describe("CRM projects design-system adoption", () => {
  it("uses shared primitives on the project board", () => {
    const source = read(projectsPagePath);

    expect(source).toContain("<PageContainer");
    expect(source).toContain("<PageHeader");
    expect(source).toContain("<InlineAlert");
    expect(source).toContain("<GlassButton");
    expect(source).toContain("<Card");
    expect(source).toContain("input-base w-full text-sm");
    expect(source).toContain("crm-stat-card");
    expect(source).toContain("crm-project-card");
    expect(source).not.toContain("<button");
    expect(source).not.toContain(
      "rounded-2xl border border-border-default bg-surface-raised",
    );
    expect(source).not.toContain("bg-accent-primary px");
    expect(source).not.toContain("min-h-[44px]");
    expect(source).not.toContain("min-h-[88px]");
  });

  it("keeps the project detail page on shared CRM surfaces", () => {
    const source = read(projectDetailPagePath);

    expect(source).toContain("<PageContainer");
    expect(source).toContain("<PageHeader");
    expect(source).toContain("<InlineAlert");
    expect(source).toContain("<Card");
    expect(source).toContain("glass-button glass-button--surface");
    expect(source).toContain("crm-stat-card");
    expect(source).toContain("crm-overview-list-link");
    expect(source).not.toContain(
      "rounded-2xl border border-border-default bg-surface-raised",
    );
    expect(source).not.toContain('{" "}');
    expect(source).not.toContain("surface-button");
  });

  it("defines the project card hook in token-backed central CSS", () => {
    const css = read(globalsPath);

    expect(css).toContain(".crm-project-card");
    expect(css).toContain(".crm-project-card__metrics");
    expect(css).toContain("var(--surface-container-high)");
    expect(css).not.toContain(".status-badge--error");
  });
});
