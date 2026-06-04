import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../../..");
const documentsPagePath = path.join(
  repoRoot,
  "src/app/(dashboard)/crm/documents/page.tsx",
);

function readDocumentsPage(): string {
  return fs.readFileSync(documentsPagePath, "utf8");
}

describe("CRM documents page design-system adoption", () => {
  it("uses shared card and glass button primitives for the placeholder surface", () => {
    const source = readDocumentsPage();

    expect(source).toContain('from "@/components/ui/card"');
    expect(source).toContain("<Card");
    expect(source).toContain("<CardHeader");
    expect(source).toContain("<CardContent");
    expect(source).toContain("<CardFooter");
    expect(source).toContain('variant="panel"');
    expect(source).toContain(
      "glass-button glass-button--surface glass-button--md",
    );
    expect(source).toContain('from "@/components/icons"');
    expect(source).toContain("<Briefcase");
    expect(source).toContain("<CreditCard");
  });

  it("does not hand-compose the old card or CTA styles", () => {
    const source = readDocumentsPage();

    expect(source).not.toContain(
      "rounded-2xl border border-border-default bg-surface-raised",
    );
    expect(source).not.toContain(
      "inline-flex touch-min items-center rounded-xl border border-border-default",
    );
    expect(source).not.toContain("hover:bg-surface-sunken");
    expect(source).not.toContain('{" "}');
  });
});
