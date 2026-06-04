import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../../../../..");
const packagesPagePath = path.join(
  frontendRoot,
  "src/app/(dashboard)/settings/packages/page.tsx",
);

describe("service packages page design system adoption", () => {
  const source = fs.readFileSync(packagesPagePath, "utf8");

  it("uses central surface, form, badge, and button primitives", () => {
    expect(source).toContain("@/components/ui/card");
    expect(source).toContain("@/components/ui/glass-button");
    expect(source).toContain("@/components/ui/badge");
    expect(source).toContain("input-base");
    expect(source).toContain("textarea-min-block");
    expect(source).toContain('variant="panel"');
    expect(source).toContain('variant="primary"');
    expect(source).toContain('variant="danger"');
  });

  it("does not reintroduce local package-page styling", () => {
    expect(source).not.toMatch(/<button\b/);

    [
      "input-field",
      "border-error",
      "bg-error",
      "text-error",
      "bg-accent-primary",
      "hover:bg-accent-primary",
      "rounded-2xl border border-border-default bg-surface-raised",
      "border border-dashed border-border-default",
      "min-h-[44px]",
    ].forEach((legacyClass) => {
      expect(source).not.toContain(legacyClass);
    });
  });
});
