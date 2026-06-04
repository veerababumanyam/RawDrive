import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../..");
const pipelinePath = path.join(
  repoRoot,
  "src/components/crm/inquiry-pipeline.tsx",
);
const pagePath = path.join(
  repoRoot,
  "src/app/(dashboard)/crm/inquiries/page.tsx",
);

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

describe("Inquiry pipeline design-system adoption", () => {
  it("uses central CRM surface, input, button, icon, and modal primitives", () => {
    const source = readSource(pipelinePath);

    expect(source).toContain('from "@/components/ui/glass-button"');
    expect(source).toContain('from "@/components/ui/glass-icon-button"');
    expect(source).toContain('from "@/components/icons"');
    expect(source).toContain("surface-panel");
    expect(source).toContain("glass-card");
    expect(source).toContain("input-base");
    expect(source).toContain("segmented-control-button");
    expect(source).toContain("modal-backdrop");
    expect(source).toContain("z-modal-layer");
    expect(source).toContain('label="List view"');
    expect(source).toContain('label="Kanban view"');
    expect(source).toContain('label="Close inquiry detail"');
  });

  it("keeps selected controls away from pre-token ad hoc class patterns", () => {
    const source = readSource(pipelinePath);

    expect(source).not.toContain("border-error");
    expect(source).not.toContain("bg-error");
    expect(source).not.toContain("text-error");
    expect(source).not.toContain("bg-accent-primary px");
    expect(source).not.toContain("hover:bg-accent-primary");
    expect(source).not.toContain("hover:border-accent/");
    expect(source).not.toContain("min-w-[280px]");
    expect(source).not.toContain("Creatingâ");
    expect(source).not.toContain("â‚¹");
    expect(source).not.toContain("✕");
  });

  it("uses the shared segmented control classes for page-level inquiry tabs", () => {
    const source = readSource(pagePath);

    expect(source).toContain('role="tablist"');
    expect(source).toContain("segmented-control-button");
    expect(source).not.toContain(
      "bg-surface-raised text-text-primary shadow-sm",
    );
  });
});
